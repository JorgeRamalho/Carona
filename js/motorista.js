let pollInterval = null;
let visorInterval = null;
let knownAvailableIds = new Set();
let offerQueue = [];
let currentOfferId = null;
let ratingRideId = null;
let receiptRide = null;
let offersInitialized = false;
let lastHudRideKey = '';
let gpsSpeed = null;
let offerDeadline = 0;
let offerTimer = null;
let ringtoneTimer = null;
let ringtoneCtx = null;

const OFFER_SECONDS = 15;
const COUNTDOWN_CIRCUMFERENCE = 2 * Math.PI * 34;

const PAYMENT_LABELS = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão'
};

const DRIVER_STATUS = {
  aguardando: { text: 'Na praça', emoji: '📡', class: 'status-waiting' },
  aceita: { text: 'A caminho do passageiro', emoji: '📍', class: 'status-accepted' },
  em_andamento: { text: 'Corrida em andamento', emoji: '🛣️', class: 'status-active' },
  concluida: { text: 'Concluída', emoji: '✅', class: 'status-done' },
  cancelada: { text: 'Cancelada', emoji: '❌', class: 'status-cancelled' }
};

let driverSessionMode = 'full';

document.addEventListener('DOMContentLoaded', async () => {
  if (auth.isLoggedIn()) {
    const synced = await auth.syncSessionFromServer();
    if (!synced) {
      localStorage.removeItem('carona_token');
      localStorage.removeItem('carona_user');
    }
  }

  driverSessionMode = resolveDriverSessionMode();
  auth.updateHeaderForLoggedUser();

  if (driverSessionMode === 'guest') {
    showDriverAccessBanner(
      'Entre na sua conta para alternar entre modo Passageiro e Motorista.',
      [
        { href: `/login.html?redirect=${encodeURIComponent('/motorista.html')}`, label: 'Entrar', primary: true },
        { href: '/#cadastro', label: 'Criar conta' }
      ]
    );
  } else if (driverSessionMode === 'wrong-mode') {
    showDriverAccessBanner(
      'Você está no <strong>modo passageiro</strong>. Use o seletor <strong>🚙 Motorista</strong> no topo para alternar.',
      [
        { href: '#', label: 'Alternar para motorista', primary: true, action: () => handleModeSwitch('motorista') }
      ]
    );
  } else if (driverSessionMode === 'needs-profile') {
    showDriverAccessBanner(
      'Complete CNH e veículo para usar o modo motorista e ficar online.',
      [
        { href: '#perfil', label: 'Completar cadastro motorista', primary: true, action: () => switchPanel('perfil') }
      ]
    );
  }

  try {
    await caronaMaps.init();
  } catch (err) {
    console.warn('Google Maps indisponível:', err.message);
  }
  initDashboard();
  initOfferModal();
  initRatingModal();
  initReceiptModal();
  if (driverSessionMode === 'full') {
    await refreshDriverOnlineFromServer();
    initGeolocation();
    initNavWindowSync();
  }
  if (location.hash === '#corridas') switchPanel('corridas');
  if (location.hash === '#perfil') switchPanel('perfil');
});

function resolveDriverSessionMode() {
  if (!auth.isLoggedIn()) return 'guest';
  if (!auth.hasDriverProfile()) return 'needs-profile';
  if (auth.getModoAtivo() !== 'motorista') return 'wrong-mode';
  return 'full';
}

function showDriverAccessBanner(message, actions) {
  const main = document.getElementById('driverMain');
  if (!main || main.querySelector('.driver-access-banner')) return;
  const banner = document.createElement('div');
  banner.className = 'panel-card driver-access-banner';
  banner.setAttribute('role', 'status');
  const links = actions
    .map((a) => `<a href="${a.href}" class="btn ${a.primary ? 'btn-primary' : 'btn-secondary'}">${a.label}</a>`)
    .join('');
  banner.innerHTML = `<p>${message}</p><div class="motorista-gate-actions">${links}</div>`;
  main.insertBefore(banner, main.firstChild);
  actions.forEach((a, i) => {
    if (!a.action) return;
    const btn = banner.querySelectorAll('.motorista-gate-actions a')[i];
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      a.action();
    });
  });
}

