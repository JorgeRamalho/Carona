function renderProfilePanel(user, extraReadonlyHtml = '', tipoLabel = '') {
  const container = document.getElementById('profileContent');
  if (!container) return;

  container.innerHTML = `
    <div class="profile-readonly">
      <div class="profile-field"><label>Nome</label><span>${escapeHtml(user.nome || '—')}</span></div>
      ${extraReadonlyHtml}
      <div class="profile-field"><label>Tipo de conta</label><span>${tipoLabel}</span></div>
      <div class="profile-field"><label>Membro desde</label><span>${user.criadoEm ? formatDate(user.criadoEm) : '—'}</span></div>
    </div>

    <form class="profile-form" id="profileForm" novalidate>
      <h3>✏️ Alterar dados</h3>
      <p class="profile-form-desc">Atualize seu e-mail, telefone e cidade.</p>
      <div class="profile-form-grid">
        <div class="form-group">
          <label for="profile-email">E-mail</label>
          <input type="email" id="profile-email" name="email" value="${escapeHtml(user.email || '')}" required>
        </div>
        <div class="form-group">
          <label for="profile-telefone">Telefone / WhatsApp</label>
          <input type="tel" id="profile-telefone" name="telefone" value="${escapeHtml(user.telefone || '')}" required>
        </div>
        <div class="form-group full-width">
          <label for="profile-cidade">Cidade</label>
          <input type="text" id="profile-cidade" name="cidade" value="${escapeHtml(user.cidade || '')}" required>
        </div>
      </div>
      <button type="submit" class="btn btn-primary btn-sm" id="profileSaveBtn">💾 Salvar alterações</button>
      <p class="form-feedback" id="profileFeedback" role="status"></p>
    </form>

    <div class="profile-session">
      <h3>🔐 Acesso à conta</h3>
      <p class="profile-session-status">
        Você está conectado como <strong>${escapeHtml(user.email || '')}</strong>
      </p>
      <div class="profile-session-actions">
        <button type="button" class="btn btn-danger btn-sm" id="profileLogoutBtn">🚪 Sair da conta</button>
        <button type="button" class="btn btn-secondary btn-sm" id="profileToggleLoginBtn">🔑 Entrar com outra conta</button>
      </div>

      <form class="profile-login-form" id="profileLoginForm" hidden novalidate>
        <p class="profile-form-desc">Faça login com outro e-mail e senha.</p>
        <div class="profile-form-grid">
          <div class="form-group full-width">
            <label for="profile-login-email">E-mail</label>
            <input type="email" id="profile-login-email" name="email" placeholder="outro@email.com" required>
          </div>
          <div class="form-group full-width">
            <label for="profile-login-senha">Senha</label>
            <input type="password" id="profile-login-senha" name="senha" placeholder="Sua senha" required>
          </div>
        </div>
        <button type="submit" class="btn btn-primary btn-sm" id="profileLoginBtn">🚀 Entrar</button>
        <p class="form-feedback" id="profileLoginFeedback" role="status"></p>
      </form>
    </div>
  `;

  document.getElementById('profile-telefone').addEventListener('input', formatInput);
  document.getElementById('profileForm').addEventListener('submit', handleProfileSubmit);
  document.getElementById('profileLogoutBtn').addEventListener('click', () => auth.logout());
  document.getElementById('profileToggleLoginBtn').addEventListener('click', toggleProfileLogin);
  document.getElementById('profileLoginForm').addEventListener('submit', handleProfileLogin);
}

function toggleProfileLogin() {
  const form = document.getElementById('profileLoginForm');
  const btn = document.getElementById('profileToggleLoginBtn');
  const isHidden = form.hidden;
  form.hidden = !isHidden;
  btn.textContent = isHidden ? '✖️ Cancelar' : '🔑 Entrar com outra conta';
  if (isHidden) document.getElementById('profile-login-email').focus();
}

async function loadProfilePanel(getExtraHtml, tipoLabel) {
  let user;
  try {
    ({ user } = await api.getMe());
    auth.saveSession(auth.getToken(), user);
  } catch {
    user = auth.getUser() || {};
  }

  const extra = typeof getExtraHtml === 'function' ? getExtraHtml(user) : '';
  renderProfilePanel(user, extra, tipoLabel);
}

async function handleProfileLogin(e) {
  e.preventDefault();
  const form = e.target;
  const feedback = document.getElementById('profileLoginFeedback');
  const btn = document.getElementById('profileLoginBtn');

  clearErrors(form);
  showFeedback(feedback, '', '');

  const email = form.email.value.trim();
  const senha = form.senha.value;

  if (!isValidEmail(email)) {
    form.email.classList.add('error');
    return showFeedback(feedback, 'Informe um e-mail válido.', 'error');
  }
  if (!senha) {
    form.senha.classList.add('error');
    return showFeedback(feedback, 'Informe sua senha.', 'error');
  }

  btn.disabled = true;
  btn.textContent = '⏳ Entrando...';

  try {
    const { token, user } = await api.login(email, senha);
    auth.saveSession(token, user);
    showFeedback(feedback, '✅ Login realizado! Redirecionando...', 'success');
    setTimeout(() => auth.redirectByRole(), 800);
  } catch (err) {
    showFeedback(feedback, err.message, 'error');
    btn.disabled = false;
    btn.textContent = '🚀 Entrar';
  }
}

async function handleProfileSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const feedback = document.getElementById('profileFeedback');
  const btn = document.getElementById('profileSaveBtn');
  const btnText = btn.textContent;

  clearErrors(form);
  showFeedback(feedback, '', '');

  const email = form.email.value.trim();
  const telefone = form.telefone.value.trim();
  const cidade = form.cidade.value.trim();

  if (!isValidEmail(email)) {
    form.email.classList.add('error');
    return showFeedback(feedback, 'Informe um e-mail válido.', 'error');
  }
  if (telefone.replace(/\D/g, '').length < 10) {
    form.telefone.classList.add('error');
    return showFeedback(feedback, 'Informe um telefone válido.', 'error');
  }
  if (!cidade) {
    form.cidade.classList.add('error');
    return showFeedback(feedback, 'Informe sua cidade.', 'error');
  }

  btn.disabled = true;
  btn.textContent = '⏳ Salvando...';

  try {
    const { user, token, message } = await api.updateProfile(email, telefone, cidade);
    auth.saveSession(token, user);
    showFeedback(feedback, `✅ ${message}`, 'success');
    form.email.value = user.email;
    form.telefone.value = user.telefone;
    form.cidade.value = user.cidade;
  } catch (err) {
    showFeedback(feedback, err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = btnText;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

window.loadProfilePanel = loadProfilePanel;
