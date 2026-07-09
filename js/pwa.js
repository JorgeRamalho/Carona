const caronaPwa = {
  deferredPrompt: null,
  modalEl: null,
  ready: false,

  async init() {
    this.ensureModal();
    this.bindInstallButtons();
    this.updateInstallVisibility();

    // Listener ANTES do register — senão o Chrome pode disparar o evento e perdermos
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.updateInstallVisibility();
      this.ready = true;
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.closeInstallGuide();
      this.updateInstallVisibility();
      this.toast('Carona instalado! Abra pelo ícone na área de trabalho ou na tela inicial.');
    });

    if (!('serviceWorker' in navigator)) {
      this.toast('Este navegador não suporta instalação de apps web.');
      return;
    }

    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;

      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            worker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    } catch (err) {
      console.warn('Service worker não registrado:', err.message);
      this.toast('Não foi possível ativar o instalador. Recarregue a página.');
    }

    // Se o prompt já estiver disponível via getInstalledRelatedApps / related, só atualiza UI
    this.updateInstallVisibility();
    this.requestNotificationPermission();
  },

  isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      window.navigator.standalone === true
    );
  },

  isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  },

  canUseNativePrompt() {
    return !!this.deferredPrompt;
  },

  bindInstallButtons() {
    document.querySelectorAll('[data-pwa-install]').forEach((btn) => {
      if (btn.dataset.pwaBound === '1') return;
      btn.dataset.pwaBound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.promptInstall();
      });
    });
  },

  updateInstallVisibility() {
    const installed = this.isStandalone();
    document.querySelectorAll('[data-pwa-install]').forEach((btn) => {
      if (installed) {
        btn.hidden = true;
        btn.setAttribute('aria-hidden', 'true');
      } else {
        btn.hidden = false;
        btn.removeAttribute('hidden');
        btn.setAttribute('aria-hidden', 'false');
      }
    });
  },

  showInstallButton(show) {
    document.querySelectorAll('[data-pwa-install]').forEach((btn) => {
      btn.hidden = !show;
    });
  },

  async promptInstall() {
    if (this.isStandalone()) {
      this.toast('O Carona já está instalado neste dispositivo.');
      return;
    }

    if (this.deferredPrompt) {
      try {
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        this.deferredPrompt = null;
        if (outcome === 'accepted') {
          this.showInstallButton(false);
          this.toast('Instalação iniciada…');
        } else {
          this.updateInstallVisibility();
          this.toast('Instalação cancelada. Você pode tentar de novo quando quiser.');
        }
        return;
      } catch (err) {
        console.warn('Falha no prompt de instalação:', err);
      }
    }

    // Aguarda um pouco caso o SW ainda esteja ativando
    if (!this.deferredPrompt && 'serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.ready;
        await new Promise((r) => setTimeout(r, 400));
        if (this.deferredPrompt) {
          return this.promptInstall();
        }
      } catch { /* ignore */ }
    }

    this.openInstallGuide();
  },

  ensureModal() {
    if (document.getElementById('pwa-install-modal')) {
      this.modalEl = document.getElementById('pwa-install-modal');
      return;
    }

    const modal = document.createElement('div');
    modal.id = 'pwa-install-modal';
    modal.className = 'pwa-install-modal';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'pwa-install-title');
    modal.innerHTML = `
      <div class="pwa-install-backdrop" data-pwa-close></div>
      <div class="pwa-install-sheet">
        <button type="button" class="pwa-install-close" data-pwa-close aria-label="Fechar">×</button>
        <div class="pwa-install-icon" aria-hidden="true">🚗</div>
        <h2 id="pwa-install-title">Instalar o app Carona</h2>
        <p class="pwa-install-lead">
          Instale como aplicativo no seu dispositivo — abre em janela própria, sem barra do navegador.
        </p>
        <ol class="pwa-install-steps" id="pwa-install-steps"></ol>
        <button type="button" class="btn btn-primary pwa-install-cta" id="pwa-install-retry">
          📲 Tentar instalar agora
        </button>
        <p class="pwa-install-hint" id="pwa-install-hint"></p>
      </div>
    `;
    document.body.appendChild(modal);
    this.modalEl = modal;

    modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-pwa-close]')) this.closeInstallGuide();
    });

    modal.querySelector('#pwa-install-retry')?.addEventListener('click', async () => {
      if (this.deferredPrompt) {
        this.closeInstallGuide();
        await this.promptInstall();
        return;
      }
      // Força re-registro do SW e tenta de novo
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        await new Promise((r) => setTimeout(r, 600));
      } catch { /* ignore */ }

      if (this.deferredPrompt) {
        this.closeInstallGuide();
        await this.promptInstall();
      } else {
        this.toast('Recarregue a página (Ctrl+Shift+R) e clique em Instalar de novo.');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalEl && !this.modalEl.hidden) {
        this.closeInstallGuide();
      }
    });
  },

  getInstallSteps() {
    if (this.isIos()) {
      return [
        'Abra o site no <strong>Safari</strong>.',
        'Toque em <strong>Compartilhar</strong> (ícone □↑).',
        'Escolha <strong>Adicionar à Tela de Início</strong>.',
        'Confirme em <strong>Adicionar</strong> — o ícone Carona aparece na tela inicial.'
      ];
    }
    if (/android/i.test(navigator.userAgent)) {
      return [
        'Abra no <strong>Chrome</strong>.',
        'Toque no menu <strong>⋮</strong> (canto superior).',
        'Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.',
        'Confirme — o Carona fica como app no seu celular.'
      ];
    }
    return [
      'Use <strong>Chrome</strong> ou <strong>Edge</strong> em <code>http://localhost:3000</code>.',
      'Pressione <strong>Ctrl + Shift + R</strong> para recarregar sem cache.',
      'Clique de novo em <strong>Instalar app</strong>, ou no ícone ⊕ na barra de endereço.',
      'Confirme — o atalho Carona aparece na área de trabalho / menu Iniciar.'
    ];
  },

  openInstallGuide() {
    this.ensureModal();
    const list = this.modalEl.querySelector('#pwa-install-steps');
    list.innerHTML = this.getInstallSteps().map((step) => `<li>${step}</li>`).join('');

    const hint = this.modalEl.querySelector('#pwa-install-hint');
    if (hint) {
      hint.innerHTML = this.canUseNativePrompt()
        ? 'O instalador está pronto — clique no botão abaixo.'
        : 'Se o botão automático não abrir, use o ícone de instalação na barra de endereço do Chrome/Edge.';
    }

    const retry = this.modalEl.querySelector('#pwa-install-retry');
    if (retry) {
      retry.hidden = this.isIos() && !this.canUseNativePrompt();
      retry.textContent = this.canUseNativePrompt()
        ? '📲 Instalar agora'
        : '📲 Tentar instalar agora';
    }

    this.modalEl.hidden = false;
    document.body.classList.add('pwa-modal-open');
    this.modalEl.querySelector('.pwa-install-close')?.focus();
  },

  closeInstallGuide() {
    if (!this.modalEl) return;
    this.modalEl.hidden = true;
    document.body.classList.remove('pwa-modal-open');
  },

  toast(message) {
    let el = document.getElementById('pwa-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pwa-toast';
      el.className = 'pwa-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('is-visible'), 4200);
  },

  async requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default' && this.isStandalone()) {
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
        badge: '/assets/icon-192.png',
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

// Registra o mais cedo possível
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => caronaPwa.init());
} else {
  caronaPwa.init();
}