function initDashboard() {
  const user = auth.getUser();
  const displayName = user?.nome?.split(' ')[0] || 'Motorista';
  document.getElementById('userName').textContent = displayName;

  document.getElementById('logoutBtn').addEventListener('click', () => auth.logout());
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  document.querySelectorAll('.sidebar-link').forEach((link) => {
    link.addEventListener('click', () => switchPanel(link.dataset.panel));
  });

  bindOnlineStatusControls();
  applyOnlineStatus(!!user?.online);

  tickVisorClock();
  visorInterval = setInterval(() => {
    tickVisorClock();
    if (driverSessionMode === 'full') refreshLiveTrip();
  }, 1000);

  if (driverSessionMode !== 'full') {
    setOnlineControlsEnabled(false);
    markOnlineControlsBlocked(driverSessionMode);
    return;
  }

  setOnlineControlsEnabled(true);

  loadStats();
  loadRides();
  pollInterval = setInterval(loadRides, 3000);
}

function bindOnlineStatusControls() {
  const offlineBtn = document.getElementById('setOfflineBtn');
  const onlineBtn = document.getElementById('setOnlineBtn');
  if (!offlineBtn || !onlineBtn) return;

  offlineBtn.addEventListener('click', () => changeDriverOnline(false));
  onlineBtn.addEventListener('click', () => changeDriverOnline(true));
}

function setOnlineControlsEnabled(enabled) {
  const offlineBtn = document.getElementById('setOfflineBtn');
  const onlineBtn = document.getElementById('setOnlineBtn');
  if (offlineBtn) {
    offlineBtn.disabled = !enabled;
    offlineBtn.removeAttribute('title');
  }
  if (onlineBtn) {
    onlineBtn.disabled = !enabled;
    onlineBtn.removeAttribute('title');
  }
}

function markOnlineControlsBlocked(mode) {
  const reason =
    mode === 'guest'
      ? 'Faça login para alterar o status.'
      : mode === 'needs-profile'
        ? 'Complete o cadastro de motorista no perfil.'
        : 'Alterne para o modo Motorista no topo da página.';
  const offlineBtn = document.getElementById('setOfflineBtn');
  const onlineBtn = document.getElementById('setOnlineBtn');
  if (offlineBtn) offlineBtn.title = reason;
  if (onlineBtn) onlineBtn.title = reason;
}

function applyOnlineStatus(online) {
  const offlineBtn = document.getElementById('setOfflineBtn');
  const onlineBtn = document.getElementById('setOnlineBtn');
  if (offlineBtn) {
    offlineBtn.classList.toggle('is-active', !online);
    offlineBtn.setAttribute('aria-pressed', String(!online));
  }
  if (onlineBtn) {
    onlineBtn.classList.toggle('is-active', online);
    onlineBtn.setAttribute('aria-pressed', String(online));
  }
  updateOnlineLabel(online);
  refreshVisorIdleState();
}

async function refreshDriverOnlineFromServer() {
  try {
    const user = await auth.syncSessionFromServer();
    if (!user || auth.getModoAtivo(user) !== 'motorista') return;
    applyOnlineStatus(!!user.online);
  } catch (err) {
    console.warn('Não foi possível sincronizar status online:', err.message);
  }
}

async function changeDriverOnline(nextOnline) {
  if (driverSessionMode !== 'full') {
    alert('Entre com uma conta de motorista para alterar o status.');
    return;
  }

  const user = auth.getUser();
  if (!!user?.online === nextOnline) {
    applyOnlineStatus(nextOnline);
    return;
  }

  setOnlineControlsEnabled(false);
  try {
    const { online } = await api.setDriverStatus(nextOnline);
    if (user) {
      user.online = online;
      localStorage.setItem('carona_user', JSON.stringify(user));
    }
    applyOnlineStatus(online);
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
    alert(err.message);
    applyOnlineStatus(!!user?.online);
  } finally {
    setOnlineControlsEnabled(true);
  }
}

function refreshVisorIdleState() {
  const online = !!auth.getUser()?.online;
  const idle = document.getElementById('visorIdle');
  if (!idle || idle.hidden) return;
  const title = document.getElementById('visorIdleTitle');
  const text = document.getElementById('visorIdleText');
  if (title) title.textContent = online ? 'Procurando corridas' : 'Fique online';
  if (text) {
    text.textContent = online
      ? 'Aguardando chamadas na região. O visor avisa quando surgir uma corrida.'
      : 'Toque em Online para receber chamadas de corrida no visor.';
  }
}

