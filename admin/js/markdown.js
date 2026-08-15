/**
 * 简化 Markdown → HTML 预览渲染器（第一版）
 * 仅用于编辑器内的即时预览；外挂标签（{% xxx %}）保留为占位提示，
 * 最终效果以 GitHub Actions 构建发布后的站点为准。
 */
;(function (global) {
  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/!\[([^\]]*)\]\((https?:[^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">')
  }

  function render(src) {
    if (!src) return '<p style="color:#9aa5b5">（空白）</p>'
    const lines = src.split('\n')
    const out = []
    let i = 0
    let inCode = false
    let codeBuf = []
    let inQuote = false
    let quoteBuf = []
    let listBuf = []
    let listType = null

    const flushList = () => {
      if (listBuf.length) {
        out.push('<' + (listType === 'ol' ? 'ol' : 'ul') + '>')
        listBuf.forEach(item => out.push('<li>' + inline(item) + '</li>'))
        out.push('</' + (listType === 'ol' ? 'ol' : 'ul') + '>')
        listBuf = []; listType = null
      }
    }
    const flushQuote = () => {
      if (quoteBuf.length) {
        out.push('<blockquote>' + quoteBuf.map(inline).join('<br>') + '</blockquote>')
        quoteBuf = []
      }
    }

    for (; i < lines.length; i++) {
      const line = lines[i]
      // 代码块
      if (/^```/.test(line)) {
        if (!inCode) { flushList(); flushQuote(); inCode = true; codeBuf = [] }
        else {
          out.push('<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>')
          inCode = false
        }
        continue
      }
      if (inCode) { codeBuf.push(line); continue }
      // 外挂标签占位
      if (/^\{%\s*\w+/.test(line.trim()) || /^\{%\s*end\w+/.test(line.trim()) || /^<!--\s*(tab|endtab)/.test(line.trim())) {
        flushList(); flushQuote()
        out.push('<div class="tag-ph">🔧 ' + esc(line.trim()) + '</div>')
        continue
      }
      // 标题
      const h = line.match(/^(#{1,4})\s+(.*)$/)
      if (h) { flushList(); flushQuote(); out.push('<h' + h[1].length + '>' + inline(h[2]) + '</h' + h[1].length + '>'); continue }
      // 分割线
      if (/^\s*---+\s*$/.test(line)) { flushList(); flushQuote(); out.push('<hr>'); continue }
      // 引用
      if (/^>\s?/.test(line)) { flushList(); quoteBuf.push(line.replace(/^>\s?/, '')); continue }
      // 无序列表
      const ul = line.match(/^\s*[-*]\s+(.*)$/)
      if (ul) { if (listType !== 'ul') { flushList(); listType = 'ul' } listBuf.push(ul[1]); continue }
      // 有序列表
      const ol = line.match(/^\s*\d+[.)]\s+(.*)$/)
      if (ol) { if (listType !== 'ol') { flushList(); listType = 'ol' } listBuf.push(ol[1]); continue }
      // 空行
      if (!line.trim()) { flushList(); flushQuote(); continue }
      // 普通段落
      flushList(); flushQuote()
      out.push('<p>' + inline(line) + '</p>')
    }
    if (inCode) out.push('<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>')
    flushList(); flushQuote()
    return out.join('\n')
  }

  global.MarkdownPreview = { render }
})(window)
