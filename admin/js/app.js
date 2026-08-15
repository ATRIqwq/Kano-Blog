/**
 * 在线管理后台 · 应用主逻辑（第一版）
 * 视图：登录 / 文章列表 / 文章编辑器 / 标签管理 / 分类管理
 */
;(function () {
  const CFG = window.ADMIN_CONFIG
  const API = window.GitHubAPI
  const FM = window.FrontMatter
  const MD = window.MarkdownPreview

  // ===== 全局状态 =====
  const state = {
    authed: false,
    posts: [],          // [{ path, dir, name, data, content, sha, title, tags, categories }]
    tagsMap: {},        // { name: { count, posts: [] } }
    catsMap: {},
    editing: null,      // 编辑器状态 { path, dir, sha, isNew }
    filter: { status: 'all', q: '' },
    loading: false
  }

  const $ = sel => document.querySelector(sel)
  const $$ = sel => Array.from(document.querySelectorAll(sel))

  // ===== 工具 =====
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }
  function toast(msg, ok = true) {
    const t = $('#toast')
    t.textContent = msg
    t.className = 'toast show ' + (ok ? 'ok' : 'err')
    clearTimeout(t._timer)
    t._timer = setTimeout(() => t.className = 'toast', 2600)
  }
  function todayStr() { return new Date().toISOString().slice(0, 10) }

  // ===== 路由 =====
  function route() {
    const raw = (location.hash || '#/list').replace(/^#\//, '')
    const h = raw.split('?')[0]   // 去掉 query 参数，如 #/editor?path=xxx → editor
    if (!state.authed) { showView('login'); return }
    showView('main')
    if (h === 'editor') renderEditor()
    else if (h === 'tags') renderTags()
    else if (h === 'categories') renderCategories()
    else renderList()
  }
  function showView(name) {
    $('#view-login').style.display = name === 'login' ? 'flex' : 'none'
    $('#view-main').style.display = name === 'main' ? 'block' : 'none'
  }
  function go(h) { location.hash = '#/' + h }

  // ===== 登录 =====
  async function doLogin() {
    const token = $('#login-token').value.trim()
    if (!token) return toast('请输入 GitHub 访问令牌', false)
    API.setToken(token)
    try {
      await API.verifyRepo()
      state.authed = true
      toast('登录成功，正在加载文章…')
      await loadAll()
      go('list')
    } catch (e) {
      API.clearToken()
      toast('登录失败：' + e.message, false)
    }
  }
  function doLogout() {
    API.clearToken(); state.authed = false
    state.posts = []
    go('login')
  }

  // ===== 数据加载 =====
  async function loadAll() {
    const tree = await API.getTree()
    const mdFiles = tree
      .filter(t => t.type === 'blob' && t.path.endsWith('.md'))
      .filter(t => t.path.startsWith(CFG.postsDir + '/') || t.path.startsWith(CFG.draftsDir + '/'))
    const posts = []
    // 逐个读取（文章量少，直接并行）
    const results = await Promise.all(mdFiles.map(f => API.readFile(f.path).catch(() => null)))
    results.forEach(r => {
      if (!r) return
      const { data, content } = FM.parse(r.content)
      const isDraft = r.path.startsWith(CFG.draftsDir + '/')
      posts.push({
        path: r.path,
        dir: isDraft ? 'draft' : 'post',
        name: r.path.split('/').pop(),
        data, content,
        sha: r.sha,
        title: data.title || r.path.split('/').pop().replace(/\.md$/, ''),
        date: data.date || '',
        tags: FM.toArray(data.tags),
        categories: FM.toArray(data.categories),
        updated: data.updated || ''
      })
    })
    posts.sort((a, b) => String(b.date).localeCompare(String(a.date)))
    state.posts = posts
    buildAggregates()
  }
  function buildAggregates() {
    const tagsMap = {}, catsMap = {}
    state.posts.forEach(p => {
      p.tags.forEach(t => {
        tagsMap[t] = tagsMap[t] || { count: 0, posts: [] }
        tagsMap[t].count++; tagsMap[t].posts.push(p.name)
      })
      p.categories.forEach(c => {
        catsMap[c] = catsMap[c] || { count: 0, posts: [] }
        catsMap[c].count++; catsMap[c].posts.push(p.name)
      })
    })
    state.tagsMap = tagsMap
    state.catsMap = catsMap
  }

  // ===== 自定义分类/标签池（localStorage）=====
  // Hexo 中分类/标签是文章的聚合属性；"新增"通过待用池实现：
  // 新分类先加入池中供编辑器自动补全，被文章使用后才真正出现在站点
  function getCustom(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]') } catch (e) { return [] }
  }
  function addCustom(key, name) {
    const list = getCustom(key)
    if (!list.includes(name)) { list.push(name); localStorage.setItem(key, JSON.stringify(list)) }
  }
  function removeCustom(key, name) {
    localStorage.setItem(key, JSON.stringify(getCustom(key).filter(x => x !== name)))
  }

  function addMeta(type) {
    const storeKey = type === 'tags' ? 'admin_custom_tags' : 'admin_custom_categories'
    const label = type === 'tags' ? '标签' : '分类'
    const input = prompt(`新增${label}名称：`)
    if (input == null) return
    const name = input.trim()
    if (!name) return toast('名称不能为空', false)
    const pool = type === 'tags' ? state.tagsMap : state.catsMap
    if (pool[name]) return toast(`「${name}」已存在`, false)
    if (getCustom(storeKey).includes(name)) return toast(`「${name}」已在待用列表`, false)
    addCustom(storeKey, name)
    toast(`已添加待用${label}「${name}」：新建文章并选择它后，${label}即会出现在站点`)
    type === 'tags' ? renderTags() : renderCategories()
  }

  // ===== 文章列表 =====
  function renderList() {
    const f = state.filter
    let list = state.posts
    if (f.status === 'published') list = list.filter(p => p.dir === 'post')
    if (f.status === 'draft') list = list.filter(p => p.dir === 'draft')
    if (f.q) {
      const q = f.q.toLowerCase()
      list = list.filter(p => p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q))
    }
    const rows = list.map(p => `
      <tr>
        <td>${p.dir === 'draft' ? '<span class="badge draft">草稿</span>' : '<span class="badge pub">已发布</span>'}</td>
        <td><a class="post-title-link" href="#/editor?path=${encodeURIComponent(p.path)}">${esc(p.title)}</a></td>
        <td>${esc(p.categories.join(' / ')) || '—'}</td>
        <td>${p.tags.map(t => `<span class="tag-chip">${esc(t)}</span>`).join('') || '—'}</td>
        <td class="muted">${esc(String(p.date).slice(0, 10))}</td>
        <td class="ops">
          <button class="icon-btn" title="编辑" data-act="edit" data-path="${esc(p.path)}">✏️</button>
          <button class="icon-btn" title="${p.dir === 'draft' ? '发布上线' : '下线为草稿'}" data-act="${p.dir === 'draft' ? 'publish' : 'unpublish'}" data-path="${esc(p.path)}">${p.dir === 'draft' ? '🚀' : '📥'}</button>
          <button class="icon-btn del" title="删除" data-act="delete" data-path="${esc(p.path)}">🗑️</button>
        </td>
      </tr>`).join('')

    $('#page-content').innerHTML = `
      <div class="toolbar">
        <div class="seg">
          <button class="${f.status === 'all' ? 'active' : ''}" data-act="f-status" data-v="all">全部 (${state.posts.length})</button>
          <button class="${f.status === 'published' ? 'active' : ''}" data-act="f-status" data-v="published">已发布 (${state.posts.filter(p => p.dir === 'post').length})</button>
          <button class="${f.status === 'draft' ? 'active' : ''}" data-act="f-status" data-v="draft">草稿 (${state.posts.filter(p => p.dir === 'draft').length})</button>
        </div>
        <div class="search"><input id="search-input" placeholder="搜索标题、内容…" value="${esc(f.q)}"></div>
        <button class="btn primary" data-act="new">＋ 新建文章</button>
      </div>
      <div class="card table-card">
        <table>
          <thead><tr><th>状态</th><th>标题</th><th>分类</th><th>标签</th><th>日期</th><th>操作</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6" class="empty">暂无文章</td></tr>'}</tbody>
        </table>
      </div>
      <p class="footnote">保存后提交 commit，GitHub Actions 将在 1–3 分钟内自动重新构建并发布站点</p>`
  }

  // ===== 文章编辑器 =====
  function renderEditor() {
    const params = new URLSearchParams(location.hash.split('?')[1] || '')
    const path = params.get('path')
    const post = path ? state.posts.find(p => p.path === path) : null
    state.editing = post ? { path: post.path, sha: post.sha, dir: post.dir, isNew: false } : { isNew: true, dir: 'post' }

    const d = post ? post.data : {}
    const isNew = !post
    const tagsVal = post ? post.tags.join(', ') : ''
    const catsVal = post ? post.categories.join(', ') : ''
    const allCats = Array.from(new Set([...Object.keys(state.catsMap), ...getCustom('admin_custom_categories')]))
    const allTags = Array.from(new Set([...Object.keys(state.tagsMap), ...getCustom('admin_custom_tags')]))

    $('#page-content').innerHTML = `
      <div class="edit-wrap">
        <div class="edit-head">
          <button class="btn ghost sm" data-act="back">‹ 返回列表</button>
          <span class="file-name">${isNew ? '（新文章）' : esc(post.name)}</span>
          <div class="spacer"></div>
          <button class="btn ghost" data-act="save" data-draft="0">💾 保存修改</button>
          ${isNew ? `<button class="btn ghost" data-act="save" data-draft="1">📝 存为草稿</button>` : ''}
          <button class="btn green" data-act="save-publish">🚀 ${isNew ? '发布' : '保存并发布'}</button>
        </div>
        <div class="edit-body">
          <div class="panel card">
            <h3>基本信息</h3>
            <div class="field"><label>标题 *</label><input id="f-title" value="${esc(d.title || '')}"></div>
            <div class="row">
              <div class="field"><label>日期</label><input id="f-date" value="${esc(d.date || todayStr())}"></div>
              <div class="field"><label>分类</label><input id="f-categories" list="cat-list" value="${esc(catsVal)}" placeholder="逗号分隔 / 可新建"></div>
            </div>
            <datalist id="cat-list">${allCats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
            <div class="field"><label>标签（逗号分隔，可新建）</label><input id="f-tags" list="tag-list" value="${esc(tagsVal)}" placeholder="如 Java, Session"></div>
            <datalist id="tag-list">${allTags.map(t => `<option value="${esc(t)}">`).join('')}</datalist>
            <div class="field">
              <label>封面图 URL（可 ⬆️ 上传本地图：自动压缩并填入）</label>
              <div class="cover-row">
                <input id="f-cover" value="${esc(d.cover || '')}">
                <button type="button" class="btn ghost sm" id="upload-cover-btn" title="上传本地图片到阿里云 OSS（需配置 ossSignUrl）">⬆️ 上传</button>
              </div>
              <input id="cover-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
              <div id="cover-preview" class="cover-preview" style="display:none"></div>
            </div>
            <div class="field"><label>摘要 description</label><textarea id="f-description" rows="2">${esc(d.description || '')}</textarea></div>
            <h3>主题扩展</h3>
            <div class="row">
              <div class="field"><label>置顶 sticky</label><input id="f-sticky" value="${esc(d.sticky != null ? d.sticky : '')}"></div>
              <div class="field"><label>swiper_index</label><input id="f-swiper" value="${esc(d.swiper_index != null ? d.swiper_index : '')}"></div>
            </div>
            <div class="field"><label>加密密码 password（hexo-blog-encrypt）</label><input id="f-password" value="${esc(d.password || '')}" placeholder="留空 = 不加密"></div>
            <h3>链接（系统锁定）</h3>
            <div class="lock">🔗 abbrlink：<b>${esc(d.abbrlink || '（新建后由插件生成）')}</b><span>（修改会导致已发布链接失效，故不可编辑）</span></div>
          </div>
          <div class="editor-card card">
            <div class="editor-tabs">
              <button class="active" data-tab="edit">编辑 Markdown</button>
              <button data-tab="preview">预览</button>
            </div>
            <textarea id="f-content" class="editor-textarea" spellcheck="false">${esc(post ? post.content : '')}</textarea>
            <div class="preview-pane" id="preview-pane" style="display:none"></div>
          </div>
        </div>
      </div>`

    // 预览切换
    $$('.editor-tabs button').forEach(b => b.addEventListener('click', () => {
      $$('.editor-tabs button').forEach(x => x.classList.remove('active'))
      b.classList.add('active')
      const isPrev = b.dataset.tab === 'preview'
      $('#f-content').style.display = isPrev ? 'none' : 'block'
      $('#preview-pane').style.display = isPrev ? 'block' : 'none'
      if (isPrev) $('#preview-pane').innerHTML = MD.render($('#f-content').value)
    }))
    $('#f-content').addEventListener('input', () => {
      if ($('#preview-pane').style.display === 'block') {
        $('#preview-pane').innerHTML = MD.render($('#f-content').value)
      }
    })
  }

  function collectForm(isDraft) {
    const e = state.editing
    const old = e.isNew ? {} : (state.posts.find(p => p.path === e.path) || {}).data || {}
    const data = {}
    // 保留原 front matter 中的未知字段（abbrlink、swiper_index、mathjax 等）
    Object.keys(old).forEach(k => { data[k] = old[k] })
    data.title = $('#f-title').value.trim()
    if (!data.title) throw new Error('标题不能为空')
    data.date = $('#f-date').value.trim() || todayStr()
    data.categories = FM.fromArray($('#f-categories').value.split(',').map(s => s.trim()))
    data.tags = FM.fromArray($('#f-tags').value.split(',').map(s => s.trim()))
    if ($('#f-cover').value.trim()) data.cover = $('#f-cover').value.trim()
    if ($('#f-description').value.trim()) data.description = $('#f-description').value.trim()
    if ($('#f-sticky').value.trim()) data.sticky = $('#f-sticky').value.trim()
    if ($('#f-swiper').value.trim()) data.swiper_index = $('#f-swiper').value.trim()
    if ($('#f-password').value.trim()) data.password = $('#f-password').value.trim()
    data.updated = new Date().toISOString().slice(0, 19).replace('T', ' ')
    return data
  }

  async function saveArticle(isDraft) {
    let data
    try { data = collectForm() } catch (e) { return toast(e.message, false) }
    const e = state.editing
    const content = $('#f-content').value
    const fileText = FM.build(data, content)
    const dir = isDraft || e.isNew === false && e.dir === 'draft' ? CFG.draftsDir : CFG.postsDir
    const name = e.isNew ? FM.makeFileName(data.title, data.date) : e.path.split('/').pop()
    const path = dir + '/' + name
    const verb = e.isNew ? 'create' : 'update'
    const msg = `${verb}: ${data.title}${e.isNew ? (isDraft ? ' (draft)' : '') : ''}`
    try {
      await API.writeFile(path, fileText, msg, e.isNew ? undefined : e.sha)
      toast('✅ 已提交：' + msg + '（站点 1–3 分钟内自动更新）')
      await loadAll()
      go('list')
    } catch (err) {
      toast('保存失败：' + err.message, false)
    }
  }

  // ===== 标签 / 分类 =====
  function renderTags() {
    const custom = getCustom('admin_custom_tags')
    const list = Object.entries(state.tagsMap)
    custom.forEach(c => { if (!state.tagsMap[c]) list.push([c, { count: 0, posts: [] }]) })
    list.sort((a, b) => b[1].count - a[1].count)
    renderMetaPage('tags', list, '标签')
  }
  function renderCategories() {
    const custom = getCustom('admin_custom_categories')
    const list = Object.entries(state.catsMap)
    custom.forEach(c => { if (!state.catsMap[c]) list.push([c, { count: 0, posts: [] }]) })
    list.sort((a, b) => b[1].count - a[1].count)
    renderMetaPage('categories', list, '分类')
  }
  function renderMetaPage(type, list, label) {
    $('#page-content').innerHTML = `
      <div class="stat-row">
        <div class="stat-card"><div class="num">${list.length}</div><div class="lbl">${label}总数</div></div>
        <div class="stat-card"><div class="num">${state.posts.length}</div><div class="lbl">覆盖文章数</div></div>
      </div>
      <div class="toolbar">
        <div class="search"><input id="meta-search" placeholder="搜索${label}…"></div>
        <button class="btn primary sm" data-act="meta-add" data-type="${type}">＋ 新增${label}</button>
        <button class="btn ghost sm" data-act="back">‹ 返回文章列表</button>
      </div>
      <div class="card table-card">
        <table>
          <thead><tr><th>${label}名</th><th>文章数</th><th>包含文章</th><th>操作</th></tr></thead>
          <tbody>${list.map(([name, v]) => `
            <tr>
              <td><span class="tag-chip meta-name">${esc(name)}</span></td>
              <td>${v.count === 0 ? '<span class="badge draft">待使用</span>' : v.count}</td>
              <td class="muted small">${v.count === 0 ? '（暂无文章使用，已在待用列表）' : esc(v.posts.join('、').slice(0, 60))}</td>
              <td class="ops">
                <button class="icon-btn" title="重命名" data-act="meta-rename" data-type="${type}" data-name="${esc(name)}">✏️</button>
                <button class="icon-btn del" title="删除" data-act="meta-delete" data-type="${type}" data-name="${esc(name)}">🗑️</button>
              </td>
            </tr>`).join('') || '<tr><td colspan="4" class="empty">暂无' + label + '</td></tr>'}
          </tbody>
        </table>
      </div>
      <p class="footnote">重命名 / 删除通过 Git Data API 一次性 commit 批量修改受影响文章</p>`
    $('#meta-search').addEventListener('input', e => {
      const q = e.target.value.toLowerCase()
      $$('.table-card tbody tr').forEach(tr => {
        tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none'
      })
    })
  }

  /** 重命名 / 删除标签或分类：遍历文章批量修改 → 一次 commit */
  async function renameMeta(type, oldName) {
    const key = type === 'tags' ? 'tags' : 'categories'
    const storeKey = type === 'tags' ? 'admin_custom_tags' : 'admin_custom_categories'
    const label = type === 'tags' ? '标签' : '分类'
    const newName = prompt(`将「${oldName}」重命名为：`, oldName)
    if (newName == null || newName.trim() === '' || newName.trim() === oldName) return
    const finalName = newName.trim()
    const changes = []
    state.posts.forEach(p => {
      const arr = FM.toArray(p.data[key])
      const idx = arr.indexOf(oldName)
      if (idx !== -1) {
        arr[idx] = finalName
        p.data[key] = FM.fromArray(arr)
        changes.push({ path: p.path, content: FM.build(p.data, p.content) })
      }
    })
    // 无文章使用：仅同步待用池
    if (!changes.length) {
      if (getCustom(storeKey).includes(oldName)) {
        removeCustom(storeKey, oldName)
        addCustom(storeKey, finalName)
        toast(`待用${label}已由「${oldName}」改为「${finalName}」`)
        type === 'tags' ? renderTags() : renderCategories()
      } else {
        toast(`没有文章使用「${oldName}」，无需重命名`, false)
      }
      return
    }
    if (!confirm(`将影响 ${changes.length} 篇文章，确认一次性提交修改？`)) return
    try {
      await API.commitChanges(changes, `rename ${key.slice(0, -1)}: ${oldName} → ${finalName}`)
      removeCustom(storeKey, oldName)
      addCustom(storeKey, finalName)
      toast('✅ 重命名已提交，站点 1–3 分钟内自动更新')
      await loadAll(); route()
    } catch (e) { toast('操作失败：' + e.message, false) }
  }
  async function deleteMeta(type, name) {
    const key = type === 'tags' ? 'tags' : 'categories'
    const storeKey = type === 'tags' ? 'admin_custom_tags' : 'admin_custom_categories'
    const label = type === 'tags' ? '标签' : '分类'
    const affected = state.posts.filter(p => FM.toArray(p.data[key]).includes(name))
    // 无文章使用：仅从待用池移除（若有）
    if (!affected.length) {
      if (getCustom(storeKey).includes(name)) {
        removeCustom(storeKey, name)
        toast(`已从待用列表移除「${name}」`)
        type === 'tags' ? renderTags() : renderCategories()
      } else {
        toast(`没有文章使用「${name}」，无需删除`, false)
      }
      return
    }
    if (!confirm(`将从 ${affected.length} 篇文章中移除「${name}」，确认提交？`)) return
    const changes = affected.map(p => {
      const arr = FM.toArray(p.data[key]).filter(x => x !== name)
      p.data[key] = FM.fromArray(arr)
      return { path: p.path, content: FM.build(p.data, p.content) }
    })
    try {
      await API.commitChanges(changes, `remove ${key.slice(0, -1)}: ${name}`)
      removeCustom(storeKey, name)
      toast('✅ 已移除，站点 1–3 分钟内自动更新')
      await loadAll(); route()
    } catch (e) { toast('操作失败：' + e.message, false) }
  }

  // ===== 封面图上传（阿里云 OSS，前端压缩 + 直传）=====
  async function compressImage(file, maxWidth = 1200, quality = 0.82) {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxWidth / bitmap.width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality))
  }

  async function handleCoverFile(input) {
    const file = input.files && input.files[0]
    input.value = ''
    if (!file) return
    const cfg = window.ADMIN_CONFIG
    if (!cfg.ossSignUrl) return toast('未配置 ossSignUrl（admin/js/config.js），封面上传不可用', false)
    try {
      toast('🖼️ 压缩中…')
      const blob = await compressImage(file)
      toast('🔐 获取上传凭证…')
      const res = await fetch(cfg.ossSignUrl + '/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, type: blob.type })
      })
      const data = await res.json()
      if (!res.ok || !data.uploadUrl) throw new Error(data.error || '签名失败')
      toast('⬆️ 上传中…')
      // 签名时 Content-Type 为空，此处不得携带 Content-Type 头
      const up = await fetch(data.uploadUrl, { method: 'PUT', body: blob })
      if (!up.ok) throw new Error('上传失败 HTTP ' + up.status)
      const url = data.publicUrl
      $('#f-cover').value = url
      const pv = $('#cover-preview')
      pv.style.display = 'block'
      pv.innerHTML = `<img src="${esc(url)}" alt="封面预览"><span>已上传：${esc(url)}（原图已在前端压缩为 WebP）</span>`
      toast('✅ 封面上传成功，已填入封面')
    } catch (e) {
      toast('上传失败：' + e.message, false)
    }
  }

  // ===== 文章操作（发布/下线/删除） =====
  async function publishArticle(path) {
    const p = state.posts.find(x => x.path === path)
    if (!p) return
    const newPath = CFG.postsDir + '/' + p.name
    try {
      await API.writeFile(newPath, FM.build(p.data, p.content), 'publish: ' + p.title)
      await API.deleteFile(path, p.sha, 'publish: ' + p.title)
      toast('✅ 已发布，站点 1–3 分钟内自动更新')
      await loadAll(); route()
    } catch (e) { toast('发布失败：' + e.message, false) }
  }
  async function unpublishArticle(path) {
    const p = state.posts.find(x => x.path === path)
    if (!p) return
    const newPath = CFG.draftsDir + '/' + p.name
    try {
      await API.writeFile(newPath, FM.build(p.data, p.content), 'unpublish: ' + p.title)
      await API.deleteFile(path, p.sha, 'unpublish: ' + p.title)
      toast('✅ 已下线为草稿')
      await loadAll(); route()
    } catch (e) { toast('操作失败：' + e.message, false) }
  }
  async function deleteArticle(path) {
    const p = state.posts.find(x => x.path === path)
    if (!p) return
    if (!confirm(`确认删除「${p.title}」？\n（文件将从仓库删除，可通过 Git 提交历史恢复）`)) return
    try {
      await API.deleteFile(path, p.sha, 'delete: ' + p.title)
      toast('✅ 已删除（Git 历史可恢复）')
      await loadAll(); route()
    } catch (e) { toast('删除失败：' + e.message, false) }
  }

  // ===== 事件委托 =====
  document.addEventListener('click', e => {
    if (e.target.closest('#upload-cover-btn')) {
      const cfg = window.ADMIN_CONFIG
      if (!cfg.ossSignUrl) return toast('未配置 ossSignUrl（admin/js/config.js），封面上传不可用', false)
      $('#cover-file').click()
      return
    }
    const btn = e.target.closest('[data-act]')
    if (!btn) return
    const act = btn.dataset.act
    if (act === 'f-status') { state.filter.status = btn.dataset.v; renderList() }
    else if (act === 'new') go('editor')
    else if (act === 'back') go('list')
    else if (act === 'edit') go('editor?path=' + encodeURIComponent(btn.dataset.path))
    else if (act === 'publish') publishArticle(btn.dataset.path)
    else if (act === 'unpublish') unpublishArticle(btn.dataset.path)
    else if (act === 'delete') deleteArticle(btn.dataset.path)
    else if (act === 'save') saveArticle(btn.dataset.draft === '1')
    else if (act === 'save-publish') saveArticle(false)
    else if (act === 'meta-add') addMeta(btn.dataset.type)
    else if (act === 'meta-rename') renameMeta(btn.dataset.type, btn.dataset.name)
    else if (act === 'meta-delete') deleteMeta(btn.dataset.type, btn.dataset.name)
  })
  $('#search-input') && $('#search-input').addEventListener('input', e => {
    // 输入防抖由 renderList 在 keyup 重绘会丢焦点，改用直接过滤已渲染行
    const q = e.target.value.toLowerCase()
    $$('.table-card tbody tr').forEach(tr => {
      tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none'
    })
  })
  document.addEventListener('change', e => {
    if (e.target && e.target.id === 'cover-file') handleCoverFile(e.target)
  })

  // ===== 初始化 =====
  $('#login-btn').addEventListener('click', doLogin)
  $('#login-token').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin() })
  $('#logout-btn').addEventListener('click', doLogout)
  window.addEventListener('hashchange', route)

  // 已登录则直接进入
  if (API.getToken()) {
    API.verifyRepo().then(() => { state.authed = true; return loadAll() }).then(route).catch(() => { API.clearToken(); showView('login') })
  } else {
    showView('login')
  }
})()
