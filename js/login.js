document.addEventListener('DOMContentLoaded', () => {
  if (auth.isLoggedIn()) return auth.redirectByRole();

  const form = document.getElementById('loginForm');
  const feedback = document.getElementById('loginFeedback');
  const btn = document.getElementById('loginBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
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
  });
});
