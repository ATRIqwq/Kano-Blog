# 管理员后台设计方案（在线管理版）

> 目标：为 Hexo 博客（Fomalhaut 主题）增加**部署后可直接在线管理**的文章后台，支持增删改查、发布/下线。
> **方案结论：选方案 C（在线 Git 型 CMS + GitHub Actions 自动部署）**。
> 原因：站点部署在 GitHub Pages（纯静态、无后端进程），本地服务类方案（A/B）部署后不可用；只有"GitHub API 改源码 + 自动重建"能实现部署后在线管理。

---

## 1. 前提条件（必须先行）

当前源码目录**不是 Git 仓库**（无 `.git`、无远程），这是在线管理的前置障碍。实施前需要：

1. 在 GitHub 新建**源码仓库**（建议 `ATRIqwq/hexo-blog-source`，私有亦可）；
2. 本地 `git init` → 添加 `.gitignore`（排除 `node_modules/ public/ .deploy_git/ db.json`）→ 推送源码；
3. 仓库配置 **GitHub Actions** 自动构建部署（替代本地 `hexo deploy`）；
4. 生成 GitHub **认证令牌**（见 §4）。

之后：**改文章 = 提交 commit = 自动构建 = 站点更新**，全程无需本地电脑。

---

## 2. 总体架构

```
用户浏览器
   │
   ├── 访问 https://ATRIqwq.github.io/（博客，只读）
   │
   └── 访问 https://ATRIqwq.github.io/admin/（管理端 SPA，随站点一起部署）
          │  ① 登录（GitHub PAT / OAuth）
          │  ② GitHub REST API（Contents API 读写 + 提交 commit）
          ▼
      源码仓库（GitHub）: source/_posts/*.md   ←  每次增删改 = 一次 commit
          │  ③ push 事件自动触发
          ▼
      GitHub Actions workflow
          checkout → npm ci → hexo generate → gulp 压缩 → 部署到 Pages 仓库
          ▼
      https://ATRIqwq.github.io  ←  增删改查结果自动上线（约 1–3 分钟）
```

关键点：
- **管理端不需要服务器**：直接调 GitHub 官方 REST API，所有"写操作"最终是提交 commit 到源码仓库；
- **构建不需要本地**：GitHub Actions 在云端执行 `hexo generate + gulp`，产物推送到 Pages 仓库；
- 发布/下线 = 在 `_posts/` 与 `_drafts/` 之间移动文件（`render_drafts: false` 保证草稿不渲染）。

---

## 3. 源码仓库与 Actions 部署

### 3.1 仓库布局（源码仓库 `hexo-blog-source`）

```
hexo-blog-source/
├── .github/workflows/deploy.yml   # 自动构建部署
├── .gitignore                     # node_modules/ public/ .deploy_git/ db.json
├── _config.yml · _config.butterfly.yml
├── package.json · gulpfile.js
├── source/                        # 文章与页面（在线管理的操作对象）
├── themes/butterfly/
└── admin/                         # 管理端 SPA 源码（构建时复制进 public/admin）
```

### 3.2 workflow：`.github/workflows/deploy.yml`

```yaml
name: Deploy
on:
  push:
    branches: [ main ]
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npx hexo clean && npx hexo generate
      - run: npx gulp                      # 压缩 public/ 下 JS/CSS/HTML
      - run: cp -r admin public/admin      # 管理端随站点发布
      - name: Deploy to Pages repo
        uses: peaceiris/actions-gh-pages@v4
        with:
          personal_token: ${{ secrets.PAGES_TOKEN }}
          external_repository: ATRIqwq/ATRIqwq.github.io   # Pages 仓库
          publish_branch: main
          publish_dir: ./public
```

> `PAGES_TOKEN`：在源码仓库 Settings → Secrets 中配置一个 PAT（仅授予 `ATRIqwq.github.io` 仓库 Contents 写权限）。或改用 `deploy_key` 免 token。

### 3.3 本地发布流程的变更

