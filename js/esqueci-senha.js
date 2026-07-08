document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('forgotForm');
  const feedback = document.getElementById('forgotFeedback');
  const hint = document.getElementById('resetHint');
  const resetLink = document.getElementById('resetLink');
  const btn = document.getElementById('forgotBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    showFeedback(feedback, '', '');
    hint.hidden = true;

    const email = form.email.value.trim();

    if (!isValidEmail(email)) {
      form.email.classList.add('error');
      return showFeedback(feedback, 'Informe um e-mail válido.', 'error');
    }

    btn.disabled = true;
    btn.textContent = '⏳ Enviando...';

    try {
      const data = await api.forgotPassword(email);
      showFeedback(feedback, '✅ ' + data.message, 'success');

      if (data.resetLink) {
        const link = api.resolveUrl(data.resetLink);
        resetLink.href = link;
        resetLink.textContent = link;
        hint.hidden = false;
      }
    } catch (err) {
      showFeedback(feedback, err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '📧 Enviar link de redefinição';
    }
  });
});
