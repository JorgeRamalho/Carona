function initSiteHeader() {
  const header = document.getElementById('header');
  if (!header) return;
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 50);
  }, { passive: true });
}

function initSiteMobileMenu() {
  const toggle = document.getElementById('menuToggle');
  const nav = document.getElementById('nav');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    toggle.classList.toggle('active', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  nav.querySelectorAll('a, button').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.classList.remove('active');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

function renderModeSwitcher() {
  if (!auth.isLoggedIn() || document.querySelector('.mode-switcher')) return;

  const modo = auth.getModoAtivo();
  const el = document.createElement('div');
  el.className = 'mode-switcher';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Modo do app');
  el.innerHTML = `
    <button type="button" class="mode-switcher-btn ${modo === 'passageiro' ? 'is-active' : ''}" data-modo="passageiro">🧳 Passageiro</button>
    <button type="button" class="mode-switcher-btn ${modo === 'motorista' ? 'is-active' : ''}" data-modo="motorista">🚙 Motorista</button>
  `;

  el.querySelectorAll('[data-modo]').forEach((btn) => {
    btn.addEventListener('click', () => handleModeSwitch(btn.dataset.modo));
  });

  const navActions = document.querySelector('.nav-actions');
  const sidebar = document.querySelector('.sidebar');
  if (navActions) {
    navActions.insertBefore(el, navActions.firstChild);
    return;
  }
  if (sidebar) {
    el.classList.add('mode-switcher--sidebar');
    const navBlock = sidebar.querySelector('.sidebar-nav');
    if (navBlock) sidebar.insertBefore(el, navBlock);
    else sidebar.prepend(el);
  }
}

function updateModeSwitcherUi() {
  const modo = auth.getModoAtivo();
  document.querySelectorAll('.mode-switcher-btn[data-modo]').forEach((btn) => {
    const active = btn.dataset.modo === modo;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

async function handleModeSwitch(modo) {
  if (!auth.isLoggedIn()) return;
  if (auth.getModoAtivo() === modo) {
    window.location.href = modo === 'motorista' ? '/motorista.html' : '/passageiro.html';
    return;
  }

  try {
    await auth.switchModo(modo);
    updateModeSwitcherUi();
    window.location.href = modo === 'motorista' ? '/motorista.html' : '/passageiro.html';
  } catch (err) {
    if (err.message?.includes('cadastro de motorista') || err.needsDriverProfile) {
      const go = confirm(
        'Para usar o modo Motorista, complete CNH e veículo. Abrir o perfil agora?'
      );
      if (go) window.location.href = '/motorista.html#perfil';
      return;
    }
    alert(err.message || 'Não foi possível alternar o modo.');
  }
}

function initModeNavLinks() {
  document.querySelectorAll('a[data-app-mode]').forEach((link) => {
    link.addEventListener('click', async (e) => {
      if (!auth.isLoggedIn()) return;
      const modo = link.dataset.appMode;
      if (auth.getModoAtivo() === modo) return;
      e.preventDefault();
      await handleModeSwitch(modo);
    });
  });
}

window.handleModeSwitch = handleModeSwitch;
window.renderModeSwitcher = renderModeSwitcher;
window.updateModeSwitcherUi = updateModeSwitcherUi;

document.addEventListener('DOMContentLoaded', async () => {
  if (auth.isLoggedIn()) {
    await auth.syncSessionFromServer();
    auth.updateHeaderForLoggedUser();
  }
  if (document.getElementById('header') || document.querySelector('.sidebar')) {
    initSiteHeader();
    initSiteMobileMenu();
    renderModeSwitcher();
    initModeNavLinks();
  }
});
