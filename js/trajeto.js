let rideId = '';
let activeRide = null;
let gpsSpeed = null;
let lastRouteAt = 0;
let lastOriginKey = '';

const PAYMENT_LABELS = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão'
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!auth.requireLogin()) return;
  if (auth.getModoAtivo() !== 'motorista' || !auth.hasDriverProfile()) {
    window.location.href = '/motorista.html';
    return;
  }
  const params = new URLSearchParams(window.location.search);
  rideId = params.get('ride') || '';
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    window.caronaDriverCoords = { lat, lng };
  }

  try {
    await caronaMaps.init();
  } catch (err) {
    console.warn('Google Maps indisponível:', err.message);
  }

  initGeolocation();
  tickClock();
  setInterval(tickClock, 1000);
  await loadRide();
  setInterval(loadRide, 4000);
  setInterval(refreshRoute, 12000);
});

function initGeolocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.watchPosition(
    (pos) => {
      const speed = pos.coords.speed;
      gpsSpeed = Number.isFinite(speed) && speed >= 0 ? Math.round(speed * 3.6) : gpsSpeed;
      window.caronaDriverCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      updateSpeedometer(gpsSpeed ?? 0);
      caronaMaps.setNavDriverMarker(window.caronaDriverCoords);
      refreshRoute();
    },
    () => {
      gpsSpeed = gpsSpeed ?? 0;
      updateSpeedometer(gpsSpeed);
    },
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 8000 }
  );
}

