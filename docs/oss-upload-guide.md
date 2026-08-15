# 阿里云 OSS 封面上传 · 图文操作单

> 目标：管理后台"⬆️ 上传封面"功能跑通 —— 选本地图 → 自动压缩 → 上传阿里云 OSS → 链接自动填入封面 → 访客可访问。
> 预计耗时：15–20 分钟。按顺序做完每一步，**每步末尾有"✅ 验证"**，通过后再进行下一步。

```
总览：阿里云 RAM 子账号 → OSS bucket（CORS + 公共读）→ Cloudflare Worker（签名服务）→ 管理端填地址 → 测试
```

---

## 步骤 0：确认前置条件

- [ ] 阿里云账号（实名认证）✅
- [ ] 已有 OSS bucket，例如 `kano-img-bed`（你已在用，跳过创建）
  - 若没有 bucket：阿里云控制台 → 搜索"OSS" → Bucket 列表 → 创建 Bucket → 地域选离你近的（如华东1-杭州 `oss-cn-hangzhou` 或上海 `oss-cn-shanghai`）→ 读写权限选 **公共读** → 创建
- [ ] Cloudflare 账号（免费注册 dash.cloudflare.com）
- [ ] 源码仓库 `Kano-Blog` 的管理后台已部署可用

---

## 步骤 A：阿里云创建 RAM 子账号（最小权限，专用于上传）

**操作路径**：阿里云控制台 → 右上角头像 → **访问控制 RAM**（或搜索"RAM"）→ 左侧 **用户**

1. 点击 **创建用户**
2. 登录名称：`blog-uploader`
3. 访问方式：☑️ **勾选"OpenAPI 调用访问"**（这会生成 AccessKey）→ 确定
4. **⚠️ 立即保存弹出的 AccessKeyId 和 AccessKeySecret**（只显示这一次，关掉就再也看不到 Secret）
5. 回到用户列表 → 点击刚创建的用户 → 权限管理 → **添加权限**
6. 选择 **自定义策略** → **创建权限策略**（或直接选"脚本编辑"模式新建）
7. 名称：`blog-upload-only`，粘贴以下 JSON（**把 `kano-img-bed` 换成你的 bucket 名，`cover` 换成想上传的目录名**）：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["oss:PutObject"],
      "Resource": ["acs:oss:*:*:kano-img-bed/cover/*"]
    }
  ]
}
```

8. 确定 → 回到"添加权限"页面选择该策略 → 确定

✅ **验证**：用户 `blog-uploader` 的权限列表里能看到 `blog-upload-only`；你已保存好 AccessKeyId/Secret（后面步骤 C 要用）。

> 🚫 不要用主账号 AccessKey。子账号密钥泄露也只影响"上传图片"，不影响账号其他资源。

---

## 步骤 B：OSS bucket 配置（公共读 + CORS）

### B-1 确认 bucket 公共读

**操作路径**：OSS 控制台 → 找到你的 bucket（如 `kano-img-bed`）→ 点击进入 → 左侧 **权限管理** → **读写权限**

- 若显示 **公共读** → ✅ 直接到 B-2
- 若显示 **私有** → 点击 **修改** → 读写权限选 **公共读** → 保存

> ⚠️ **最常踩的坑**：上传（PutObject）和访问（GetObject）是两回事。即使上传成功，bucket 是私有的话，访客打开图片 URL 会 403。个人博客图床用"公共读"最省事。

### B-2 配置跨域 CORS（允许浏览器直传）

**操作路径**：bucket 内 → 左侧 **数据安全** → **跨域设置** → **创建规则**

- 来源：`https://ATRIqwq.github.io`（若管理端将来换域名，回来加一条即可；嫌麻烦可填 `*`）
- 允许 Methods：☑️ PUT ☑️ GET ☑️ HEAD ☑️ POST
- 允许 Headers：`*`
- 暴露 Headers：`ETag`
- 缓存时间：`600`
- 确定

✅ **验证**：跨域设置列表出现 1 条规则。

---

## 步骤 C：Cloudflare 部署签名 Worker

### C-1 创建 Worker

**操作路径**：dash.cloudflare.com → 左侧 **Workers & Pages** → **Create** → **Create Worker** → 名称填 `oss-sign` → **Edit code**

- 打开源码文件 **`docs/oss-sign-worker.js`**（在项目仓库里），全选复制全部内容
- 粘贴覆盖 Worker 编辑器的默认代码 → 右上角 **Deploy**

