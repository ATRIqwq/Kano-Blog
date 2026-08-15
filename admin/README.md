# 在线管理后台（第一版）

部署在 GitHub Pages 上的**在线文章管理后台**：登录后即可对 `source/_posts` 与 `source/_drafts` 下的文章进行增删改查，并可管理标签/分类（重命名、删除、为文章归类打标签）。每次操作 = 提交一个 commit，触发 GitHub Actions 自动重新构建并发布站点。

## 目录结构

```
admin/
├── index.html          # 管理端入口（部署后访问 /admin/）
├── css/admin.css
├── js/
│   ├── config.js       # ★ 仓库配置（owner / repo / branch）
│   ├── github-api.js   # GitHub REST API 封装（Contents / Trees / Git Data）
│   ├── frontmatter.js  # front matter 解析与序列化（基于 js-yaml）
│   ├── markdown.js     # 编辑器内简化预览渲染
│   └── app.js          # 应用逻辑（登录 / 列表 / 编辑器 / 标签 / 分类）
└── vendor/
    └── js-yaml.min.js  # 本地化 YAML 解析（无 CDN 依赖）
```

## 使用前配置（一次性）

### 1. 修改仓库配置 `admin/js/config.js`

```js
window.ADMIN_CONFIG = {
  owner: '你的GitHub用户名',
  repo: '源码仓库名',        // 存放 source/ 的仓库，如 hexo-blog-source
  branch: 'main',
  postsDir: 'source/_posts',
  draftsDir: 'source/_drafts'
}
```

### 2. 生成 GitHub 访问令牌（Fine-grained PAT）

GitHub → Settings → Developer settings → Fine-grained personal access tokens → Generate new token：

- **Repository access**：仅选择源码仓库
- **Permissions → Contents**：`Read and write`（读写 Markdown 文件）
- 有效期建议 90 天内；妥善保管，可随时吊销

### 3. 配置部署 Secrets

源码仓库 → Settings → Secrets and variables → Actions → New repository secret：

- 名称：`PAGES_TOKEN`
- 值：一个拥有 **Pages 仓库（ATRIqwq.github.io）** Contents 写权限的 PAT

### 4. 首次推送

```bash
git add . && git commit -m "init: blog source with admin"
git push origin main
```

推送后 GitHub Actions 自动构建并部署，约 1–3 分钟后访问：
- 博客：`https://你的用户名.github.io/`
- 管理后台：`https://你的用户名.github.io/admin/`

## 功能说明（第一版）

| 功能 | 说明 |
| --- | --- |
| 登录 | 输入 GitHub PAT，校验后进入；令牌存于本地浏览器 |
| 文章列表 | 状态筛选（全部/已发布/草稿）、关键词搜索、新建 |
| 文章编辑器 | front matter 表单（标题/日期/分类/标签/封面/摘要/置顶/加密密码…）+ Markdown 编辑 + 即时预览；`abbrlink` 锁定不可改 |
| 发布 / 下线 | 在 `_posts` 与 `_drafts` 之间移动文件（草稿默认不渲染） |
| 删除 | 删除文件，可通过 Git 提交历史恢复 |
| 标签 / 分类 | 聚合统计（名称、文章数）、重命名、删除；均通过 Git Data API **一次 commit** 批量修改受影响文章 |
| 归类 / 打标签 | 编辑器内直接填写分类与标签（逗号分隔，支持新建） |

## 设计要点

- **零后端**：管理端直接调用 GitHub REST API，无服务器依赖
- **保存即发布**：每次保存/发布/删除/重命名 = 一次 commit → Actions 自动重建（约 1–3 分钟生效）
- **草稿机制**：`_drafts/` 中的文件不会渲染进站点（`render_drafts: false`）
- **安全**：令牌仅存于浏览器本地；建议 PAT 限单仓库 + 短有效期
- **兼容主题字段**：编辑时保留 `abbrlink / password / sticky / swiper_index` 等未知字段原样写回

## 第一版限制（第二版规划）

- 无批量勾选操作（批量打标签/移动分类）
- 分类封面/描述写回 `_config.yml`（categoryBar）暂未实现（只读聚合）
- 预览为简化渲染：外挂标签（`{% note %}` 等）以占位显示，最终效果以构建后站点为准
- 无回收站 UI（误删通过 Git 提交历史找回）
- 认证仅支持 PAT；后续可升级 GitHub OAuth + Cloudflare Worker
