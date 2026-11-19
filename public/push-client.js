// Ajoute un bouton « Activer les notifications » et gère l'abonnement push.
(function () {
  function urlBase64ToUint8Array(base64) {
    const pad = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  async function enablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert("Ce navigateur ne supporte pas les notifications push. Sur iPhone : ajoute d'abord le site à l'écran d'accueil.");
      return;
    }
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { alert('Notifications refusées.'); return; }
    const { key } = await (await fetch('/push/public-key')).json();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }
    await fetch('/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub),
    });
    alert('Notifications activées ✔');
  }

  window.enablePush = enablePush;

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

  window.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('enable-push-btn')) return;
    const b = document.createElement('button');
    b.id = 'enable-push-btn';
    b.textContent = '🔔 Activer les notifications';
    b.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9999;padding:10px 14px;border-radius:999px;border:0;background:#222;color:#fff;font-size:14px;cursor:pointer';
    b.addEventListener('click', enablePush);
    document.body.appendChild(b);
  });
})();
