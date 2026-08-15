/**
 * GitHub REST API 封装（第一版）
 * 依赖 window.ADMIN_CONFIG
 */
;(function (global) {
  const CFG = () => global.ADMIN_CONFIG

  const api = {
    _token: localStorage.getItem('admin_token') || '',

    setToken(t) { this._token = t; localStorage.setItem('admin_token', t) },
    getToken() { return this._token },
    clearToken() { this._token = ''; localStorage.removeItem('admin_token') },

    async request(path, options = {}) {
      const headers = {
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
      if (this._token) headers['Authorization'] = 'Bearer ' + this._token
      const res = await fetch('https://api.github.com' + path, { ...options, headers })
      if (!res.ok) {
        let msg = 'HTTP ' + res.status
        try {
          const j = await res.json()
          msg = (j.message || '') + (j.documentation_url ? '（详见文档）' : '')
        } catch (e) { /* ignore */ }
        const err = new Error(msg)
        err.status = res.status
        throw err
      }
      if (res.status === 204) return null
      return res.json()
    },

    /** 校验令牌并返回仓库信息 */
    async verifyRepo() {
      const { owner, repo } = CFG()
      return this.request('/repos/' + owner + '/' + repo)
    },

    /** 获取整棵文件树（recursive） */
    async getTree() {
      const { owner, repo, branch } = CFG()
      const data = await this.request('/repos/' + owner + '/' + repo + '/git/trees/' + branch + '?recursive=1')
      return data.tree || []
    },

    /** 读取文件，返回 { path, content, sha }（content 已解码为 UTF-8 文本） */
    async readFile(path) {
      const { owner, repo, branch } = CFG()
      const data = await this.request('/repos/' + owner + '/' + repo + '/contents/' + encodePath(path) + '?ref=' + branch)
      return { path, content: b64ToUtf8(data.content), sha: data.sha }
    },

    /** 写入文件（新建或更新），返回 API 响应 */
    async writeFile(path, content, message, sha) {
      const { owner, repo, branch } = CFG()
      const body = { message, content: utf8ToB64(content), branch }
      if (sha) body.sha = sha
      return this.request('/repos/' + owner + '/' + repo + '/contents/' + encodePath(path), {
        method: 'PUT', body: JSON.stringify(body)
      })
    },

    /** 删除文件 */
    async deleteFile(path, sha, message) {
      const { owner, repo, branch } = CFG()
      return this.request('/repos/' + owner + '/' + repo + '/contents/' + encodePath(path), {
        method: 'DELETE',
        body: JSON.stringify({ message, sha, branch })
      })
    },

    /**
     * 批量修改：通过 Git Data API 一次 commit 原子完成多个文件变更
     * @param changes [{ path, content }] 变更后的文件
     * @param message 提交说明
     */
    async commitChanges(changes, message) {
      const { owner, repo, branch } = CFG()
      // 1. 当前 head commit
      const ref = await this.request('/repos/' + owner + '/' + repo + '/git/ref/heads/' + branch)
      const headCommit = await this.request('/repos/' + owner + '/' + repo + '/git/commits/' + ref.object.sha)
      // 2. 为每个文件创建 blob
      const treeItems = []
      for (const c of changes) {
        const blob = await this.request('/repos/' + owner + '/' + repo + '/git/blobs', {
          method: 'POST',
          body: JSON.stringify({ content: c.content, encoding: 'utf-8' })
        })
        treeItems.push({ path: c.path, mode: '100644', type: 'blob', sha: blob.sha })
      }
      // 3. 基于原树创建新树
      const tree = await this.request('/repos/' + owner + '/' + repo + '/git/trees', {
        method: 'POST',
        body: JSON.stringify({ base_tree: headCommit.tree.sha, tree: treeItems })
      })
      // 4. 创建 commit
      const commit = await this.request('/repos/' + owner + '/' + repo + '/git/commits', {
        method: 'POST',
        body: JSON.stringify({ message, tree: tree.sha, parents: [headCommit.sha] })
      })
      // 5. 更新分支引用
      await this.request('/repos/' + owner + '/' + repo + '/git/refs/heads/' + branch, {
        method: 'PATCH',
        body: JSON.stringify({ sha: commit.sha, force: false })
      })
      return commit
    }
  }

  /** URL 编码路径（保留 /） */
  function encodePath(p) {
    return p.split('/').map(encodeURIComponent).join('/')
  }

  function utf8ToB64(str) {
    const bytes = new TextEncoder().encode(str)
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    return btoa(bin)
  }

  function b64ToUtf8(b64) {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  }

  global.GitHubAPI = api
})(window)