function initOfferModal() {
  document.getElementById('declineOfferBtn').addEventListener('click', declineCurrentOffer);
  document.getElementById('acceptOfferBtn').addEventListener('click', async () => {
    if (!currentOfferId) return;
    await acceptRide(currentOfferId);
  });
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
    if (e.key !== 'Escape') return;
    if (!document.getElementById('receiptModal').hidden) closeReceiptModal();
    else if (!modal.hidden) closeRatingModal();
  });
}

function initReceiptModal() {
  document.getElementById('closeReceiptModal').addEventListener('click', closeReceiptModal);
  document.getElementById('closeReceiptBtn').addEventListener('click', closeReceiptModal);
  document.getElementById('receiptModalBackdrop').addEventListener('click', closeReceiptModal);
  document.getElementById('receiptRateBtn').addEventListener('click', () => {
    const ride = receiptRide;
    closeReceiptModal();
    if (ride) openRatingModal(ride.id, ride.passageiroNome);
  });
}

function initGeolocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.watchPosition(
    (pos) => {
      const speed = pos.coords.speed;
      gpsSpeed = Number.isFinite(speed) && speed >= 0 ? Math.round(speed * 3.6) : null;
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      window.caronaDriverCoords = coords;
      if (!window.caronaActiveRide || window.caronaActiveRide.status !== 'em_andamento') {
        updateSpeedometer(gpsSpeed ?? 0);
      }
    },
    () => {
      gpsSpeed = null;
    },
    { enableHighAccuracy: true, maximumAge: 4000, timeout: 8000 }
  );
}

function updateOnlineLabel(online) {
  document.getElementById('onlineLabel').textContent = online ? '🟢 Online' : '🔴 Offline';
  document.getElementById('onlineLabel').classList.toggle('online', online);
  const chip = document.getElementById('visorOnlineChip');
  chip.textContent = online ? 'Online' : 'Offline';
  chip.classList.toggle('is-online', online);
  chip.classList.toggle('is-offline', !online);
}

function switchPanel(panel) {
  document.querySelectorAll('.sidebar-link').forEach((l) => l.classList.toggle('active', l.dataset.panel === panel));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${panel}`));
  document.getElementById('sidebar').classList.remove('open');
  if (panel === 'perfil') loadMotoristaProfile();
  if (panel === 'corridas') {
    setTimeout(() => {
      if (window.google?.maps && caronaMaps.hudMap) {
        google.maps.event.trigger(caronaMaps.hudMap, 'resize');
      }
    }, 200);
  }
}

function loadMotoristaProfile() {
  const container = document.getElementById('profileContent');
  if (!container) return;

  if (!auth.hasDriverProfile()) {
    container.innerHTML = `
      <form id="driverProfileForm" class="driver-profile-form">
        <p class="panel-desc">Um login, dois modos: preencha uma vez para poder alternar para <strong>Motorista</strong>.</p>
        <div class="form-grid">
          <div class="form-group"><label for="drv-cnh">CNH *</label><input id="drv-cnh" name="cnh" required></div>
          <div class="form-group"><label for="drv-cat">Categoria *</label>
            <select id="drv-cat" name="cnh_categoria" required>
              <option value="B">B</option><option value="A">A</option><option value="AB">AB</option>
            </select>
          </div>
          <div class="form-group"><label for="drv-veiculo">Veículo *</label><input id="drv-veiculo" name="veiculo" required></div>
          <div class="form-group"><label for="drv-placa">Placa *</label><input id="drv-placa" name="placa" required></div>
          <div class="form-group"><label for="drv-cor">Cor *</label><input id="drv-cor" name="cor" required></div>
          <div class="form-group"><label for="drv-ano">Ano *</label><input id="drv-ano" name="ano" type="number" min="1990" max="2099" required></div>
        </div>
        <button type="submit" class="btn btn-primary">Salvar e habilitar modo motorista</button>
        <p class="form-feedback" id="driverProfileFeedback" role="status"></p>
      </form>`;
    const form = document.getElementById('driverProfileForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const feedback = document.getElementById('driverProfileFeedback');
      const body = {
        cnh: form.cnh.value.trim(),
        cnh_categoria: form.cnh_categoria.value,
        veiculo: form.veiculo.value.trim(),
        placa: form.placa.value.trim(),
        cor: form.cor.value.trim(),
        ano: form.ano.value
      };
      try {
        const { user } = await api.saveDriverProfile(body);
        auth.saveSession(auth.getToken(), user);
        driverSessionMode = resolveDriverSessionMode();
        showFeedback(feedback, 'Perfil salvo! Alternando para modo motorista…', 'success');
        await auth.switchModo('motorista');
        window.location.reload();
      } catch (err) {
        showFeedback(feedback, err.message, 'error');
      }
    });
    return;
  }

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

function driverBadge(status) {
  const s = DRIVER_STATUS[status] || { text: status, emoji: '❓', class: '' };
  return `<span class="status-badge ${s.class}">${s.emoji} ${s.text}</span>`;
}

function routeMetaHtml(ride) {
  const duration = ride.duracaoTexto || formatDuration(ride.duracaoSegundos);
  const km = ride.kmRodados || ride.distancia;
  return `
    <div class="ride-route-meta">
      <span class="km-meta">${kmGaugeIcon()} <strong>${km} km</strong></span>
      <span>⏱️ <strong>${duration}</strong></span>
      ${ride.mapsFonte === 'google' ? '<span>🗺️ <strong>Google Maps</strong></span>' : ''}
    </div>
  `;
}

function ratingLabel(rating) {
  if (!rating) return 'Nova conta · sem avaliações';
  return rating.label || 'Nova conta · sem avaliações';
}

function passengerInitial(name) {
  return (name || 'P').trim().charAt(0).toUpperCase();
}

function paymentLabel(ride) {
  return PAYMENT_LABELS[ride.pagamento] || ride.pagamento || 'Pix';
}

function phoneHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `tel:+${digits.startsWith('55') ? digits : `55${digits}`}` : '';
}

function waHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}`;
}

