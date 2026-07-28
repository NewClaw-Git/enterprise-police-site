// Service Worker：实现 PWA 离线可打开（仅缓存同源的应用外壳与静态资源）
// 出于隐私考虑，不缓存跨域的 GitHub API 请求（含私有数据 + PAT），离线时仅能打开外壳、数据需联网加载。
const CACHE = 'ep-shell-v1'
const APP_SHELL = ['./', './index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // 只处理同源请求；跨域（api.github.com 等）直接放行，不缓存
  if (url.origin !== self.location.origin) return

  // 导航请求：优先网络，失败时回退已缓存的 index.html（支持离线打开）
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./index.html', copy))
          return res
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    )
    return
  }

  // 静态资源（带 hash 的 assets）：cache-first，命中即返回，后台静默更新
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
