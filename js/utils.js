function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidCPF(cpf) {
  return cpf.replace(/\D/g, '').length === 11;
}

function isValidPlaca(placa) {
  const cleaned = placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return cleaned.length === 7;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatInput(e) {
  const input = e.target;
  let value = input.value;

  if (input.name === 'telefone' || input.type === 'tel') {
    value = value.replace(/\D/g, '').slice(0, 11);
    if (value.length > 6) {
      value = value.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
    } else if (value.length > 2) {
      value = value.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
    }
    input.value = value;
  }

  if (input.name === 'cpf') {
    value = value.replace(/\D/g, '').slice(0, 11);
    value = value.replace(/(\d{3})(\d)/, '$1.$2');
    value = value.replace(/(\d{3})(\d)/, '$1.$2');
    value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    input.value = value;
  }

  if (input.name === 'placa') {
    input.value = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  }
}

function clearErrors(form) {
  form.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
}

function showFeedback(el, message, type) {
  el.textContent = message;
  el.className = `form-feedback ${type}`;
}

const STATUS_LABELS = {
  aguardando: { text: 'Aguardando motorista', emoji: '⏳', class: 'status-waiting' },
  aceita: { text: 'Motorista a caminho', emoji: '🚗', class: 'status-accepted' },
  em_andamento: { text: 'Em andamento', emoji: '🛣️', class: 'status-active' },
  concluida: { text: 'Concluída', emoji: '✅', class: 'status-done' },
  cancelada: { text: 'Cancelada', emoji: '❌', class: 'status-cancelled' }
};

function statusBadge(status) {
  const s = STATUS_LABELS[status] || { text: status, emoji: '❓', class: '' };
  return `<span class="status-badge ${s.class}">${s.emoji} ${s.text}</span>`;
}

function validatePassengerForm(form) {
  const errors = [];
  if (form.nome.value.trim().length < 3) errors.push({ field: 'nome', message: 'Informe seu nome completo.' });
  if (!isValidEmail(form.email.value.trim())) errors.push({ field: 'email', message: 'Informe um e-mail válido.' });
  if (form.telefone.value.replace(/\D/g, '').length < 10) errors.push({ field: 'telefone', message: 'Informe um telefone válido.' });
  if (!isValidCPF(form.cpf.value)) errors.push({ field: 'cpf', message: 'Informe um CPF válido.' });
  if (form.senha.value.length < 8) errors.push({ field: 'senha', message: 'A senha deve ter no mínimo 8 caracteres.' });
  if (form.senha.value !== form.confirmar_senha.value) errors.push({ field: 'confirmar_senha', message: 'As senhas não coincidem.' });
  if (!form.cidade.value.trim()) errors.push({ field: 'cidade', message: 'Informe sua cidade.' });
  if (!form.termos.checked) errors.push({ field: 'termos', message: 'Aceite os termos para continuar.' });
  return errors;
}

function validateDriverForm(form) {
  const errors = validatePassengerForm(form);
  if (form.cnh.value.trim().length < 9) errors.push({ field: 'cnh', message: 'Informe um número de CNH válido.' });
  if (!form.cnh_categoria.value) errors.push({ field: 'cnh_categoria', message: 'Selecione a categoria da CNH.' });
  if (!form.veiculo.value.trim()) errors.push({ field: 'veiculo', message: 'Informe o modelo do veículo.' });
  if (!isValidPlaca(form.placa.value)) errors.push({ field: 'placa', message: 'Informe uma placa válida.' });
  if (!form.cor.value.trim()) errors.push({ field: 'cor', message: 'Informe a cor do veículo.' });
  const ano = parseInt(form.ano.value, 10);
  if (isNaN(ano) || ano < 2000 || ano > 2026) errors.push({ field: 'ano', message: 'Informe um ano válido.' });
  return errors;
}

window.utils = { isValidEmail, isValidCPF, isValidPlaca, formatCurrency, formatDate, formatInput, clearErrors, showFeedback, statusBadge, validatePassengerForm, validateDriverForm };
