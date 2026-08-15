/**
 * 在线管理后台 · 配置（第一版）
 * 部署到 GitHub Pages 后，请将下面的仓库信息改为你的源码仓库
 */
window.ADMIN_CONFIG = {
  owner: 'ATRIqwq',            // GitHub 用户名或组织
  repo: 'Kano-Blog',           // 源码仓库名（存放 source/ 的仓库）
  branch: 'main',              // 默认分支
  postsDir: 'source/_posts',   // 文章目录
  draftsDir: 'source/_drafts',  // 草稿目录
  ossSignUrl: ''               // 阿里云 OSS 上传签名服务（Cloudflare Worker）地址，如 https://xxx.workers.dev
                               // 留空 = 封面上传按钮不可用（可手动填 URL）
}
