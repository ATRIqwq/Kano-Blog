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
    $$('.nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === h))
    if (h === 'editor') renderEditor()
    else if (h === 'page-editor') renderPageEditor()
    else if (h === 'tags') renderTags()
    else if (h === 'categories') renderCategories()
    else if (h === 'links') renderLinks()
    else if (h === 'pages') renderPages()
    else if (h === 'widgets') renderWidgets()
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

    bindPreviewTabs()
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
        ${type === 'categories' ? '<button class="btn ghost sm" data-act="cat-covers">🖼️ 分类封面</button>' : ''}
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

  /** 公共：压缩并上传图片到 OSS，返回公开 URL */
  async function uploadToOSS(file) {
    const cfg = window.ADMIN_CONFIG
    if (!cfg.ossSignUrl) throw new Error('未配置 ossSignUrl（admin/js/config.js），封面上传不可用')
    toast('🖼️ 压缩中…')
    const blob = await compressImage(file)
    // 步骤 1：获取签名（走 Cloudflare Worker）
    toast('🔐 获取上传凭证…')
    let data
    try {
      const res = await fetch(cfg.ossSignUrl + '/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, type: blob.type })
      })
      data = await res.json()
      if (!res.ok || !data.uploadUrl) throw new Error(data.error || '签名失败')
    } catch (e) {
      throw new Error('获取签名失败：请检查 ossSignUrl 地址与网络（大陆访问 workers.dev 可能不稳定）：' + (e && e.message))
    }
    // 步骤 2：直传 OSS（浏览器跨域，依赖 bucket CORS 配置）
    toast('⬆️ 上传中…')
    let up
    try {
      // 上传请求的 Content-Type 必须与 Worker 签名时使用的值一致（blob.type，如 image/webp），
      // 否则 OSS 验签返回 SignatureDoesNotMatch
      const headers = {}
      if (blob.type) headers['Content-Type'] = blob.type
      up = await fetch(data.uploadUrl, { method: 'PUT', body: blob, headers })
    } catch (e) {
      throw new Error('OSS 直传失败：请检查 bucket 的跨域设置 CORS（操作单 B-2）：' + (e && e.message))
    }
    if (!up.ok) {
      const errText = await up.text().catch(() => '')
      throw new Error('OSS 返回 HTTP ' + up.status + '（检查 bucket 公共读与子账号权限）：' + errText.slice(0, 120))
    }
    return data.publicUrl
  }

  async function handleCoverFile(input) {
    const file = input.files && input.files[0]
    input.value = ''
    if (!file) return
    try {
      const url = await uploadToOSS(file)
      $('#f-cover').value = url
      const pv = $('#cover-preview')
      pv.style.display = 'block'
      pv.innerHTML = `<img src="${esc(url)}" alt="封面预览"><span>已上传：${esc(url)}（原图已在前端压缩为 WebP）</span>`
      toast('✅ 封面上传成功，已填入封面')
    } catch (e) {
      toast('上传失败：' + e.message, false)
    }
  }

  // ===== 分类封面管理（首页磁贴 categoryBar，写回 _config.yml）=====
  async function renderCategoryCovers() {
    let cfgText
    try {
      const f = await API.readFile('_config.yml')
      cfgText = f.content
    } catch (e) {
      return toast('读取 _config.yml 失败：' + e.message, false)
    }
    const items = parseCategoryBar(cfgText)
    const seen = new Set()
    const rows = items.map(it => {
      seen.add(it.descr)
      return catCoverRow(it.descr, it.cover)
    })
    // 补充：有文章但未配置磁贴的分类
    Object.keys(state.catsMap).forEach(c => {
      if (!seen.has(c)) rows.push(catCoverRow(c, ''))
    })
    $('#page-content').innerHTML = `
      <div class="edit-head">
        <button class="btn ghost sm" data-act="back">‹ 返回分类列表</button>
        <span class="file-name">分类磁贴封面（_config.yml → categoryBar.message，显示于首页）</span>
        <div class="spacer"></div>
        <button class="btn primary" data-act="cc-save">💾 保存封面</button>
      </div>
      <div class="card cat-cover-panel">${rows.join('')}</div>
      <p class="footnote">⬆️ 上传的图片自动压缩后存到阿里云 OSS；保存后精准写回 _config.yml（保留注释格式），1–3 分钟后站点自动更新。</p>`
  }

  function catCoverRow(descr, cover) {
    return `<div class="cat-cover-row" data-descr="${esc(descr)}">
      <img class="cover-thumb" src="${esc(cover || '')}" onerror="this.style.visibility='hidden'">
      <div class="cc-info">
        <div class="cc-name">${esc(descr)}</div>
        <input class="cc-url" value="${esc(cover || '')}" placeholder="封面 URL（留空 = 不设置）">
      </div>
      <button class="btn ghost sm" data-act="cc-upload">⬆️ 上传</button>
      <input type="file" class="cc-file" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
    </div>`
  }

  async function handleCcFile(input) {
    const file = input.files && input.files[0]
    input.value = ''
    if (!file) return
    const row = input.closest('.cat-cover-row')
    try {
      const url = await uploadToOSS(file)
      row.querySelector('.cc-url').value = url
      const img = row.querySelector('img.cover-thumb')
      if (img) { img.src = url; img.style.visibility = 'visible' }
      toast('✅ 封面已上传，点击「💾 保存封面」生效')
    } catch (e) {
      toast('上传失败：' + e.message, false)
    }
  }

  /** 解析 _config.yml 的 categoryBar.message */
  function parseCategoryBar(text) {
    const lines = text.split('\n')
    const items = []
    let inMessage = false, msgIndent = -1, cur = null
    for (const line of lines) {
      const msg = line.match(/^(\s*)message:/)
      if (msg) { inMessage = true; msgIndent = msg[1].length; cur = null; continue }
      if (!inMessage) continue
      const indent = (line.match(/^\s*/) || [''])[0].length
      if (line.trim() && indent <= msgIndent && !/^\s*#/.test(line)) { inMessage = false; continue }
      const d = line.match(/^\s*-\s*descr:\s*(.*?)\s*$/)
      if (d) { if (cur) items.push(cur); cur = { descr: d[1], cover: '' }; continue }
      if (cur) {
        const c = line.match(/^\s*cover:\s*(.*?)\s*$/)
        if (c) cur.cover = c[1]
      }
    }
    if (cur) items.push(cur)
    return items
  }

  /** 精准替换 _config.yml 中某分类的 cover 值（保留注释与其他格式） */
  function updateCategoryCoverInYaml(text, descr, newCover) {
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const d = lines[i].match(/^(\s*)-\s*descr:\s*(.*?)\s*$/)
      if (d && d[2] === descr) {
        const indent = d[1]
        for (let j = i + 1; j < lines.length; j++) {
          if (/^\s*-\s*descr:/.test(lines[j])) break
          if (/^\s*cover:/.test(lines[j])) {
            lines[j] = lines[j].replace(/^\s*cover:.*/, indent + '  cover: ' + (newCover || ''))
            return lines.join('\n')
          }
        }
        if (newCover) {
          lines.splice(i + 1, 0, indent + '  cover: ' + newCover)
          return lines.join('\n')
        }
        return text
      }
    }
    return null
  }

  async function saveCategoryCovers() {
    const updates = $$('.cat-cover-row')
      .map(r => ({ descr: r.dataset.descr, url: r.querySelector('.cc-url').value.trim() }))
      .filter(u => u.url)
    if (!updates.length) return toast('没有要保存的封面（至少填一个 URL 或上传一张图）', false)
    try {
      const f = await API.readFile('_config.yml')
      let text = f.content
      let changed = false
      updates.forEach(u => {
        const t = updateCategoryCoverInYaml(text, u.descr, u.url)
        if (t) { text = t; changed = true }
      })
      if (!changed) return toast('未找到匹配的分类，未做修改', false)
      await API.writeFile('_config.yml', text, 'config: update category covers in categoryBar', f.sha)
      toast('✅ 分类封面已保存，站点 1–3 分钟内自动更新')
      go('categories')
    } catch (e) { toast('保存失败：' + e.message, false) }
  }

  // ===== 友链管理（source/_data/link.yml）=====
  async function renderLinks() {
    let text
    try { text = (await API.readFile('source/_data/link.yml')).content }
    catch (e) { return toast('读取 link.yml 失败：' + e.message, false) }
    let data
    try { data = jsyaml.load(text, { schema: jsyaml.CORE_SCHEMA }) || [] }
    catch (e) { return toast('link.yml 解析失败：' + e.message, false) }
    if (!Array.isArray(data)) data = []
    state.links = data
    renderLinksForm()
  }

  function renderLinksForm() {
    const groups = (state.links || []).map((g, gi) => `
      <div class="card link-group" data-gi="${gi}">
        <div class="link-group-head">
          <input class="lg-name" value="${esc(g.class_name || '')}" placeholder="分组名，如 0.推荐网站🍔">
          <input class="lg-desc" value="${esc(g.class_desc || '')}" placeholder="分组描述">
          <button class="btn ghost sm del" data-act="lg-del">🗑️ 删组</button>
        </div>
        <div class="link-items">
          ${(g.link_list || []).map((l, li) => linkRow(gi, li, l)).join('')}
        </div>
        <button class="btn ghost sm" data-act="li-add" data-gi="${gi}">＋ 添加友链</button>
      </div>`).join('')
    $('#page-content').innerHTML = `
      <div class="edit-head">
        <button class="btn ghost sm" data-act="back">‹ 返回</button>
        <span class="file-name">友链管理（source/_data/link.yml）</span>
        <div class="spacer"></div>
        <button class="btn ghost sm" data-act="lg-add">＋ 添加分组</button>
        <button class="btn primary" data-act="links-save">💾 保存友链</button>
      </div>
      <div class="links-wrap">${groups || '<p class="empty">暂无友链，点「＋ 添加分组」开始</p>'}</div>
      <p class="footnote">保存后写回 link.yml 并触发自动构建；名称/链接为必填，头像与站点截图可填 URL（可先用文章封面的 ⬆️ 上传得到 OSS 链接）。</p>`
  }

  function linkRow(gi, li, l) {
    return `<div class="link-row" data-gi="${gi}" data-li="${li}">
      <div class="lr-grid">
        <input class="lr-name" value="${esc(l.name || '')}" placeholder="名称 *">
        <input class="lr-link" value="${esc(l.link || '')}" placeholder="链接 *">
        <input class="lr-avatar" value="${esc(l.avatar || '')}" placeholder="头像 URL">
        <input class="lr-descr" value="${esc(l.descr || '')}" placeholder="描述">
        <input class="lr-siteshot" value="${esc(l.siteshot || '')}" placeholder="站点截图 URL">
      </div>
      <button class="btn ghost sm del" data-act="li-del">✕ 删除</button>
    </div>`
  }

  function collectLinks() {
    const groups = []
    $$('.link-group').forEach(gEl => {
      const g = {
        class_name: gEl.querySelector('.lg-name').value.trim(),
        class_desc: gEl.querySelector('.lg-desc').value.trim(),
        link_list: []
      }
      gEl.querySelectorAll('.link-row').forEach(r => {
        const name = r.querySelector('.lr-name').value.trim()
        const link = r.querySelector('.lr-link').value.trim()
        if (!name && !link) return
        const item = { name, link }
        const av = r.querySelector('.lr-avatar').value.trim(); if (av) item.avatar = av
        const de = r.querySelector('.lr-descr').value.trim(); if (de) item.descr = de
        const ss = r.querySelector('.lr-siteshot').value.trim(); if (ss) item.siteshot = ss
        g.link_list.push(item)
      })
      if (g.class_name || g.link_list.length) groups.push(g)
    })
    return groups
  }

  async function saveLinks() {
    const groups = collectLinks()
    if (!groups.length) return toast('至少保留一个分组或友链', false)
    const text = jsyaml.dump(groups, { schema: jsyaml.CORE_SCHEMA, lineWidth: 200 })
    try {
      const f = await API.readFile('source/_data/link.yml')
      await API.writeFile('source/_data/link.yml', text, 'data: update friend links', f.sha)
      toast('✅ 友链已保存，站点 1–3 分钟内自动更新')
      go('links')
    } catch (e) { toast('保存失败：' + e.message, false) }
  }

  // ===== 自定义页面管理（source/box|life|personal|site|social）=====
  async function renderPages() {
    const tree = await API.getTree()
    const dirs = ['box', 'life', 'personal', 'site', 'social']
    const files = tree
      .filter(t => t.type === 'blob' && t.path.endsWith('/index.md'))
      .filter(t => dirs.some(d => t.path.startsWith('source/' + d + '/')))
      .sort((a, b) => a.path.localeCompare(b.path))
    const rows = files.map(f => {
      const parts = f.path.split('/')
      return `<tr>
        <td><strong>${esc(parts[1])}</strong><span class="muted"> / ${esc(parts[2] || '')}</span></td>
        <td class="muted small">${esc(f.path)}</td>
        <td class="ops"><button class="btn sm ghost" data-act="page-edit" data-path="${esc(f.path)}">✏️ 编辑</button></td>
      </tr>`
    }).join('')
    $('#page-content').innerHTML = `
      <div class="edit-head">
        <button class="btn ghost sm" data-act="back">‹ 返回</button>
        <span class="file-name">自定义页面（source/ 下 box · life · personal · site · social）</span>
      </div>
      <div class="card table-card">
        <table><thead><tr><th>模块</th><th>文件路径</th><th>操作</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3" class="empty">未发现自定义页面</td></tr>'}</tbody></table>
      </div>`
  }

  async function renderPageEditor() {
    const params = new URLSearchParams(location.hash.split('?')[1] || '')
    const path = params.get('path')
    if (!path) return go('pages')
    let f
    try { f = await API.readFile(path) }
    catch (e) { return toast('读取页面失败：' + e.message, false) }
    const { data, content } = FM.parse(f.content)
    const fields = Object.keys(data).map(k => {
      const v = typeof data[k] === 'object' ? JSON.stringify(data[k]) : data[k]
      return `<div class="field"><label>${esc(k)}</label><input class="pf-key" data-k="${esc(k)}" value="${esc(v)}"></div>`
    }).join('')
    $('#page-content').innerHTML = `
      <div class="edit-head">
        <button class="btn ghost sm" data-act="pages">‹ 返回页面列表</button>
        <span class="file-name">${esc(path)}</span>
        <div class="spacer"></div>
        <button class="btn ghost sm" data-act="pf-add">＋ 字段</button>
        <button class="btn primary" data-act="page-save" data-path="${esc(path)}">💾 保存</button>
      </div>
      <div class="edit-body">
        <div class="panel card">
          <h3>Front Matter</h3>
          ${fields}
          <div id="pf-extra"></div>
          <div class="field"><label>abbrlink 等未知字段将原样保留</label></div>
        </div>
        <div class="editor-card card">
          <div class="editor-tabs">
            <button class="active" data-tab="edit">编辑 Markdown</button>
            <button data-tab="preview">预览</button>
          </div>
          <textarea id="f-content" class="editor-textarea" spellcheck="false">${esc(content)}</textarea>
          <div class="preview-pane" id="preview-pane" style="display:none"></div>
        </div>
      </div>`
    bindPreviewTabs()
  }

  /** 编辑器预览切换（文章/页面共用） */
  function bindPreviewTabs() {
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

  function parseFmValue(s) {
    const t = s.trim()
    if (t === 'true') return true
    if (t === 'false') return false
    if (/^-?\d+$/.test(t)) return parseInt(t, 10)
    if (/^-?\d+\.\d+$/.test(t)) return parseFloat(t)
    try { return JSON.parse(t) } catch (e) { return s }
  }

  function addPageField() {
    const box = $('#pf-extra')
    const div = document.createElement('div')
    div.className = 'field'
    div.innerHTML = `<label>新字段名</label><div class="row"><input class="pf-new-key" placeholder="如 description"><input class="pf-new-val" placeholder="值"></div>`
    box.appendChild(div)
  }

  async function savePage(path) {
    const data = {}
    $$('.pf-key').forEach(inp => { data[inp.dataset.k] = parseFmValue(inp.value) })
    $$('.pf-new-key').forEach(inp => {
      const k = inp.value.trim()
      if (k) data[k] = parseFmValue(inp.closest('.field').querySelector('.pf-new-val').value)
    })
    const content = $('#f-content').value
    const text = FM.build(data, content)
    try {
      const f = await API.readFile(path)
      await API.writeFile(path, text, 'page: update ' + path, f.sha)
      toast('✅ 页面已保存，站点 1–3 分钟内自动更新')
      go('pages')
    } catch (e) { toast('保存失败：' + e.message, false) }
  }

  // ===== 侧栏组件管理（source/_data/widget.yml，文本编辑 + YAML 校验）=====
  async function renderWidgets() {
    let text
    try { text = (await API.readFile('source/_data/widget.yml')).content }
    catch (e) { return toast('读取 widget.yml 失败：' + e.message, false) }
    $('#page-content').innerHTML = `
      <div class="edit-head">
        <button class="btn ghost sm" data-act="back">‹ 返回</button>
        <span class="file-name">侧栏组件（source/_data/widget.yml）</span>
        <div class="spacer"></div>
        <button class="btn primary" data-act="widgets-save">💾 保存</button>
      </div>
      <div class="card widget-edit">
        <textarea id="widget-text" class="widget-textarea" spellcheck="false">${esc(text)}</textarea>
      </div>
      <p class="footnote">⚠️ 保存前会做 YAML 语法校验，语法错误将阻止提交（避免站点构建失败）。格式说明见文件内注释：top 为所有页面显示，bottom 为 sticky 区域。</p>`
  }

  async function saveWidgets() {
    const text = $('#widget-text').value
    try { jsyaml.load(text, { schema: jsyaml.CORE_SCHEMA }) }
    catch (e) { return toast('YAML 语法错误，未提交：' + e.message, false) }
    try {
      const f = await API.readFile('source/_data/widget.yml')
      await API.writeFile('source/_data/widget.yml', text, 'data: update sidebar widgets', f.sha)
      toast('✅ 侧栏组件已保存，站点 1–3 分钟内自动更新')
      go('widgets')
    } catch (e) { toast('保存失败：' + e.message, false) }
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
    if (e.target.closest('[data-act="cat-covers"]')) { renderCategoryCovers(); return }
    if (e.target.closest('[data-act="cc-upload"]')) {
      e.target.closest('.cat-cover-row').querySelector('.cc-file').click()
      return
    }
    if (e.target.closest('[data-act="cc-save"]')) { saveCategoryCovers(); return }
    // 友链管理
    if (e.target.closest('[data-act="lg-add"]')) { state.links.push({ class_name: '', class_desc: '', link_list: [] }); renderLinksForm(); return }
    if (e.target.closest('[data-act="lg-del"]')) {
      const gi = +e.target.closest('.link-group').dataset.gi
      if (confirm('删除该分组及组内友链？')) { state.links.splice(gi, 1); renderLinksForm() }
      return
    }
    if (e.target.closest('[data-act="li-add"]')) {
      const gi = +e.target.closest('[data-act="li-add"]').dataset.gi
      const g = state.links[gi]
      if (g) { (g.link_list = g.link_list || []).push({}); renderLinksForm() }
      return
    }
    if (e.target.closest('[data-act="li-del"]')) {
      const r = e.target.closest('.link-row')
      const gi = +r.dataset.gi, li = +r.dataset.li
      if (confirm('删除这条友链？')) { state.links[gi].link_list.splice(li, 1); renderLinksForm() }
      return
    }
    if (e.target.closest('[data-act="links-save"]')) { saveLinks(); return }
    // 页面管理
    if (e.target.closest('[data-act="page-edit"]')) {
      go('page-editor?path=' + encodeURIComponent(e.target.closest('[data-act="page-edit"]').dataset.path))
      return
    }
    if (e.target.closest('[data-act="page-save"]')) { savePage(e.target.closest('[data-act="page-save"]').dataset.path); return }
    if (e.target.closest('[data-act="pages"]')) { go('pages'); return }
    if (e.target.closest('[data-act="pf-add"]')) { addPageField(); return }
    // 侧栏组件
    if (e.target.closest('[data-act="widgets-save"]')) { saveWidgets(); return }
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
    const t = e.target
    if (!t || !t.files || !t.files[0]) return
    if (t.id === 'cover-file') handleCoverFile(t)
    else if (t.classList.contains('cc-file')) handleCcFile(t)
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
