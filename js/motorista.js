let pollInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!auth.requireAuth('motorista')) return;
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

  const onlineSwitch = document.getElementById('onlineSwitch');
  onlineSwitch.checked = user.online || false;
  updateOnlineLabel(onlineSwitch.checked);
  onlineSwitch.addEventListener('change', async () => {
    try {
      const { online } = await api.setDriverStatus(onlineSwitch.checked);
      updateOnlineLabel(online);
    } catch (err) {
      onlineSwitch.checked = !onlineSwitch.checked;
      alert(err.message);
    }
  });

  loadStats();
  loadRides();
  pollInterval = setInterval(loadRides, 5000);
}

function updateOnlineLabel(online) {
  document.getElementById('onlineLabel').textContent = online ? '🟢 Online' : '🔴 Offline';
  document.getElementById('onlineLabel').classList.toggle('online', online);
}

function switchPanel(panel) {
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.toggle('active', l.dataset.panel === panel));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${panel}`));
  document.getElementById('sidebar').classList.remove('open');
  if (panel === 'perfil') loadMotoristaProfile();
}

function loadMotoristaProfile() {
  loadProfilePanel((user) => {
    const v = user.veiculo || {};
    return `
      <div class="profile-field"><label>CPF</label><span>${user.cpf || '—'}</span></div>
      <div class="profile-field"><label>CNH</label><span>${user.cnh || '—'} (Cat. ${user.cnh_categoria || '—'})</span></div>
      <div class="profile-field"><label>Veículo</label><span>${v.modelo || '—'} — ${v.cor || ''} (${v.ano || ''})</span></div>
      <div class="profile-field"><label>Placa</label><span>${v.placa || '—'}</span></div>
    `;
  }, '🚙 Motorista');
}

async function loadStats() {
  try {
    const stats = await api.getStats();
    document.getElementById('statGanhos').textContent = formatCurrency(stats.totalGanho);
    document.getElementById('statCorridas').textContent = stats.concluidas;
    document.getElementById('earningsTotal').textContent = formatCurrency(stats.totalGanho);
    document.getElementById('earningsCount').textContent = stats.concluidas;
    document.getElementById('earningsTaxa').textContent = formatCurrency(stats.totalTaxa);
    const bruto = stats.totalGanho + stats.totalTaxa;
    document.getElementById('earningsBruto').textContent = formatCurrency(bruto);
    const perdido = bruto * 0.20;
    document.getElementById('earningsPerdido').textContent = formatCurrency(perdido);
  } catch { /* silent */ }
}

async function loadRides() {
  try {
    const { rides } = await api.getRides();
    const available = rides.filter(r => r.status === 'aguardando');
    const mine = rides.filter(r => r.motoristaId === auth.getUser().id);

    document.getElementById('statDisponiveis').textContent = available.length;
    renderAvailableRides(available);
    renderMyRides(mine);
    loadStats();
  } catch { /* silent */ }
}

function renderAvailableRides(rides) {
  const container = document.getElementById('availableRides');
  if (!rides.length) {
    container.innerHTML = '<p class="empty-state">Nenhuma corrida disponível no momento. Fique online! 📡</p>';
    return;
  }

  container.innerHTML = rides.map(ride => `
    <div class="ride-item available">
      <div class="ride-item-header">
        <span class="ride-passenger">🧳 ${ride.passageiroNome}</span>
        <span class="ride-date">${formatDate(ride.criadoEm)}</span>
      </div>
      <div class="ride-route">
        <div class="route-point"><span class="route-dot origin"></span> ${ride.origem}</div>
        <div class="route-point"><span class="route-dot dest"></span> ${ride.destino}</div>
      </div>
      <div class="ride-earnings">
        <div>
          <span class="earnings-you">Você recebe</span>
          <strong class="earnings-amount">${formatCurrency(ride.motorista)}</strong>
        </div>
        <div class="earnings-fee">
          <small>Taxa plataforma: ${formatCurrency(ride.taxa)} (5%)</small>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="acceptRide('${ride.id}')">✅ Aceitar corrida</button>
    </div>
  `).join('');
}

function renderMyRides(rides) {
  const container = document.getElementById('myRidesList');
  if (!rides.length) {
    container.innerHTML = '<p class="empty-state">Você ainda não aceitou nenhuma corrida.</p>';
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
        <div>
          <span class="ride-price">${formatCurrency(ride.motorista)}</span>
          <small> de ${formatCurrency(ride.total)}</small>
        </div>
        <span class="ride-passenger">🧳 ${ride.passageiroNome}</span>
        <div class="ride-actions">
          ${ride.status === 'aceita' ? `<button class="btn btn-sm btn-primary" onclick="startRide('${ride.id}')">▶️ Iniciar</button>` : ''}
          ${ride.status === 'em_andamento' ? `<button class="btn btn-sm btn-primary" onclick="completeRide('${ride.id}')">✅ Finalizar</button>` : ''}
          ${ride.status === 'aceita' ? `<button class="btn btn-sm btn-danger" onclick="cancelRide('${ride.id}')">Cancelar</button>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

window.acceptRide = async function(id) {
  try {
    await api.acceptRide(id);
    loadRides();
    switchPanel('minhas');
  } catch (err) {
    alert(err.message);
  }
};

window.startRide = async function(id) {
  try {
    await api.startRide(id);
    loadRides();
  } catch (err) {
    alert(err.message);
  }
};

window.completeRide = async function(id) {
  try {
    await api.completeRide(id);
    loadRides();
    loadStats();
  } catch (err) {
    alert(err.message);
  }
};

window.cancelRide = async function(id) {
  if (!confirm('Deseja cancelar esta corrida?')) return;
  try {
    await api.cancelRide(id);
    loadRides();
  } catch (err) {
    alert(err.message);
  }
};
