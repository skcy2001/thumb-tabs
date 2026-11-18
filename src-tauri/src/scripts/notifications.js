// Runs in every site's pages (and their frames) before the site's own code.
//
// WebView2 hands the app only notifications made with `new Notification()`,
// which the app shows as Windows toasts. Notifications a page shows through
// its service worker (`registration.showNotification()`) bypass the app, so
// WebView2 draws its own pop-up for them; a site that uses both (Gemini does)
// then notifies twice. Here a page's service-worker notification is made as
// an ordinary notification instead, so it reaches the app like every other.
(() => {
  const Registration = window.ServiceWorkerRegistration
  if (!Registration || typeof window.Notification !== 'function') return
  const original = Registration.prototype.showNotification
  if (typeof original !== 'function') return
  Object.defineProperty(Registration.prototype, 'showNotification', {
    configurable: true,
    writable: true,
    value: function showNotification(title, options) {
      if (Notification.permission !== 'granted') return original.apply(this, arguments)
      try {
        // Buttons (actions) exist only on service-worker notifications.
        const { actions, ...rest } = options || {}
        new Notification(title, rest)
        return Promise.resolve()
      } catch {
        return original.apply(this, arguments)
      }
    },
  })
})()
