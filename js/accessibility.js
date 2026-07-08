function isHomePage() {
  const path = window.location.pathname.replace(/\\/g, '/');
  return path === '/' || path.endsWith('/index.html') || path.endsWith('/');
}

function isAuthPage() {
  return document.body.classList.contains('auth-page');
}

function isPassengerPage() {
  const path = window.location.pathname.replace(/\\/g, '/');
  return path.includes('passageiro');
}

function initAccessibilityNav() {
  if (isPassengerPage()) return;

  const home = isHomePage();
  const authPage = isAuthPage();
  const nav = document.createElement('nav');
  nav.className = 'a11y-nav';
  nav.setAttribute('aria-label', 'Navegação de acessibilidade');

  let buttons = '';

  if (authPage) {
    buttons += `
      <button type="button" class="a11y-btn" id="a11yBackBtn" aria-label="Voltar à página anterior">
        <span class="a11y-arrow" aria-hidden="true">←</span>
        <span class="a11y-label">Voltar</span>
      </button>
    `;
  } else {
    if (!home) {
      buttons += `
        <button type="button" class="a11y-btn" id="a11yBackBtn" aria-label="Voltar à página anterior">
          <span class="a11y-arrow" aria-hidden="true">←</span>
          <span class="a11y-label">Voltar</span>
        </button>
        <a href="/" class="a11y-btn a11y-btn-home" aria-label="Voltar à página inicial">
          <span class="a11y-arrow" aria-hidden="true">⇐</span>
          <span class="a11y-label">Início</span>
        </a>
      `;
    }

    buttons += `
      <button type="button" class="a11y-btn" id="a11yTopBtn" aria-label="Voltar ao topo da página">
        <span class="a11y-arrow" aria-hidden="true">↑</span>
        <span class="a11y-label">Topo</span>
      </button>
    `;
  }

  nav.innerHTML = buttons;

  if (authPage) {
    nav.classList.add('a11y-nav--auth');
    const authFeatures = document.querySelector('.auth-features');
    if (authFeatures) {
      authFeatures.prepend(nav);
    } else {
      const authContainer = document.querySelector('.auth-container');
      if (authContainer) authContainer.appendChild(nav);
      else document.body.appendChild(nav);
    }
  } else {
    document.body.appendChild(nav);
  }

  document.getElementById('a11yBackBtn')?.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/';
    }
  });

  document.getElementById('a11yTopBtn')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

document.addEventListener('DOMContentLoaded', initAccessibilityNav);