- 旧：`hexo generate && gulp && hexo deploy`
- 新：本地只需 `git add . && git commit && git push`，构建部署全部交给 Actions。
- 本地 `hexo server` 预览功能保留不变（本地开发仍然可用）。

---

## 4. 认证方案（管理端 → GitHub API）

| 方式 | 实现 | 优点 | 缺点 |
| --- | --- | --- | --- |
| **A. Fine-grained PAT（推荐起步）** | 登录页输入令牌，存 `sessionStorage`，请求头 `Authorization: Bearer` | 零后端、免费、配置最快 | 令牌存在浏览器，泄露面较大；需手动生成/续期 |
| B. GitHub OAuth App + Cloudflare Worker | Worker 做 OAuth 代理，令牌不落浏览器 | 更安全 | 需额外建 Worker + OAuth App |
| C. GitHub App | 权限最细、可撤销 | 需要回调服务，最复杂 | — |

**推荐 A**：Fine-grained PAT 可限定"仅源码仓库 + Contents 读写权限 + 90 天有效期"，个人博客完全够用；登录页建议加"如何生成令牌"指引（链接到 GitHub 设置页）。后续可平滑升级到 B。

**管理端需要的 GitHub API（全部公开 REST）**：
- 列目录：`GET /repos/{owner}/{repo}/contents/source/_posts`
- 读文件：`GET /repos/{owner}/{repo}/contents/source/_posts/{name}`（返回 base64，需解码）
- 新建/更新：`PUT /repos/{owner}/{repo}/contents/source/_posts/{name}`（body：`message` 提交说明、`content` base64、更新时带 `sha`）
- 删除：`DELETE /repos/{owner}/{repo}/contents/source/_posts/{name}`（带 `sha`）
- 发布/下线：读旧路径 → 写新路径 → 删旧路径（2 个 commit）

> 限制：单文件 ≤ 1MB（文章远小于此）；未认证限速 60 次/时、认证后 5000 次/时，个人使用无压力。

---

## 5. 管理端 SPA 设计（`admin/`）

### 5.1 技术选型

- 原生 HTML/CSS/JS 单页应用，**零构建、零框架**（与主题解耦，避免引入 node 依赖）
- Markdown 编辑器：本地化 **CodeMirror 5**（vendor 文件入库，不走 CDN）
- 预览：**marked** 近似渲染（外挂标签 `{% note %}` 等不渲染，提示"最终效果以发布后为准"）

### 5.2 页面与功能清单

> 交互原型：`docs/prototype/admin-prototype.html`（浏览器直接打开，含登录/列表/编辑器三个页面）。

**① 登录页**
- GitHub Fine-grained PAT 输入框（密码掩码）→ 校验（调仓库读接口）→ 存 `sessionStorage`
- 辅助：令牌生成指引链接、"令牌仅存于本浏览器会话"安全提示

**② 文章列表页**
- 顶栏：标题、用户头像、GitHub 连接状态徽章、退出
- 工具栏：
  - 状态筛选段（全部 / 已发布 / 草稿，带计数）
  - 关键词搜索框（标题+正文）
  - 分类下拉筛选、标签下拉筛选
  - 「＋ 新建文章」按钮
- 文章表格（列）：封面缩略图（加载失败显示占位）、标题（置顶/草稿/加密徽章）、分类、标签 chips、日期、操作按钮组
- 行内操作：✏️ 编辑 / 👁️ 预览（新标签打开已发布链接或占位）/ 📥 下线为草稿 / 🚀 发布上线（草稿行显示）/ 🗑️ 删除（二次确认弹窗，提示可从 Git 历史恢复）
- 底部分页（每页 10 条，`per_page` 与 `_config.yml` 一致）

**③ 文章编辑器页（核心）**
- 顶栏：返回列表、当前文件名、右侧「💾 保存修改」「🚀 发布」按钮
- 左栏 Front matter 表单（分三组）：
  - 基本信息：标题*、日期、更新时间（自动）、分类、标签、封面 URL、摘要 description
  - 主题扩展：置顶 sticky、swiper_index、加密密码 password、mathjax 开关、评论开关
  - 链接锁定区：abbrlink 只读展示（带"修改会导致已发布链接失效"提示）