function tickClock() {
  const clock = document.getElementById('navClock');
  if (clock) {
    clock.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  if (activeRide?.status === 'em_andamento') {
    const live = tripProgress(activeRide);
    updateSpeedometer(live.speed);
  }
}

function tripProgress(ride) {
  const duration = Math.max(Number(ride.duracaoSegundos) || 1, 1);
  const start = ride.iniciadaEm ? new Date(ride.iniciadaEm).getTime() : Date.now();
  const elapsed = Math.max(0, (Date.now() - start) / 1000);
  const estimatedSpeed = Math.round((Number(ride.distancia) / duration) * 3600);
  return { elapsed, speed: gpsSpeed ?? estimatedSpeed };
}

function paymentLabel(ride) {
  return PAYMENT_LABELS[ride.pagamento] || ride.pagamento || 'Pix';
}

function routeDestination(ride) {
  return ride.status === 'em_andamento' ? ride.destino : ride.origem;
}

function originString() {
  const coords = window.caronaDriverCoords;
  if (coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) {
    return `${coords.lat},${coords.lng}`;
  }
  return '';
}

function mapsUrl(ride) {
  const dest = routeDestination(ride);
  const origin = originString();
  const params = new URLSearchParams({
    api: '1',
    destination: dest,
    travelmode: 'driving'
  });
  if (origin) params.set('origin', origin);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function refreshRoute(force = false) {
  if (!activeRide || !['aceita', 'em_andamento'].includes(activeRide.status)) return;
  const origin = originString();
  const destination = routeDestination(activeRide);
  if (!origin) {
    document.getElementById('navEta').textContent = 'Ative o GPS';
    if (activeRide.origemLat) {
      caronaMaps.showLocation('navMap', { lat: activeRide.origemLat, lng: activeRide.origemLng });
    }
    return;
  }

  const key = `${origin}|${destination}`;
  const now = Date.now();
  if (!force && key === lastOriginKey && now - lastRouteAt < 12000) {
    caronaMaps.setNavDriverMarker(window.caronaDriverCoords);
    return;
  }

  lastOriginKey = key;
  lastRouteAt = now;
  const fallbackEta = `${activeRide.distancia} km · ${activeRide.duracaoTexto || formatDuration(activeRide.duracaoSegundos)}`;
  document.getElementById('navEta').textContent = fallbackEta;
  caronaMaps.renderNavRoute('navMap', origin, destination, {
    force,
    driverCoords: window.caronaDriverCoords,
    onRoute: (leg) => {
      const phase = activeRide.status === 'em_andamento' ? 'Até o destino' : 'Até o passageiro';
      document.getElementById('navEta').textContent = `${leg.distanciaKm} km · ${leg.duracaoTexto}`;
      const etaLive = document.getElementById('navEtaLive');
      if (etaLive) etaLive.textContent = `${phase}: ${leg.distanciaKm} km · ${leg.duracaoTexto}`;
    }
  });
}

async function loadRide() {
  try {
    const { rides } = await api.getRides();
    activeRide = rides.find((r) => r.id === rideId) || null;
    renderSheet(activeRide);
    if (activeRide && ['aceita', 'em_andamento'].includes(activeRide.status)) {
      refreshRoute();
    }
  } catch (err) {
    document.getElementById('navSheet').innerHTML = `<p class="nav-waiting">${err.message}</p>`;
  }
}

function renderSheet(ride) {
  const sheet = document.getElementById('navSheet');
  const phaseEl = document.getElementById('navPhase');

  if (!ride) {
    phaseEl.textContent = 'Sem corrida';
    phaseEl.classList.remove('is-online');
    sheet.innerHTML = '<p class="nav-waiting">Corrida não encontrada. Volte ao visor do motorista.</p>';
    return;
  }

  if (ride.status === 'concluida') {
    phaseEl.textContent = 'Finalizada';
    document.getElementById('navEta').textContent = 'Corrida concluída';
    sheet.innerHTML = `
      <h2>Corrida finalizada</h2>
      <p>Você já pode fechar esta janela e voltar ao visor.</p>
      <button class="btn btn-primary" type="button" onclick="window.close()">Fechar trajeto</button>
    `;
    return;
  }

  if (ride.status === 'cancelada') {
    phaseEl.textContent = 'Cancelada';
    sheet.innerHTML = '<p class="nav-waiting">Esta corrida foi cancelada.</p>';
    return;
  }

  const goingToPickup = ride.status === 'aceita';
  phaseEl.textContent = goingToPickup
    ? (ride.chegadaEm ? 'No embarque' : 'A caminho')
    : 'Em viagem';
  phaseEl.classList.add('is-online');

  const heading = goingToPickup ? 'Trajeto até o passageiro' : 'Trajeto até o destino';
  sheet.innerHTML = `
    <p class="nav-kicker">${heading}</p>
    <h2>${ride.passageiroNome}</h2>
    <p id="navEtaLive">${goingToPickup ? 'Até o passageiro' : 'Até o destino'}: ${ride.distancia} km · ${ride.duracaoTexto || formatDuration(ride.duracaoSegundos)}</p>
    <div class="visor-route-list">
      <div class="route-point"><span class="route-dot origin"></span> <strong>Embarque:</strong> ${ride.origem}</div>
      <div class="route-point"><span class="route-dot dest"></span> <strong>Destino:</strong> ${ride.destino}</div>
    </div>
    <div class="visor-metrics nav-metrics">
      <div class="visor-metric"><span>Pagamento</span><strong>${paymentLabel(ride)}</strong></div>
      <div class="visor-metric"><span>Você recebe</span><strong>${formatCurrency(ride.motorista)}</strong></div>
    </div>
    <div class="visor-actions">
      <a class="btn btn-secondary" href="${mapsUrl(ride)}" target="_blank" rel="noopener">Abrir no Maps</a>
      ${goingToPickup && !ride.chegadaEm ? `<button class="btn btn-primary" type="button" id="navArriveBtn">Cheguei</button>` : ''}
      ${goingToPickup ? `<button class="btn btn-primary" type="button" id="navStartBtn">Iniciar corrida</button>` : ''}
      ${ride.status === 'em_andamento' ? `<button class="btn btn-primary" type="button" id="navCompleteBtn">Finalizar</button>` : ''}
    </div>
  `;

  document.getElementById('navArriveBtn')?.addEventListener('click', () => runAction(() => api.arriveRide(ride.id)));
  document.getElementById('navStartBtn')?.addEventListener('click', () => runAction(() => api.startRide(ride.id)));
  document.getElementById('navCompleteBtn')?.addEventListener('click', () => runAction(() => api.completeRide(ride.id)));
}

async function runAction(fn) {
  try {
    await fn();
    lastOriginKey = '';
    await loadRide();
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'carona-nav-updated' }, window.location.origin);
    }
  } catch (err) {
    alert(err.message);
  }
}