### C-2 配置环境变量（AccessKey 只存在这里）

**操作路径**：Worker 页面 → **Settings** → **Variables and Secrets** → **Add**

| 变量名 | 值（填你自己的） | 类型 |
| --- | --- | --- |
| `OSS_AK_ID` | 步骤 A 保存的 AccessKeyId | 推荐 Encrypt |
| `OSS_AK_SECRET` | 步骤 A 保存的 AccessKeySecret | 推荐 Encrypt |
| `OSS_BUCKET` | 如 `kano-img-bed` | 普通 |
| `OSS_REGION` | 如 `oss-cn-shanghai`（看 bucket 地域） | 普通 |
| `OSS_DIR` | `cover`（与步骤 A 策略里的目录一致） | 普通 |

逐个 Add 完成后，点 **Save**（无需重新 Deploy，变量保存后自动生效，稍等几秒）。

✅ **验证**：浏览器打开 `https://oss-sign.你的子域.workers.dev/sign` → 显示 `{"error":"not found"}` 说明 Worker 在线；若显示"环境变量未配置完整"说明变量没生效（检查名称拼写）。

> 免费计划每天 10 万次请求，个人博客上传量完全够用。

---

## 步骤 D：管理端配置签名服务地址

**文件**：`admin/js/config.js`（在源码仓库 `Kano-Blog` 中）

```js
window.ADMIN_CONFIG = {
  // ...原有配置不动...
  ossSignUrl: 'https://oss-sign.你的子域.workers.dev'   // ← 改成你的 Worker 地址
}
```

改完后本地提交并推送（或直接用仓库网页编辑后 commit），等待 Actions 部署（1–3 分钟）。

✅ **验证**：重新打开 `https://ATRIqwq.github.io/admin/`（强制刷新 Ctrl+F5），进入任意文章编辑器，封面字段旁出现 **⬆️ 上传** 按钮；未配置时点击按钮会提示"未配置 ossSignUrl"。

---

## 步骤 E：端到端测试

1. 编辑器 → 封面字段 → 点 **⬆️ 上传** → 选择一张本地图片（jpg/png/webp/gif）
2. 观察底部提示依次出现：`🖼️ 压缩中… → 🔐 获取上传凭证… → ⬆️ 上传中… → ✅ 封面上传成功`
3. 封面输入框自动填入：`https://kano-img-bed.oss-cn-shanghai.aliyuncs.com/cover/1735xxxx-xxxxxx.webp`，下方显示预览图
4. 点 **💾 保存修改** → 等 1–3 分钟 → 打开博客文章页，封面正常显示

✅ **验证**：把封面 URL 直接粘贴到浏览器新标签页打开，能显示图片（说明公共读生效）；复制到手机流量访问也正常。

---

## 常见问题排查

| 现象 | 原因 | 解决 |
| --- | --- | --- |
| 提示"未配置 ossSignUrl" | 步骤 D 没做/没生效 | 改 `admin/js/config.js` 并重新部署 |
| 提示"不支持的文件类型" | 选了非 jpg/png/webp/gif | 换图片格式 |
| 上传返回 403 | CORS 没配 / 子账号没权限 | 检查步骤 B-2、步骤 A 策略中的 bucket 名与目录是否一致 |
| 上传成功但图片访问 403 | bucket 是私有读 | 步骤 B-1 改为公共读 |
| Worker 接口报"环境变量未配置完整" | 变量名拼写错误 | 检查 `OSS_AK_ID` 等名称一字不差 |
| 上传到一半失败 / 超时 | 签名 5 分钟过期 | 重新点上传（凭证每次新签发） |
| AccessKeySecret 找不到了 | 只在创建时显示一次 | 在 RAM 用户里**新建 AccessKey**（可创建多个） |
| 想限制上传图片大小 | Worker 里可加校验 | 需要改 Worker 代码时告诉我 |

## 进阶选项

- **访问时再压缩**：bucket 开通"图片处理"后，封面 URL 可追加 `?x-oss-process=image/resize,w_800` 减少流量
- **自定义域名**：OSS 绑定已备案域名（国内访问更稳），需要时另配
- **对象过期清理**：`cover/` 目录的旧图可到 OSS 控制台手动清理，或配置生命周期规则自动删除 N 天前的对象
