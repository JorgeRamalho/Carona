function isHomePage() {
  const path = window.location.pathname.replace(/\\/g, '/');
  return path === '/' || path.endsWith('/index.html') || path.endsWith('/');
}

function initAccessibilityNav() {
  const home = isHomePage();
  const nav = document.createElement('nav');
  nav.className = 'a11y-nav';
  nav.setAttribute('aria-label', 'Navegação de acessibilidade');

  let buttons = '';

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

  nav.innerHTML = buttons;
  document.body.appendChild(nav);

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
