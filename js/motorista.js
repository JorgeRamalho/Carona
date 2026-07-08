let pollInterval = null;
let knownAvailableIds = new Set();
let offerQueue = [];
let currentOfferId = null;
let ratingRideId = null;
let offersInitialized = false;

const PAYMENT_LABELS = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão'
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!auth.requireAuth('motorista')) return;
  try {
    await caronaMaps.init();
  } catch (err) {
    console.warn('Google Maps indisponível:', err.message);
  }
  initDashboard();
  initOfferModal();
  initRatingModal();
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
      user.online = online;
      localStorage.setItem('carona_user', JSON.stringify(user));
      updateOnlineLabel(online);
      if (online) {
        knownAvailableIds = new Set();
        offersInitialized = false;
        loadRides();
      } else {
        closeOfferModal();
        knownAvailableIds = new Set();
        offersInitialized = false;
        offerQueue = [];
        loadRides();
      }
    } catch (err) {
      onlineSwitch.checked = !onlineSwitch.checked;
      alert(err.message);
    }
  });

  loadStats();
  loadRides();
  pollInterval = setInterval(loadRides, 3000);
}

function initOfferModal() {
  document.getElementById('declineOfferBtn').addEventListener('click', () => {
    if (currentOfferId) {
      knownAvailableIds.add(currentOfferId);
      offerQueue = offerQueue.filter((r) => r.id !== currentOfferId);
    }
    closeOfferModal();
    showNextOffer();
  });
  document.getElementById('acceptOfferBtn').addEventListener('click', async () => {
    if (!currentOfferId) return;
    await acceptRide(currentOfferId);
  });
  document.getElementById('offerModalBackdrop').addEventListener('click', () => {});
}

function initRatingModal() {
  const modal = document.getElementById('ratingModal');
  document.getElementById('closeRatingModal').addEventListener('click', closeRatingModal);
  document.getElementById('ratingModalBackdrop').addEventListener('click', closeRatingModal);
  document.getElementById('skipRatingBtn').addEventListener('click', closeRatingModal);
  document.getElementById('submitRatingBtn').addEventListener('click', submitDriverRating);

  document.querySelectorAll('#ratingStars button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = Number(btn.dataset.value);
      document.getElementById('ratingValue').value = value;
      document.querySelectorAll('#ratingStars button').forEach((b) => {
        b.classList.toggle('active', Number(b.dataset.value) <= value);
      });
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeRatingModal();
  });
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

function routeMetaHtml(ride) {
  const duration = ride.duracaoTexto || formatDuration(ride.duracaoSegundos);
  return `
    <div class="ride-route-meta">
      <span>📏 <strong>${ride.distancia} km</strong></span>
      <span>⏱️ <strong>${duration}</strong></span>
      ${ride.mapsFonte === 'google' ? '<span>🗺️ <strong>Google Maps</strong></span>' : ''}
    </div>
  `;
}

