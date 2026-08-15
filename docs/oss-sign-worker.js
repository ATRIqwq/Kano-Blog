// ============================================================
// 阿里云 OSS 上传签名服务（Cloudflare Worker）
// 用途：为管理后台签发 OSS 上传凭证。AccessKey 只存在于 Worker 环境变量中，
//       绝不进入前端代码 —— 这是 OSS 直传的安全前提。
//
// 部署步骤（见 admin/README.md 详细教程）：
//   1. Cloudflare Dashboard → Workers & Pages → Create → 粘贴本文件
//   2. Settings → Variables 添加环境变量（见下方列表）
//   3. Deploy
//
// 环境变量（必填）：
//   OSS_AK_ID      阿里云 RAM 子账号 AccessKeyId
//   OSS_AK_SECRET  阿里云 RAM 子账号 AccessKeySecret
//   OSS_BUCKET     OSS bucket 名，如 kano-img-bed
//   OSS_REGION     bucket 地域，如 oss-cn-shanghai
//   OSS_DIR        上传目录前缀，如 cover
//
// 接口：
//   POST /sign  body: { "name": "图片文件名" }
//   → { uploadUrl（带签名的 PUT 直传地址，5 分钟有效）, publicUrl（公开访问地址） }
// ============================================================

const EXPIRES = 300 // 签名有效期（秒）

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return cors(new Response('ok'))
    }

    if (request.method === 'POST' && url.pathname === '/sign') {
      try {
        if (!env.OSS_AK_ID || !env.OSS_AK_SECRET || !env.OSS_BUCKET || !env.OSS_REGION || !env.OSS_DIR) {
          return cors(json({ error: 'Worker 环境变量未配置完整（OSS_AK_ID/OSS_AK_SECRET/OSS_BUCKET/OSS_REGION/OSS_DIR）' }, 500))
        }
        const { name } = await request.json()
        const ext = (name && name.includes('.') ? name.split('.').pop() : 'webp').toLowerCase()
        const ALLOW = ['jpg', 'jpeg', 'png', 'webp', 'gif']
        if (!ALLOW.includes(ext)) {
          return cors(json({ error: '不支持的文件类型: ' + ext }, 400))
        }

        // 生成唯一对象名：cover/时间戳-随机串.ext
        const object = `${env.OSS_DIR}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const expires = Math.floor(Date.now() / 1000) + EXPIRES
        const resource = `/${env.OSS_BUCKET}/${object}`

        // OSS V1 URL 签名（PUT、无 Content-Type/Content-MD5）
        const stringToSign = `PUT\n\n\n${expires}\n${resource}`
        const signature = await hmacSha1(env.OSS_AK_SECRET, stringToSign)

        const uploadUrl =
          `https://${env.OSS_BUCKET}.${env.OSS_REGION}.aliyuncs.com/${encodeURIComponent(object)}` +
          `?OSSAccessKeyId=${encodeURIComponent(env.OSS_AK_ID)}&Expires=${expires}&Signature=${encodeURIComponent(signature)}`
        const publicUrl = `https://${env.OSS_BUCKET}.${env.OSS_REGION}.aliyuncs.com/${encodeURIComponent(object)}`

        return cors(json({ uploadUrl, publicUrl, expires }))
      } catch (e) {
        return cors(json({ error: e.message }, 500))
      }
    }

    return cors(json({ error: 'not found' }, 404))
  }
}

async function hmacSha1(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })
}

function cors(res) {
  const headers = new Headers(res.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, PUT, GET, HEAD, OPTIONS')
  headers.set('Access-Control-Allow-Headers', '*')
  headers.set('Access-Control-Expose-Headers', 'ETag')
  return new Response(res.body, { status: res.status, headers })
}
