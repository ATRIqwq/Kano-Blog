/**
 * Front matter 解析 / 序列化（第一版）
 * 基于本地化 vendor/js-yaml.min.js；使用 CORE_SCHEMA 避免日期被解析为 Date 对象
 */
;(function (global) {
  const yaml = global.jsyaml

  /**
   * 解析 Markdown 文件文本
   * @returns {{ data: object, content: string }}
   */
  function parse(text) {
    if (text.startsWith('---')) {
      const end = text.indexOf('\n---', 3)
      if (end !== -1) {
        const head = text.slice(3, end).trim()
        const body = text.slice(end + 4).replace(/^\n+/, '')
        try {
          const data = head ? yaml.load(head, { schema: yaml.CORE_SCHEMA }) || {} : {}
          if (typeof data === 'object' && !Array.isArray(data)) return { data, content: body }
        } catch (e) {
          console.warn('front matter 解析失败，按纯正文处理', e)
        }
      }
    }
    return { data: {}, content: text }
  }

  /**
   * 序列化为标准 Hexo 文章文件（--- front matter --- + 正文）
   */
  function build(data, content) {
    const head = yaml.dump(data, { schema: yaml.CORE_SCHEMA, lineWidth: 200 }).trimEnd()
    return '---\n' + head + '\n---\n\n' + (content || '').replace(/^\n+/, '')
  }

  /** 兼容 tags/categories 的字符串或数组写法，统一返回数组 */
  function toArray(v) {
    if (!v) return []
    if (Array.isArray(v)) return v.map(String)
    return String(v).split(',').map(s => s.trim()).filter(Boolean)
  }

  /** 将数组写回（保持数组形式，仅当有值时） */
  function fromArray(arr) {
    const a = (arr || []).filter(Boolean)
    return a.length ? a : undefined
  }

  /** 根据标题生成文件名（安全字符 + 日期前缀），返回如 2024-03-02-标题.md */
  function makeFileName(title, dateStr, isDraft) {
    const date = (dateStr && dateStr.slice(0, 10)) || new Date().toISOString().slice(0, 10)
    let safe = String(title || 'untitled')
      .replace(/[\\/:*?"<>|#%&\s]+/g, '-')   // 非法/空白字符 → '-'
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
    if (!safe) safe = 'untitled'
    return date + '-' + safe + '.md'
  }

  global.FrontMatter = { parse, build, toArray, fromArray, makeFileName }
})(window)
