document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('resetForm');
  const feedback = document.getElementById('resetFeedback');
  const btn = document.getElementById('resetBtn');
  const tokenInput = document.getElementById('token');

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  if (!token) {
    showFeedback(feedback, 'Link inválido ou expirado. Solicite uma nova redefinição.', 'error');
    btn.disabled = true;
    return;
  }

  tokenInput.value = token;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    showFeedback(feedback, '', '');

    const senha = form.senha.value;
    const confirmar = form.confirmar_senha.value;

    if (senha.length < 8) {
      form.senha.classList.add('error');
      return showFeedback(feedback, 'A senha deve ter no mínimo 8 caracteres.', 'error');
    }
    if (senha !== confirmar) {
      form.confirmar_senha.classList.add('error');
      return showFeedback(feedback, 'As senhas não coincidem.', 'error');
    }

    btn.disabled = true;
    btn.textContent = '⏳ Redefinindo...';

    try {
      await api.resetPassword(token, senha);
      showFeedback(feedback, '✅ Senha redefinida com sucesso! Redirecionando...', 'success');
      setTimeout(() => { window.location.href = 'login.html'; }, 1500);
    } catch (err) {
      showFeedback(feedback, err.message, 'error');
      btn.disabled = false;
      btn.textContent = '✅ Redefinir senha';
    }
  });
});
