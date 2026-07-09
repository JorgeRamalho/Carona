/**
 * Carona — Landing Page
 */

document.addEventListener('DOMContentLoaded', () => {
  if (auth.isLoggedIn()) {
    const user = auth.getUser();
    updateHeaderForLoggedUser(user);
  }

  initHeader();
  initMobileMenu();
  initTabs();
  initForms();
  initHeroCTA();
  initCadastroFromUrl();
  initInstallQr();
  initLandingRideHub();
});

function initLandingRideHub() {
  const select = document.getElementById('landing-pagamento');
  const chips = document.querySelectorAll('#pedir-corrida .pay-chip');
  if (!select || !chips.length) return;

  const sync = () => {
    chips.forEach((chip) => {
      chip.classList.toggle('is-active', chip.dataset.pay === select.value);
    });
  };

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      select.value = chip.dataset.pay;
      sync();
    });
  });

  select.addEventListener('change', sync);
  sync();
}

async function initInstallQr() {
  const label = document.getElementById('qrInstallUrlLabel');
  const img = document.getElementById('qrInstallImage');
  if (!label && !img) return;

  try {
    const res = await fetch('/api/install-url');
    const data = await res.json();
    if (label && data.url) {
      label.innerHTML = `Link: <a href="${data.url}">${data.url}</a>`;
    }
    if (img) {
      img.src = `/api/qr-install.png?t=${Date.now()}`;
    }
  } catch {
    if (label) {
      const fallback = `${window.location.origin}/instalar.html`;
      label.innerHTML = `Link: <a href="${fallback}">${fallback}</a>`;
    }
  }
}

function updateHeaderForLoggedUser(user) {
  const nav = document.getElementById('nav');
  // Passageiro vai direto para "Para onde vamos"; motorista para o painel de corridas
  const dashboardUrl = user.tipo === 'motorista'
    ? '/motorista.html#corridas'
    : '/passageiro.html#solicitar';
  const loginBtn = nav.querySelector('.btn-nav-login');
  if (loginBtn) {
    loginBtn.href = dashboardUrl;
    loginBtn.textContent = 'Meu painel';
    loginBtn.classList.remove('btn-secondary');
    loginBtn.classList.add('btn-nav');
  }
}

function initHeader() {
  const header = document.getElementById('header');
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 50);
  });
}

function initMobileMenu() {
  const toggle = document.getElementById('menuToggle');
  const nav = document.getElementById('nav');

  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    toggle.classList.toggle('active', isOpen);
    toggle.setAttribute('aria-expanded', isOpen);
  });

  nav.querySelectorAll('a, button').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.classList.remove('active');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  const forms = {
    passageiro: document.getElementById('form-passageiro'),
    motorista: document.getElementById('form-motorista')
  };

  tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  window.switchTab = switchTab;

  function switchTab(target) {
    tabs.forEach(t => {
      const isActive = t.dataset.tab === target;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', isActive);
    });
    Object.entries(forms).forEach(([key, form]) => {
      const isActive = key === target;
      form.classList.toggle('active', isActive);
      form.hidden = !isActive;
    });
  }
}

function getHeaderOffset() {
  const header = document.getElementById('header');
  return (header ? header.offsetHeight : 72) + 16;
}

function scrollToCadastro(tab = 'passageiro') {
  if (tab && window.switchTab) window.switchTab(tab);

  const target = document.getElementById('cadastro-form');
  if (!target) return;

  const scroll = () => {
    const top = target.getBoundingClientRect().top + window.scrollY - getHeaderOffset();
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(scroll);
  });
}

function initHeroCTA() {
  document.querySelectorAll('a[data-tab]:not(.tab)').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      scrollToCadastro(btn.dataset.tab);
      history.replaceState(null, '', `?tab=${btn.dataset.tab}#cadastro-form`);
    });
  });
}

function initCadastroFromUrl() {
  const { hash, search } = window.location;
  const tab = new URLSearchParams(search).get('tab');
  if (!hash.includes('cadastro') && !tab) return;

  const validTab = tab === 'motorista' ? 'motorista' : 'passageiro';
  setTimeout(() => scrollToCadastro(validTab), 150);
}

function initForms() {
  setupForm('form-passageiro', 'feedback-passageiro', validatePassengerForm, async (data) => {
    const { nome, email, telefone, cpf, senha, cidade } = data;
    return api.registerPassageiro({ nome, email, telefone, cpf, senha, cidade });
  });

  setupForm('form-motorista', 'feedback-motorista', validateDriverForm, async (data) => {
    const { nome, email, telefone, cpf, senha, cidade, cnh, cnh_categoria, veiculo, placa, cor, ano } = data;
    return api.registerMotorista({ nome, email, telefone, cpf, senha, cidade, cnh, cnh_categoria, veiculo, placa, cor, ano });
  });

  document.querySelectorAll('input[type="tel"], input[name="cpf"], input[name="telefone"], input[name="placa"]').forEach(input => {
    input.addEventListener('input', formatInput);
  });
}

function setupForm(formId, feedbackId, validator, submitFn) {
  const form = document.getElementById(formId);
  const feedback = document.getElementById(feedbackId);
  const btn = form.querySelector('.btn-submit');
  const btnText = btn.textContent;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    showFeedback(feedback, '', '');

    const errors = validator(form);
    if (errors.length > 0) {
      errors.forEach(({ field }) => {
        const input = form.querySelector(`[name="${field}"]`);
        if (input) input.classList.add('error');
      });
      showFeedback(feedback, errors[0].message, 'error');
      return;
    }

    const data = Object.fromEntries(new FormData(form).entries());
    btn.disabled = true;
    btn.textContent = '⏳ Cadastrando...';

    try {
      const result = await submitFn(data);
      auth.saveSession(result.token, result.user);
      showFeedback(feedback, '✅ Cadastro realizado! Redirecionando...', 'success');
      form.reset();
      setTimeout(() => auth.redirectByRole(), 1200);
    } catch (err) {
      showFeedback(feedback, err.message, 'error');
      btn.disabled = false;
      btn.textContent = btnText;
    }
  });
}
