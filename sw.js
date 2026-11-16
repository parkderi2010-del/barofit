// 바로핏 오프라인 저장 (서비스 워커)
// 내 파일은 "인터넷 먼저, 안 되면 저장본" → 새 버전을 올리면 바로 반영돼요.
// AI 모델·글꼴 같은 외부 파일은 "저장본 먼저" → 두 번째부터 빠르게, 인터넷 없이도 열려요.
const V = "barofit-v2";
const SHELL = ["./", "index.html", "records.html", "shop.html", "privacy.html", "common.js", "products.json", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icon-180.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request; if (r.method !== "GET") return;
  const url = new URL(r.url);
  if (url.origin === location.origin) {
    e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); return res; })
      .catch(() => caches.match(r).then(m => m || caches.match("index.html"))));
  } else if (/(^|\.)cdn\.jsdelivr\.net$|^storage\.googleapis\.com$|^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { if (res.ok || res.type === "opaque") { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); } return res; })));
  }
});
