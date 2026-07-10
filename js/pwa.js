const caronaPwa = {
  deferredPrompt: null,
  modalEl: null,
  ready: false,

  async init() {
    this.ensureModal();
    this.bindInstallButtons();
    this.updateInstallVisibility();

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.ready = true;
      this.updateInstallVisibility();
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.closeInstallGuide();
      this.updateInstallVisibility();
      this.toast('Carona instalado! Abra pelo ícone na área de trabalho ou na tela inicial.');
    });

    if (!('serviceWorker' in navigator)) {
      this.updateInstallVisibility();
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
    }

    this.updateInstallVisibility();
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

  isWindows() {
    return /Win/i.test(navigator.platform) || /Windows/i.test(navigator.userAgent);
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
          this.toast('Instalação cancelada. Você pode baixar o atalho abaixo.');
          this.openInstallGuide();
        }
        return;
      } catch (err) {
        console.warn('Falha no prompt de instalação:', err);
      }
    }

    if (!this.deferredPrompt && 'serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.ready;
        await new Promise((r) => setTimeout(r, 500));
        if (this.deferredPrompt) return this.promptInstall();
      } catch { /* ignore */ }
    }

    this.openInstallGuide();
  },

  downloadDesktopShortcut() {
    const a = document.createElement('a');
    a.href = '/api/download-atalho';
    a.download = 'Carona.url';
    document.body.appendChild(a);
    a.click();
    a.remove();
    this.toast('Atalho baixado! Abra o arquivo Carona.url ou mova para a área de trabalho.');
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
          Baixe o atalho ou instale pelo navegador — abre como aplicativo no seu dispositivo.
        </p>
        <ol class="pwa-install-steps" id="pwa-install-steps"></ol>
        <div class="pwa-install-actions">
          <button type="button" class="btn btn-primary pwa-install-cta" id="pwa-install-retry">
            📲 Tentar instalar agora
          </button>
          <a class="btn btn-secondary pwa-install-cta" id="pwa-download-shortcut" href="/api/download-atalho" download="Carona.url">
            ⬇️ Baixar atalho (Windows)
          </a>
        </div>
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
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        await new Promise((r) => setTimeout(r, 600));
      } catch { /* ignore */ }

      if (this.deferredPrompt) {
        this.closeInstallGuide();
        await this.promptInstall();
      } else if (this.isWindows()) {
        this.downloadDesktopShortcut();
      } else {
        this.toast('Use o ícone ⊕ na barra de endereço do Chrome/Edge, ou Baixar atalho.');
      }
    });

    modal.querySelector('#pwa-download-shortcut')?.addEventListener('click', (e) => {
      // deixa o download nativo do <a> acontecer; só mostra feedback
      setTimeout(() => {
        this.toast('Atalho baixado! Abra Carona.url ou mova para a área de trabalho.');
      }, 300);
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
        'Confirme em <strong>Adicionar</strong>.'
      ];
    }
    if (/android/i.test(navigator.userAgent)) {
      return [
        'Abra no <strong>Chrome</strong>.',
        'Toque no menu <strong>⋮</strong>.',
        'Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.',
        'Confirme a instalação.'
      ];
    }
    return [
      'Clique em <strong>Baixar atalho (Windows)</strong> abaixo — o arquivo <code>Carona.url</code> baixa na hora.',
      'Abra o arquivo ou arraste para a <strong>área de trabalho</strong>.',
      'Ou no Chrome/Edge: ícone <strong>⊕</strong> na barra de endereço → <strong>Instalar Carona</strong>.',
      'Se não aparecer o ícone: menu <strong>⋮</strong> → <strong>Instalar Carona</strong> / <strong>Aplicativos</strong>.'
    ];
  },

  openInstallGuide() {
    this.ensureModal();
    const list = this.modalEl.querySelector('#pwa-install-steps');
    list.innerHTML = this.getInstallSteps().map((step) => `<li>${step}</li>`).join('');

    const hint = this.modalEl.querySelector('#pwa-install-hint');
    if (hint) {
      hint.innerHTML = this.canUseNativePrompt()
        ? 'O instalador do navegador está pronto — clique em <strong>Tentar instalar agora</strong>.'
        : 'O Chrome às vezes esconde o instalador automático. Use <strong>Baixar atalho</strong> — funciona sempre no Windows.';
    }

    const retry = this.modalEl.querySelector('#pwa-install-retry');
    const shortcut = this.modalEl.querySelector('#pwa-download-shortcut');
    if (retry) {
      retry.hidden = this.isIos() && !this.canUseNativePrompt();
      retry.textContent = this.canUseNativePrompt()
        ? '📲 Instalar agora'
        : '📲 Tentar instalar agora';
    }
    if (shortcut) {
      shortcut.hidden = this.isIos() || /android/i.test(navigator.userAgent);
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
    this._toastTimer = setTimeout(() => el.classList.remove('is-visible'), 4500);
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => caronaPwa.init());
} else {
  caronaPwa.init();
}