function ratingLabel(rating) {
  if (!rating) return 'Nova conta · sem avaliações';
  return rating.label || 'Nova conta · sem avaliações';
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

function renderDriverRoute(ride) {
  const card = document.getElementById('driverRouteCard');
  const info = document.getElementById('driverRouteInfo');
  const actions = document.getElementById('driverRouteActions');

  if (!ride || !['aceita', 'em_andamento'].includes(ride.status)) {
    card.hidden = true;
    return;
  }

  card.hidden = false;
  const duration = ride.duracaoTexto || formatDuration(ride.duracaoSegundos);
  info.textContent = `${ride.origem} → ${ride.destino} · ${ride.distancia} km · ${duration}`;
  caronaMaps.renderRoute('driverRouteMap', ride, { skipActions: true });

  if (ride.mapsUrl) {
    actions.innerHTML = `
      <a href="${ride.mapsUrl}" target="_blank" rel="noopener" class="btn btn-primary">
        🧭 Iniciar navegação no Google Maps
      </a>
    `;
  } else {
    actions.innerHTML = '';
  }
}

function detectNewOffers(available) {
  const user = auth.getUser();
  if (!user?.online) return;

  if (!offersInitialized) {
    available.forEach((r) => knownAvailableIds.add(r.id));
    offersInitialized = true;
    return;
  }

  const fresh = available.filter((r) => !knownAvailableIds.has(r.id));
  if (!fresh.length) return;

  fresh.forEach((r) => {
    knownAvailableIds.add(r.id);
    if (!offerQueue.some((q) => q.id === r.id) && r.id !== currentOfferId) {
      offerQueue.push(r);
    }
  });

  const newest = fresh[0];
  window.caronaPwa?.playAlert();
  window.caronaPwa?.notify('Nova corrida disponível!', {
    body: `${newest.origem} → ${newest.destino} · Você recebe ${formatCurrency(newest.motorista)}`,
    tag: `ride-${newest.id}`,
    data: { url: '/motorista.html' }
  });

  if (!currentOfferId) showNextOffer();
}

function showNextOffer() {
  const user = auth.getUser();
  if (!user?.online || currentOfferId) return;
  const next = offerQueue.shift();
  if (!next) return;
  openOfferModal(next);
}

function openOfferModal(ride) {
  currentOfferId = ride.id;
  const modal = document.getElementById('offerModal');
  const body = document.getElementById('offerModalBody');
  const duration = ride.duracaoTexto || formatDuration(ride.duracaoSegundos);
  const pagamento = PAYMENT_LABELS[ride.pagamento] || ride.pagamento || 'Pix';
  const pRating = ratingLabel(ride.passageiroRating);

  body.innerHTML = `
    <div class="offer-alert-banner">🚨 Nova solicitação de corrida</div>
    <div class="estimate-modal-route">
      <div class="route-point"><span class="route-dot origin"></span> <strong>Origem:</strong> ${ride.origem}</div>
      <div class="route-point"><span class="route-dot dest"></span> <strong>Destino:</strong> ${ride.destino}</div>
    </div>

    <div class="estimate-price-hero offer-earn-hero">
      <div class="estimate-price-hero-main">
        <span class="estimate-price-label">Você recebe (95%)</span>
        <strong class="estimate-price-final">${formatCurrency(ride.motorista)}</strong>
      </div>
      <p class="estimate-price-discount">
        Bruto ${formatCurrency(ride.motoristaBruto || ride.motorista / 0.95)} · taxa plataforma ${formatCurrency(ride.taxaMotorista || (ride.motoristaBruto || 0) * 0.05)}
      </p>
    </div>

    <div class="estimate-modal-grid">
      <div class="estimate-modal-item"><span>Distância</span><strong>${ride.distancia} km</strong></div>
      <div class="estimate-modal-item"><span>Tempo estimado</span><strong>${duration}</strong></div>
      <div class="estimate-modal-item"><span>Valor / km</span><strong>${formatCurrency(ride.perKmMotorista || 2)}</strong></div>
      <div class="estimate-modal-item"><span>Pagamento</span><strong>${pagamento}</strong></div>
      <div class="estimate-modal-item"><span>Passageiro paga</span><strong>${formatCurrency(ride.total)}</strong></div>
      <div class="estimate-modal-item highlight"><span>Seu líquido</span><strong>${formatCurrency(ride.motorista)}</strong></div>
    </div>

    <div class="estimate-modal-ratings">
      <div class="estimate-modal-rating-card">
        <h3>🧳 Passageiro</h3>
        <strong>${ride.passageiroNome}</strong>
        <span>${pRating}</span>
      </div>
      <div class="estimate-modal-rating-card">
        <h3>🗺️ Rota</h3>
        <strong>${ride.mapsFonte === 'google' ? 'Google Maps' : 'Estimativa'}</strong>
        <span>${ride.distancia} km · ${duration}</span>
      </div>
    </div>
  `;

  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => {
    caronaMaps.renderModalRoute('offerModalMap', ride, ride.origem, ride.destino);
    setTimeout(() => {
      if (window.google?.maps && caronaMaps.modalMap) {
        google.maps.event.trigger(caronaMaps.modalMap, 'resize');
      }
    }, 250);
  });
}

function closeOfferModal() {
  const modal = document.getElementById('offerModal');
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  currentOfferId = null;
}

async function loadRides() {
  try {
    const { rides } = await api.getRides();
    const available = rides.filter(r => r.status === 'aguardando');
    const mine = rides.filter(r => r.motoristaId === auth.getUser().id);
    const active = mine.find(r => ['aceita', 'em_andamento'].includes(r.status));

    document.getElementById('statDisponiveis').textContent = available.length;
    detectNewOffers(available);
    renderAvailableRides(available);
    renderMyRides(mine);
    renderDriverRoute(active);
    loadStats();
  } catch { /* silent */ }
}

