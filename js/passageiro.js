let currentEstimate = null;
let pollInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!auth.requireAuth('passageiro')) return;
  initDashboard();
});

function initDashboard() {
  const user = auth.getUser();
  document.getElementById('userName').textContent = user.nome.split(' ')[0];

  document.getElementById('logoutBtn').addEventListener('click', () => auth.logout());
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => switchPanel(link.dataset.panel));
  });

  document.getElementById('estimateBtn').addEventListener('click', handleEstimate);
  document.getElementById('rideForm').addEventListener('submit', handleCreateRide);

  loadStats();
  loadRides();
  pollInterval = setInterval(loadRides, 5000);
}

function switchPanel(panel) {
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.toggle('active', l.dataset.panel === panel));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${panel}`));
  document.getElementById('sidebar').classList.remove('open');
  if (panel === 'perfil') loadPassageiroProfile();
}

function loadPassageiroProfile() {
  loadProfilePanel(
    (user) => `<div class="profile-field"><label>CPF</label><span>${user.cpf || '—'}</span></div>`,
    '🧳 Passageiro'
  );
}

async function loadStats() {
  try {
    const stats = await api.getStats();
    document.getElementById('statCorridas').textContent = stats.concluidas;
    document.getElementById('statGasto').textContent = formatCurrency(stats.totalGasto);
  } catch { /* silent */ }
}

async function handleEstimate() {
  const origem = document.getElementById('origem').value.trim();
  const destino = document.getElementById('destino').value.trim();
  const feedback = document.getElementById('rideFeedback');

  if (!origem || !destino) {
    return showFeedback(feedback, 'Informe origem e destino.', 'error');
  }

  try {
    currentEstimate = await api.estimateRide(origem, destino);
    document.getElementById('estimateValue').textContent = formatCurrency(currentEstimate.total);
    document.getElementById('estimateDist').textContent = `${currentEstimate.distancia} km`;
    document.getElementById('estimateTaxa').textContent = formatCurrency(currentEstimate.taxa);
    document.getElementById('estimateEco').textContent = formatCurrency(currentEstimate.economia);
    document.getElementById('estimateResult').hidden = false;
    showFeedback(feedback, '', '');
  } catch (err) {
    showFeedback(feedback, err.message, 'error');
  }
}

async function handleCreateRide(e) {
  e.preventDefault();
  const origem = document.getElementById('origem').value.trim();
  const destino = document.getElementById('destino').value.trim();
  const feedback = document.getElementById('rideFeedback');

  if (!origem || !destino) {
    return showFeedback(feedback, 'Informe origem e destino.', 'error');
  }

  try {
    const { ride } = await api.createRide(origem, destino);
    showFeedback(feedback, '✅ Corrida solicitada! Aguardando motorista...', 'success');
    document.getElementById('rideForm').reset();
    document.getElementById('estimateResult').hidden = true;
    currentEstimate = null;
    loadRides();
    loadStats();
    switchPanel('historico');
  } catch (err) {
    showFeedback(feedback, err.message, 'error');
  }
}

async function loadRides() {
  try {
    const { rides } = await api.getRides();
    renderRidesList(rides);
    renderActiveRide(rides);
  } catch { /* silent */ }
}

function renderRidesList(rides) {
  const container = document.getElementById('ridesList');
  if (!rides.length) {
    container.innerHTML = '<p class="empty-state">Nenhuma corrida ainda. Solicite sua primeira! 🚗</p>';
    return;
  }

  container.innerHTML = rides.map(ride => `
    <div class="ride-item">
      <div class="ride-item-header">
        ${statusBadge(ride.status)}
        <span class="ride-date">${formatDate(ride.criadoEm)}</span>
      </div>
      <div class="ride-route">
        <div class="route-point"><span class="route-dot origin"></span> ${ride.origem}</div>
        <div class="route-point"><span class="route-dot dest"></span> ${ride.destino}</div>
      </div>
      <div class="ride-item-footer">
        <span class="ride-price">${formatCurrency(ride.total)}</span>
        ${ride.motoristaNome ? `<span class="ride-driver">🚙 ${ride.motoristaNome}</span>` : ''}
        ${['aguardando', 'aceita'].includes(ride.status)
          ? `<button class="btn btn-sm btn-danger" onclick="cancelRide('${ride.id}')">Cancelar</button>`
          : ''}
        ${ride.status === 'concluida' && !ride.avaliacao
          ? `<button class="btn btn-sm btn-primary" onclick="rateRide('${ride.id}')">⭐ Avaliar</button>`
          : ride.avaliacao ? `<span class="ride-rating">${'⭐'.repeat(ride.avaliacao)}</span>` : ''}
      </div>
    </div>
  `).join('');
}

function renderActiveRide(rides) {
  const active = rides.find(r => ['aguardando', 'aceita', 'em_andamento'].includes(r.status));
  const card = document.getElementById('activeRideCard');
  const content = document.getElementById('activeRideContent');

  if (!active) {
    card.hidden = true;
    return;
  }

  card.hidden = false;
  content.innerHTML = `
    ${statusBadge(active.status)}
    <div class="ride-route" style="margin: 16px 0">
      <div class="route-point"><span class="route-dot origin"></span> ${active.origem}</div>
      <div class="route-point"><span class="route-dot dest"></span> ${active.destino}</div>
    </div>
    <div class="active-ride-price">
      <span>${formatCurrency(active.total)}</span>
      <small>Taxa: ${formatCurrency(active.taxa)} (5%)</small>
    </div>
    ${active.motoristaNome ? `<p class="active-driver">🚙 Motorista: <strong>${active.motoristaNome}</strong></p>` : '<p class="active-driver">⏳ Procurando motorista...</p>'}
    ${['aguardando', 'aceita'].includes(active.status)
      ? `<button class="btn btn-danger btn-sm" onclick="cancelRide('${active.id}')">Cancelar corrida</button>`
      : ''}
  `;
}

window.cancelRide = async function(id) {
  if (!confirm('Deseja cancelar esta corrida?')) return;
  try {
    await api.cancelRide(id);
    loadRides();
    loadStats();
  } catch (err) {
    alert(err.message);
  }
};

window.rateRide = async function(id) {
  const rating = prompt('Avalie de 1 a 5 estrelas:', '5');
  const num = parseInt(rating, 10);
  if (isNaN(num) || num < 1 || num > 5) return alert('Informe um valor de 1 a 5.');
  try {
    await api.completeRide(id, num);
    loadRides();
  } catch (err) {
    alert(err.message);
  }
};
