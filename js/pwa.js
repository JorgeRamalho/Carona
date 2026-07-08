const caronaPwa = {
  deferredPrompt: null,

  async init() {
    if (!('serviceWorker' in navigator)) return;

    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch (err) {
      console.warn('Service worker não registrado:', err.message);
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.showInstallButton(true);
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.showInstallButton(false);
    });

    this.bindInstallButtons();
    this.requestNotificationPermission();
  },

  bindInstallButtons() {
    document.querySelectorAll('[data-pwa-install]').forEach((btn) => {
      btn.addEventListener('click', () => this.promptInstall());
    });
  },

  showInstallButton(show) {
    document.querySelectorAll('[data-pwa-install]').forEach((btn) => {
      btn.hidden = !show;
    });
  },

  async promptInstall() {
    if (!this.deferredPrompt) {
      alert(
        'Para instalar o app:\n\n' +
        '• Chrome/Edge (PC): menu ⋮ → Instalar Carona\n' +
        '• Android: menu → Adicionar à tela inicial\n' +
        '• iPhone: Compartilhar → Adicionar à Tela de Início\n\n' +
        'Acesse sempre por http://localhost:3000 com o servidor ligado.'
      );
      return;
    }
    this.deferredPrompt.prompt();
    await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    this.showInstallButton(false);
  },

  async requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch { /* ignore */ }
    }
  },

  notify(title, options = {}) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const n = new Notification(title, {
        icon: '/assets/icon-192.png',
        badge: '/assets/logo.svg',
        ...options
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch { /* ignore */ }
  },

  playAlert() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1175, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch { /* ignore */ }
  }
};

window.caronaPwa = caronaPwa;
document.addEventListener('DOMContentLoaded', () => caronaPwa.init());
