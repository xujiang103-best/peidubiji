// Service Worker - 离线缓存支持
const CACHE_NAME = 'peidu-notes-v1';

// 需要缓存的静态资源
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/storage.js',
  '/js/llm.js',
  '/js/ocr.js',
  '/js/exam.js',
  '/js/import.js',
  '/js/app.js',
  '/manifest.json'
];

// 安装：预缓存静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // 某些资源可能不存在，忽略错误
      });
    })
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});

// 请求拦截：缓存优先策略
self.addEventListener('fetch', (event) => {
  // 跳过 API 请求（不缓存）
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      // 缓存命中，直接返回
      if (cached) return cached;

      // 否则发起网络请求
      return fetch(event.request).then((response) => {
        // 只缓存成功的 GET 请求
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});