function formatClock(date = new Date()) {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatElapsed(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function tripProgress(ride) {
  if (ride.status !== 'em_andamento') {
    return { ratio: 0, elapsed: 0, kmDone: 0, speed: gpsSpeed ?? 0 };
  }
  const duration = Math.max(Number(ride.duracaoSegundos) || 1, 1);
  const start = ride.iniciadaEm ? new Date(ride.iniciadaEm).getTime() : Date.now();
  const elapsed = Math.max(0, (Date.now() - start) / 1000);
  const ratio = Math.min(0.98, elapsed / duration);
  const kmDone = +(Number(ride.distancia) * ratio).toFixed(1);
  const estimatedSpeed = Math.round((Number(ride.distancia) / duration) * 3600);
  return {
    ratio,
    elapsed,
    kmDone,
    speed: gpsSpeed ?? estimatedSpeed
  };
}

function tickVisorClock() {
  const clock = document.getElementById('visorClock');
  if (clock) clock.textContent = formatClock();
}

async function loadStats() {
  try {
    const stats = await api.getStats();
    document.getElementById('statGanhos').textContent = formatCurrency(stats.totalGanho);
    document.getElementById('statCorridas').textContent = stats.concluidas;
    document.getElementById('statKm').textContent = `${stats.kmTotal || 0} km`;
    document.getElementById('earningsTotal').textContent = formatCurrency(stats.totalGanho);
    document.getElementById('earningsCount').textContent = stats.concluidas;
    document.getElementById('earningsKm').textContent = `${stats.kmTotal || 0} km`;
    document.getElementById('earningsTaxa').textContent = formatCurrency(stats.totalTaxa);
    const bruto = stats.totalGanho + stats.totalTaxa;
    document.getElementById('earningsBruto').textContent = formatCurrency(bruto);
    document.getElementById('earningsPerdido').textContent = formatCurrency(bruto * 0.20);
    document.getElementById('visorTodayEarn').textContent = `Hoje ${formatCurrency(stats.ganhosHoje || 0)}`;
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

  actions.innerHTML = `
    <button type="button" class="btn btn-primary" onclick="openDriverRouteWindow('${ride.id}')">
      Abrir trajeto até o passageiro
    </button>
  `;
}

function updateHudMap(ride) {
  const key = ride ? `${ride.id}-${ride.status}` : `idle-${auth.getUser()?.online ? 'on' : 'off'}`;
  if (key === lastHudRideKey) return;
  lastHudRideKey = key;

  if (ride && ['aceita', 'em_andamento', 'aguardando'].includes(ride.status)) {
    caronaMaps.renderRoute('driverHudMap', ride, { skipActions: true, instance: 'hud' });
    return;
  }

  const coords = window.caronaDriverCoords || { lat: -25.4284, lng: -49.2733 };
  caronaMaps.showLocation('driverHudMap', coords);
}

function renderVisor(active, availableCount) {
  const idle = document.getElementById('visorIdle');
  const sheet = document.getElementById('visorSheet');
  const online = !!auth.getUser()?.online;

  if (!active) {
    sheet.hidden = true;
    idle.hidden = false;
    document.getElementById('visorIdleTitle').textContent = online ? 'Procurando corridas' : 'Fique online';
    document.getElementById('visorIdleText').textContent = online
      ? `${availableCount} chamada(s) na praça. O visor toca quando chegar um chamado.`
      : 'Ative o status para receber chamadas de corrida no visor, como nos apps de mobilidade.';
    updateSpeedometer(gpsSpeed ?? 0);
    updateHudMap(null);
    return;
  }

  idle.hidden = true;
  sheet.hidden = false;
  const live = tripProgress(active);
  updateSpeedometer(active.status === 'em_andamento' ? live.speed : (gpsSpeed ?? 0));
  sheet.innerHTML = visorSheetHtml(active, live);
  updateHudMap(active);
}

function visorSheetHtml(ride, live) {
  const goingToPickup = ride.status === 'aceita';
  const inTrip = ride.status === 'em_andamento';
  const duration = ride.duracaoTexto || formatDuration(ride.duracaoSegundos);
  const phone = phoneHref(ride.passageiroTelefone);
  const whatsapp = waHref(ride.passageiroTelefone);
  const kmLive = inTrip ? live.kmDone : 0;
  const percent = Math.round((inTrip ? live.ratio : (ride.chegadaEm ? 1 : 0.18)) * 100);

  return `
    <div class="visor-phase ${goingToPickup ? 'is-pickup' : ''}">
      ${goingToPickup ? (ride.chegadaEm ? '📍 No ponto de embarque' : '📍 A caminho do passageiro') : '🛣️ Em viagem ao destino'}
    </div>
    <div class="visor-passenger">
      <div class="visor-avatar">${passengerInitial(ride.passageiroNome)}</div>
      <div>
        <h3>${ride.passageiroNome}</h3>
        <p>${ratingLabel(ride.passageiroRating)}</p>
      </div>
      <div class="visor-passenger-actions">
        ${phone ? `<a class="visor-icon-btn" href="${phone}" aria-label="Ligar para o passageiro">📞</a>` : ''}
        ${whatsapp ? `<a class="visor-icon-btn" href="${whatsapp}" target="_blank" rel="noopener" aria-label="WhatsApp">💬</a>` : ''}
      </div>
    </div>
    <div class="visor-route-list">
      <div class="route-point"><span class="route-dot origin"></span> <strong>Embarque:</strong> ${ride.origem}</div>
      <div class="route-point"><span class="route-dot dest"></span> <strong>Destino:</strong> ${ride.destino}</div>
    </div>
    <div class="visor-metrics">
      <div class="visor-metric"><span>Tempo</span><strong>${inTrip ? formatElapsed(live.elapsed) : duration}</strong></div>
      <div class="visor-metric"><span>${kmGaugeIcon()} ${inTrip ? 'Rodados' : 'Percurso'}</span><strong>${inTrip ? `${kmLive} / ${ride.distancia}` : ride.distancia} km</strong></div>
      <div class="visor-metric"><span>Pagamento</span><strong>${paymentLabel(ride)}</strong></div>
      <div class="visor-metric"><span>Passageiro paga</span><strong>${formatCurrency(ride.total)}</strong></div>
    </div>
    <div class="visor-progress">
      <div class="visor-progress-bar"><span style="width:${percent}%"></span></div>
      <div class="visor-progress-meta">
        <span>${inTrip ? 'Percurso em andamento' : 'Deslocamento até o embarque'}</span>
        <span>${percent}%</span>
      </div>
    </div>
    <div class="visor-pay-row">
      <span>Você recebe (95%) · ${paymentLabel(ride)}</span>
      <strong>${formatCurrency(ride.motorista)}</strong>
    </div>
    <div class="visor-actions">
      <button class="btn btn-secondary" type="button" onclick="openDriverRouteWindow('${ride.id}')">Navegar</button>
      ${goingToPickup && !ride.chegadaEm ? `<button class="btn btn-primary" onclick="arriveRide('${ride.id}')">📍 Cheguei</button>` : ''}
      ${goingToPickup ? `<button class="btn btn-primary" onclick="startRide('${ride.id}')">▶️ Iniciar corrida</button>` : ''}
      ${inTrip ? `<button class="btn btn-primary" onclick="completeRide('${ride.id}')">✅ Finalizar e cobrar</button>` : ''}
      ${goingToPickup ? `<button class="btn btn-danger" onclick="cancelRide('${ride.id}')">Cancelar</button>` : ''}
    </div>
  `;
}

function refreshLiveTrip() {
  const sheet = document.getElementById('visorSheet');
  if (!sheet || sheet.hidden || !window.caronaActiveRide) return;
  const ride = window.caronaActiveRide;
  if (ride.status !== 'em_andamento') return;
  const live = tripProgress(ride);
  updateSpeedometer(live.speed);
  sheet.innerHTML = visorSheetHtml(ride, live);
}

function detectNewOffers(available, busy) {
  const user = auth.getUser();
  if (!user?.online || busy) return;

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
  window.caronaPwa?.notify('Nova corrida no visor!', {
    body: `${newest.origem} → ${newest.destino} · Você recebe ${formatCurrency(newest.motorista)}`,
    tag: `ride-${newest.id}`,
    data: { url: '/motorista.html' }
  });

  if (!currentOfferId) showNextOffer();
}

function showNextOffer() {
  const user = auth.getUser();
  if (!user?.online || currentOfferId || window.caronaActiveRide) return;
  const next = offerQueue.shift();
  if (!next) return;
  openOfferModal(next);
}

function startRingtone() {
  stopRingtone();
  try {
    navigator.vibrate?.([220, 80, 220, 80, 400]);
  } catch { /* ignore */ }

  const beep = () => {
    try {
      ringtoneCtx = ringtoneCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = ringtoneCtx.createOscillator();
      const gain = ringtoneCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, ringtoneCtx.currentTime);
      osc.frequency.setValueAtTime(1320, ringtoneCtx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.0001, ringtoneCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ringtoneCtx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ringtoneCtx.currentTime + 0.42);
      osc.connect(gain);
      gain.connect(ringtoneCtx.destination);
      osc.start();
      osc.stop(ringtoneCtx.currentTime + 0.45);
    } catch { /* ignore */ }
  };

  beep();
  ringtoneTimer = setInterval(beep, 1100);
}

function stopRingtone() {
  if (ringtoneTimer) {
    clearInterval(ringtoneTimer);
    ringtoneTimer = null;
  }
}

function declineCurrentOffer() {
  if (currentOfferId) {
    knownAvailableIds.add(currentOfferId);
    offerQueue = offerQueue.filter((r) => r.id !== currentOfferId);
  }
  closeOfferModal();
  showNextOffer();
}

function openOfferModal(ride) {
  currentOfferId = ride.id;
  const modal = document.getElementById('offerModal');
  const body = document.getElementById('offerModalBody');
  const duration = ride.duracaoTexto || formatDuration(ride.duracaoSegundos);

  document.getElementById('offerModalTitle').textContent = ride.passageiroNome;
  body.innerHTML = `
    <div class="incoming-earn">
      <span>Você recebe nesta corrida</span>
      <strong>${formatCurrency(ride.motorista)}</strong>
    </div>
    <div class="visor-route-list">
      <div class="route-point"><span class="route-dot origin"></span> ${ride.origem}</div>
      <div class="route-point"><span class="route-dot dest"></span> ${ride.destino}</div>
    </div>
    <div class="incoming-grid">
      <div><span class="km-meta">${kmGaugeIcon()} Distância</span><strong>${ride.distancia} km</strong></div>
      <div><span>Tempo</span><strong>${duration}</strong></div>
      <div><span>Pagamento</span><strong>${paymentLabel(ride)}</strong></div>
      <div><span>Passageiro paga</span><strong>${formatCurrency(ride.total)}</strong></div>
      <div><span>Taxa 5%</span><strong>${formatCurrency(ride.taxaMotorista || (ride.motoristaBruto || 0) * 0.05)}</strong></div>
      <div><span>Avaliação</span><strong>${ride.passageiroRating?.media ? `${ride.passageiroRating.media} ★` : 'Novo'}</strong></div>
    </div>
  `;

  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  startRingtone();
  startOfferCountdown();

  requestAnimationFrame(() => {
    caronaMaps.renderModalRoute('offerModalMap', ride, ride.origem, ride.destino);
    setTimeout(() => caronaMaps.refreshModalMapSize(), 250);
  });
}

function startOfferCountdown() {
  clearInterval(offerTimer);
  offerDeadline = Date.now() + OFFER_SECONDS * 1000;
  const ring = document.getElementById('offerCountdownRing');
  ring.style.strokeDasharray = String(COUNTDOWN_CIRCUMFERENCE);
  const tick = () => {
    const left = Math.max(0, Math.ceil((offerDeadline - Date.now()) / 1000));
    document.getElementById('offerCountdown').textContent = String(left);
    const used = 1 - left / OFFER_SECONDS;
    ring.style.strokeDashoffset = String(COUNTDOWN_CIRCUMFERENCE * used);
    if (left <= 0 && currentOfferId) declineCurrentOffer();
  };
  tick();
  offerTimer = setInterval(tick, 200);
}

function closeOfferModal() {
  const modal = document.getElementById('offerModal');
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  currentOfferId = null;
  clearInterval(offerTimer);
  offerTimer = null;
  stopRingtone();
}

async function loadRides() {
  try {
    const { rides } = await api.getRides();
    const available = rides.filter((r) => r.status === 'aguardando');
    const mine = rides.filter((r) => r.motoristaId === auth.getUser().id);
    const active = mine.find((r) => ['aceita', 'em_andamento'].includes(r.status)) || null;
    window.caronaActiveRide = active;

    document.getElementById('statDisponiveis').textContent = available.length;
    detectNewOffers(available, !!active);
    renderAvailableRides(available);
    renderMyRides(mine);
    renderDriverRoute(active);
    renderVisor(active, available.length);
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
    container.innerHTML = '<p class="empty-state">Nenhuma corrida disponível no momento. Aguarde o chamado no visor. 📡</p>';
    return;
  }

  container.innerHTML = rides.map((ride) => `
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
          <small class="km-meta">${kmGaugeIcon()} ${ride.distancia} km · ${paymentLabel(ride)} · 95% líquido</small>
        </div>
      </div>
      <p class="ride-rating-inline">${ratingLabel(ride.passageiroRating)}</p>
      <div class="ride-actions">
        <button class="btn btn-primary btn-sm" onclick="openOfferFromList('${ride.id}')">📞 Ver chamado</button>
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

  container.innerHTML = rides.map((ride) => `
    <div class="ride-item">
      <div class="ride-item-header">
        ${driverBadge(ride.status)}
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
          <small> líquido · ${paymentLabel(ride)}</small>
        </div>
        <span class="ride-passenger">🧳 ${ride.passageiroNome}</span>
        <div class="ride-actions">
          ${ride.status === 'aceita' && !ride.chegadaEm ? `<button class="btn btn-sm btn-secondary" onclick="arriveRide('${ride.id}')">📍 Cheguei</button>` : ''}
          ${ride.status === 'aceita' ? `<button class="btn btn-sm btn-primary" onclick="startRide('${ride.id}')">▶️ Iniciar</button>` : ''}
          ${ride.status === 'em_andamento' ? `<button class="btn btn-sm btn-primary" onclick="completeRide('${ride.id}')">✅ Finalizar</button>` : ''}
          ${['aceita', 'em_andamento'].includes(ride.status) ? `<button type="button" class="btn btn-sm btn-secondary" onclick="openDriverRouteWindow('${ride.id}')">Navegar</button>` : ''}
          ${ride.status === 'aceita' ? `<button class="btn btn-sm btn-danger" onclick="cancelRide('${ride.id}')">Cancelar</button>` : ''}
          ${ride.status === 'concluida' && !ride.avaliacaoPassageiro
            ? `<button class="btn btn-sm btn-primary" onclick="openRatingModal('${ride.id}', '${ride.passageiroNome}')">⭐ Avaliar passageiro</button>`
            : ride.avaliacaoPassageiro ? `<span class="ride-rating">${'⭐'.repeat(ride.avaliacaoPassageiro)}</span>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

window.openOfferFromList = async function (id) {
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

function initNavWindowSync() {
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type === 'carona-nav-updated') {
      lastHudRideKey = '';
      loadRides();
    }
  });
}

window.openDriverRouteWindow = function (id) {
  const rideId = id || window.caronaActiveRide?.id;
  if (!rideId) return;
  const params = new URLSearchParams({ ride: rideId });
  const coords = window.caronaDriverCoords;
  if (coords) {
    params.set('lat', String(coords.lat));
    params.set('lng', String(coords.lng));
  }
  const features = 'popup=yes,width=430,height=840,left=72,top=32,menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes';
  const win = window.open(`/trajeto.html?${params}`, 'caronaTrajeto', features);
  if (!win) {
    alert('Permita pop-ups para abrir o trajeto até o passageiro.');
  } else {
    win.focus();
  }
};

window.acceptRide = async function (id) {
  try {
    await api.acceptRide(id);
    closeOfferModal();
    offerQueue = offerQueue.filter((r) => r.id !== id);
    lastHudRideKey = '';
    await loadRides();
    switchPanel('corridas');
    openDriverRouteWindow(id);
  } catch (err) {
    alert(err.message);
    loadRides();
  }
};

window.arriveRide = async function (id) {
  try {
    await api.arriveRide(id);
    lastHudRideKey = '';
    loadRides();
  } catch (err) {
    alert(err.message);
  }
};

window.startRide = async function (id) {
  try {
    await api.startRide(id);
    lastHudRideKey = '';
    loadRides();
    switchPanel('corridas');
  } catch (err) {
    alert(err.message);
  }
};

window.completeRide = async function (id) {
  try {
    const { rides } = await api.getRides();
    const ride = rides.find((r) => r.id === id);
    const { ride: finished } = await api.completeRide(id);
    lastHudRideKey = '';
    await loadRides();
    await loadStats();
    openReceiptModal(finished || ride);
  } catch (err) {
    alert(err.message);
  }
};

window.cancelRide = async function (id) {
  if (!confirm('Deseja cancelar esta corrida?')) return;
  try {
    await api.cancelRide(id);
    lastHudRideKey = '';
    loadRides();
  } catch (err) {
    alert(err.message);
  }
};

function openReceiptModal(ride) {
  if (!ride) return;
  receiptRide = ride;
  const duration = ride.tempoPercursoSegundos
    ? formatDuration(ride.tempoPercursoSegundos)
    : (ride.duracaoTexto || formatDuration(ride.duracaoSegundos));
  const km = ride.kmRodados || ride.distancia;
  document.getElementById('receiptModalBody').innerHTML = `
    <div class="receipt-hero">
      <span>Você recebeu</span>
      <strong>${formatCurrency(ride.motorista)}</strong>
    </div>
    <div class="estimate-modal-grid">
      <div class="estimate-modal-item"><span class="km-meta">${kmGaugeIcon()} Km rodados</span><strong>${km} km</strong></div>
      <div class="estimate-modal-item"><span>Tempo do percurso</span><strong>${duration}</strong></div>
      <div class="estimate-modal-item"><span>Pagamento</span><strong>${paymentLabel(ride)}</strong></div>
      <div class="estimate-modal-item"><span>Passageiro pagou</span><strong>${formatCurrency(ride.total)}</strong></div>
      <div class="estimate-modal-item"><span>Taxa plataforma</span><strong>${formatCurrency(ride.taxaMotorista || 0)}</strong></div>
      <div class="estimate-modal-item highlight"><span>Líquido 95%</span><strong>${formatCurrency(ride.motorista)}</strong></div>
    </div>
    <div class="estimate-modal-route">
      <div class="route-point"><span class="route-dot origin"></span> ${ride.origem}</div>
      <div class="route-point"><span class="route-dot dest"></span> ${ride.destino}</div>
    </div>
    <p class="ride-rating-inline">🧳 ${ride.passageiroNome} · ${ratingLabel(ride.passageiroRating)}</p>
  `;
  const modal = document.getElementById('receiptModal');
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
}

function closeReceiptModal() {
  const modal = document.getElementById('receiptModal');
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
}

window.openRatingModal = function (rideId, passengerName) {
  ratingRideId = rideId;
  document.getElementById('ratingValue').value = '5';
  document.getElementById('ratingPassengerName').textContent = passengerName || 'Passageiro';
  document.querySelectorAll('#ratingStars button').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.value) <= 5);
  });
  const modal = document.getElementById('ratingModal');
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
};

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
