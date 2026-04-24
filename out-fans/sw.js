// v4
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(clients.claim()))

self.addEventListener('push', event => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'KDFC Fan Zone', {
      body:  data.body  ?? '',
      icon:  data.icon ?? '/bwKDFC.png',
      badge: '/badge96.png',
      data:  { url: data.url ?? '/rounds' },
      vibrate: [100, 50, 100],
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/rounds'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const existing = cs.find(c => c.url.includes(url) && 'focus' in c)
      return existing ? existing.focus() : clients.openWindow(url)
    })
  )
})