function renderAvailableRides(rides) {
  const container = document.getElementById('availableRides');
  const online = !!auth.getUser()?.online;

  if (!online) {
    container.innerHTML = '<p class="empty-state">Fique <strong>online</strong> para receber solicitações de passageiros. 📡</p>';
    return;
  }

  if (!rides.length) {
    container.innerHTML = '<p class="empty-state">Nenhuma corrida disponível no momento. Aguarde solicitações! 📡</p>';
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
      ${routeMetaHtml(ride)}
      <div class="ride-earnings">
        <div>
          <span class="earnings-you">Você recebe</span>
          <strong class="earnings-amount">${formatCurrency(ride.motorista)}</strong>
        </div>
        <div class="earnings-fee">
          <small>${ride.distancia} km · ${PAYMENT_LABELS[ride.pagamento] || 'Pix'} · 95% líquido</small>
        </div>
      </div>
      <p class="ride-rating-inline">${ratingLabel(ride.passageiroRating)}</p>
      <div class="ride-actions">
        <button class="btn btn-primary btn-sm" onclick="openOfferFromList('${ride.id}')">👀 Ver oferta</button>
        <button class="btn btn-secondary btn-sm" onclick="acceptRide('${ride.id}')">✅ Aceitar</button>
      </div>
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
      ${routeMetaHtml(ride)}
      <div class="ride-item-footer">
        <div>
          <span class="ride-price">${formatCurrency(ride.motorista)}</span>
          <small> líquido · ${PAYMENT_LABELS[ride.pagamento] || 'Pix'}</small>
        </div>
        <span class="ride-passenger">🧳 ${ride.passageiroNome}</span>
        <div class="ride-actions">
          ${ride.status === 'aceita' ? `<button class="btn btn-sm btn-primary" onclick="startRide('${ride.id}')">▶️ Iniciar</button>` : ''}
          ${ride.status === 'em_andamento' ? `<button class="btn btn-sm btn-primary" onclick="completeRide('${ride.id}')">✅ Finalizar</button>` : ''}
          ${ride.mapsUrl ? `<a href="${ride.mapsUrl}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary">🗺️ Google Maps</a>` : ''}
          ${ride.status === 'aceita' ? `<button class="btn btn-sm btn-danger" onclick="cancelRide('${ride.id}')">Cancelar</button>` : ''}
          ${ride.status === 'concluida' && !ride.avaliacaoPassageiro
            ? `<button class="btn btn-sm btn-primary" onclick="openRatingModal('${ride.id}', '${ride.passageiroNome}')">⭐ Avaliar passageiro</button>`
            : ride.avaliacaoPassageiro ? `<span class="ride-rating">${'⭐'.repeat(ride.avaliacaoPassageiro)}</span>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

window.openOfferFromList = async function(id) {
  try {
    const { rides } = await api.getRides();
    const ride = rides.find((r) => r.id === id);
    if (!ride || ride.status !== 'aguardando') {
      return alert('Esta corrida não está mais disponível.');
    }
    offerQueue = offerQueue.filter((r) => r.id !== id);
    closeOfferModal();
    openOfferModal(ride);
  } catch (err) {
    alert(err.message);
  }
};

window.acceptRide = async function(id) {
  try {
    await api.acceptRide(id);
    closeOfferModal();
    offerQueue = offerQueue.filter((r) => r.id !== id);
    loadRides();
    switchPanel('minhas');
  } catch (err) {
    alert(err.message);
    loadRides();
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
    const { rides } = await api.getRides();
    const ride = rides.find((r) => r.id === id);
    await api.completeRide(id);
    loadRides();
    loadStats();
    if (ride) openRatingModal(id, ride.passageiroNome);
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

function openRatingModal(rideId, passengerName) {
  ratingRideId = rideId;
  document.getElementById('ratingValue').value = '5';
  document.getElementById('ratingPassengerName').textContent = passengerName || 'Passageiro';
  document.querySelectorAll('#ratingStars button').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.value) <= 5);
  });
  const modal = document.getElementById('ratingModal');
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
}

function closeRatingModal() {
  const modal = document.getElementById('ratingModal');
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  ratingRideId = null;
}

async function submitDriverRating() {
  if (!ratingRideId) return;
  const value = Number(document.getElementById('ratingValue').value);
  try {
    await api.rateRide(ratingRideId, value);
    closeRatingModal();
    loadRides();
  } catch (err) {
    alert(err.message);
  }
}
