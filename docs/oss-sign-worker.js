// ============================================================
// 阿里云 OSS 上传签名服务（Cloudflare Worker）
// 用途：为管理后台签发 OSS 上传凭证。AccessKey 只存在于 Worker 环境变量中，
//       绝不进入前端代码 —— 这是 OSS 直传的安全前提。
//
// 环境变量（必填，注意大小写与下划线，在 Production 环境下配置）：
//   OSS_AK_ID      阿里云 RAM 子账号 AccessKeyId
//   OSS_AK_SECRET  阿里云 RAM 子账号 AccessKeySecret
//   OSS_BUCKET     OSS bucket 名，如 kano-img-bed
//   OSS_REGION     bucket 地域，如 oss-cn-shanghai
//   OSS_DIR        上传对象名前缀（会拼进对象路径，如 cover 或 acs:oss:*:*:kano-img-bed/*）
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
        // 精确诊断：列出缺失的环境变量（避免笼统报错）
        const REQUIRED = ['OSS_AK_ID', 'OSS_AK_SECRET', 'OSS_BUCKET', 'OSS_REGION', 'OSS_DIR']
        const missing = REQUIRED.filter(k => !env[k])
        if (missing.length) {
          return cors(json({ error: '缺少环境变量: ' + missing.join(', ') + '（请检查变量名拼写，并在 Production 环境下配置）' }, 500))
        }
        const { name, type } = await request.json()
        const ext = (name && name.includes('.') ? name.split('.').pop() : 'webp').toLowerCase()
        const ALLOW = ['jpg', 'jpeg', 'png', 'webp', 'gif']
        if (!ALLOW.includes(ext)) {
          return cors(json({ error: '不支持的文件类型: ' + ext }, 400))
        }

        // 生成唯一对象名：{OSS_DIR}/时间戳-随机串.ext
        // OSS_DIR 即环境变量值，例如 cover/时间戳-随机.webp
        const object = `${env.OSS_DIR}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const expires = Math.floor(Date.now() / 1000) + EXPIRES
        const resource = `/${env.OSS_BUCKET}/${object}`

        // OSS V1 URL 签名（Content-MD5 为空）。
        // Content-Type 取前端上传时实际发送的值（如 image/webp），必须与上传请求头一致，
        // 否则 OSS 验签返回 SignatureDoesNotMatch。
        const contentType = type && typeof type === 'string' ? type : ''
        const stringToSign = `PUT\n\n${contentType}\n${expires}\n${resource}`
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