- 右栏 Markdown 编辑区：
  - 「编辑 / 预览」双 tab；编辑 = CodeMirror（行号、语法高亮：front matter / 外挂标签标记高亮）
  - 预览 = marked 近似渲染，外挂标签显示占位并提示"最终效果以构建发布后为准"
- 底部：取消 / 保存修改
- 新建模式：标题自动生成文件名（`YYYY-MM-DD-标题.md`），提供「保存草稿」选项（写入 `_drafts/`）

**交互细节**
- 保存 = 写回文件 + 自动 commit（提交说明 `update: 标题` / `create: 标题` / `delete: 标题`）
- 保存成功后 Toast 提示「已提交，站点 1–3 分钟内自动更新」
- 删除前二次确认；下线/发布为移动文件（`_posts` ↔ `_drafts`）

### 5.3 部署方式

管理端源码放源码仓库 `admin/`，Actions 构建时 `cp -r admin public/admin`，即 https://ATRIqwq.github.io/admin/ 可直接访问。博客页脚可加一个"管理"入口链接。

---

## 6. 标签与分类管理（增删改查 + 文章归类/打标签）

> 交互原型：`docs/prototype/admin-prototype.html` 中「④ 标签管理」「⑤ 分类管理」视图，及列表页批量操作。

### 6.1 概念映射（关键前提）

Hexo 中**标签/分类不是独立实体**，而是文章的 front matter 属性（`tags:` / `categories:` 字段），由 Hexo 构建时聚合生成标签页/分类页。因此管理端的 CRUD 语义如下：

| 操作 | 实际含义 | 实现方式 |
| --- | --- | --- |
| 查（列表/统计） | 聚合所有文章的 tags/categories 并统计文章数 | Git Trees API 拉取 `source/_posts`+`_drafts` 全部 `.md` → 浏览器端解析 front matter → 聚合计数 |
| 增（打标签/归类） | 在文章 front matter 中写入 tags/categories | 文章编辑器内选择/新建标签、分类（自动补全，可输入新值） |
| 改（重命名） | 批量替换所有文章中的旧名称 | **Git Data API 一次 commit** 更新全部受影响文件 |
| 删 | 从所有文章的 front matter 中移除该标签/分类 | Git Data API 一次 commit |
| 文章归类/打标签 | 编辑文章的分类与标签字段 | 编辑器表单 + 列表页批量操作 |

### 6.2 标签管理页（④）

- 顶部：标签总数、覆盖文章数统计；「表格 / 标签云」视图切换（可选）
- 表格列：标签名、文章数（点击查看该标签下文章）、最近使用时间、操作
- 操作：
  - ✏️ **重命名**：弹窗输入新名称 → 展示"将影响 N 篇文章"预览 → 确认后 Git Data API 一次 commit 批量替换；若新名称已存在 → 合并提示
  - 👁️ **查看文章**：列出该标签下的文章（复用列表页筛选）
  - 🗑️ **删除**：确认弹窗提示"将从 N 篇文章中移除该标签"→ 一次 commit 完成
- 不提供独立"新建标签"（标签随文章创建）

### 6.3 分类管理页（⑤）

- 表格列：分类名、文章数、封面缩略图、描述、操作
- 操作：重命名 / 查看文章 / 删除（同上，批量 commit）
- **分类封面/描述管理（可选增强）**：读取 `_config.yml` 中 `categoryBar.message`（Fomalhaut 分类磁贴配置），展示各分类封面与描述；修改时精准定位 YAML 中该分类的 `cover/descr` 行替换
  - ⚠ 风险：改写 `_config.yml` 需保留注释与格式，首版只读展示，写回作为增强项

### 6.4 文章归类 / 打标签

**编辑器增强**：
- 分类输入 → 下拉选择器（已有分类列表 + "新建分类"）
- 标签输入 → chips 选择器（搜索已有标签、回车新建、点击移除、自动去重）

**列表页批量操作**：
- 表格增加复选框列；勾选后出现批量工具栏：批量添加标签 / 批量移动分类 / 批量发布或下线 / 批量删除
- 批量操作走 Git Data API 一次 commit（提交说明如 `tag: 批量添加标签「Java」到 3 篇文章`）

### 6.5 GitHub API 实现要点

| 场景 | API | 说明 |
| --- | --- | --- |
| 单文件读写（编辑文章） | Contents API | `PUT/DELETE /repos/{owner}/{repo}/contents/...`，每次一个 commit |
| 聚合标签/分类（列表统计） | `GET /repos/{owner}/{repo}/git/trees/main?recursive=1` | 一次拉取全树，批量读 blob，避免逐文件请求 |
| 批量改名/删除/打标签 | **Git Data API**：`POST /git/blobs` → `POST /git/trees` → `POST /git/commits` → `PATCH /refs/heads/main` | **一次 commit 原子完成多文件修改**，提交历史干净 |

**前端 YAML 解析**：front matter 解析在浏览器端完成（本地化 js-yaml，vendor 入库），需兼容数组与列表两种 tags 写法（`tags: [a, b]` 与 `tags:\n  - a`）。

### 6.6 安全与风险

- 重命名/删除前必须展示**影响文件预览**（哪些文章、改前改后），二次确认
- Git Data API 是原子 commit：失败整体失败，Git 历史可回滚
- `_config.yml` 封面写回默认只读，避免破坏 YAML 注释结构

---

## 7. 兼容性要点（基于现有文章分析）

| 特性 | 处理 |
| --- | --- |
| abbrlink 短链接 | **写死在 front matter**（如 `abbrlink: 2013454d`），编辑页锁定该字段；新建时留空由 hexo-abbrlink 生成 |
| hexo-blog-encrypt | 保留 `password` 字段；已加密文章修改后自动重新构建即生效 |
| sticky / swiper_index / cover / mathjax | 表单全部提供输入项，原样写回（front matter 序列化时保留未知字段） |
| 外挂标签 | 在线预览用 marked 近似渲染；正式效果以 Actions 构建后为准 |
| updated 字段 | 保存时自动刷新 |

---

## 8. 实施步骤

| Phase | 内容 | 验收 |
| --- | --- | --- |
| **P1 源码托管 + 自动部署** | git init、.gitignore、推送源码仓库；编写 deploy.yml；配置 Secrets | 本地 `git push` 后站点自动更新 |
| **P2 管理端骨架** | admin/ SPA：登录 + 文章列表（GitHub API 读取） | 能在线看到文章列表 |
| **P3 增删改查闭环** | 新建/编辑/删除/发布下线（写回 + commit） | 在线操作后 1–3 分钟站点更新 |
| **P4 打磨** | 预览优化、错误提示、回收站策略（GitHub commit 历史即回收站）、README 使用文档 | 全流程可用 |

## 9. 风险与注意事项

- **上线延迟**：每次保存 = 一次 commit + 一次 Actions 构建，约 1–3 分钟后生效（可接受）
- **免费额度**：Actions 2000 分钟/月、API 5000 次/小时，个人博客绰绰有余
- **令牌安全**：PAT 泄露面在浏览器；建议短有效期 + 仅授权源码仓库；后续升级 OAuth+Worker
- **提交历史即版本管理**：误删可在 GitHub 提交历史找回，天然满足"回收站"需求
- 私有源码仓库 + 公开 Pages 仓库的组合完全可行（Actions 构建产物推公开仓库）

---

## 10. 备选：本地方案（仅本地写作场景）

若只在本机写作、不需要部署后在线管理，可退回方案 A（hexo server 内嵌管理后台，`localhost:4000/admin`，零新依赖），但**它无法满足"部署后在线管理"的需求**，因此本设计以方案 C 为准。
