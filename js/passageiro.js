let currentEstimate = null;
let pollInterval = null;
let passengerRidesCache = [];
let lastKnownStatus = {};
let ratingRideId = null;

const PAYMENT_LABELS = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão'
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!auth.requireAuth('passageiro')) return;
  initDashboard();
  initEstimateModal();
  initPassengerRatingModal();
  try {
    await caronaMaps.init();
    caronaMaps.bindAddressInputs('origem', 'destino');
  } catch (err) {
    console.warn('Google Maps indisponível:', err.message);
  }
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
  document.getElementById('clearRideFormBtn').addEventListener('click', clearRideForm);
  document.getElementById('rideForm').addEventListener('submit', handleCreateRide);
  initPayChips();

  const hashPanel = (window.location.hash || '').replace('#', '');
  const validPanels = ['solicitar', 'insights', 'historico', 'perfil'];
  switchPanel(validPanels.includes(hashPanel) ? hashPanel : 'solicitar');

  loadStats();
  loadRides();
  pollInterval = setInterval(loadRides, 3000);
}

function initPayChips() {
  const select = document.getElementById('pagamento');
  const chips = document.querySelectorAll('.pay-chip');
  if (!select || !chips.length) return;

  const sync = () => {
    chips.forEach((chip) => {
      chip.classList.toggle('is-active', chip.dataset.pay === select.value);
    });
  };

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      select.value = chip.dataset.pay;
      sync();
    });
  });

  select.addEventListener('change', sync);
  sync();
}

function initEstimateModal() {
  const modal = document.getElementById('estimateModal');
  const close = () => closeEstimateModal();

  document.getElementById('closeEstimateModal').addEventListener('click', close);
  document.getElementById('estimateModalBackdrop').addEventListener('click', close);
  document.getElementById('cancelFromModal').addEventListener('click', cancelEstimateFromModal);
  document.getElementById('confirmFromModal').addEventListener('click', () => {
    closeEstimateModal();
    document.getElementById('rideForm').requestSubmit();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });
}

function initPassengerRatingModal() {
  const modal = document.getElementById('ratingModal');
  if (!modal) return;

  document.getElementById('closeRatingModal')?.addEventListener('click', closePassengerRatingModal);
  document.getElementById('ratingModalBackdrop')?.addEventListener('click', closePassengerRatingModal);
  document.getElementById('skipRatingBtn')?.addEventListener('click', closePassengerRatingModal);
  document.getElementById('submitRatingBtn')?.addEventListener('click', submitPassengerRating);

  document.querySelectorAll('#ratingStars button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = Number(btn.dataset.value);
      document.getElementById('ratingValue').value = value;
      document.querySelectorAll('#ratingStars button').forEach((b) => {
        b.classList.toggle('active', Number(b.dataset.value) <= value);
      });
    });
  });
}

function formatStars(value) {
  if (!value) return '—';
  const rounded = Math.max(1, Math.min(5, Math.round(value)));
  return `${'⭐'.repeat(rounded)} (${value.toFixed(1)})`;
}

function getPassengerRating() {
  const concluidas = passengerRidesCache.filter((ride) => ride.status === 'concluida').length;
  if (concluidas >= 10) return { label: '⭐⭐⭐⭐⭐ Passageiro frequente' };
  if (concluidas >= 5) return { label: '⭐⭐⭐⭐ Bom histórico de corridas' };
  if (concluidas >= 1) return { label: '⭐⭐⭐ Conta com corridas realizadas' };
  return { label: 'Nova conta · sem histórico ainda' };
}

function openEstimateModal(estimate, origem, destino) {
  const user = auth.getUser();
  const pagamento = document.getElementById('pagamento').value;
  const passengerRating = getPassengerRating();
  const duration = estimate.duracaoTexto || formatDuration(estimate.duracaoSegundos);
  const modal = document.getElementById('estimateModal');
  const body = document.getElementById('estimateModalBody');

  const valorFinal = Number(estimate.total) || 0;
  const valorCheio = +(valorFinal * 1.2).toFixed(2);
  const descontoClub = +(valorCheio - valorFinal).toFixed(2);

  body.innerHTML = `
    <div class="estimate-modal-route">
      <div class="route-point"><span class="route-dot origin"></span> <strong>Origem:</strong> ${origem}</div>
      <div class="route-point"><span class="route-dot dest"></span> <strong>Destino:</strong> ${destino}</div>
    </div>

    <div class="estimate-price-hero">
      <div class="estimate-price-hero-top">
        <span class="estimate-club-badge">🏷️ CCB · Club Carona Brasil · 20% OFF</span>
        <span class="estimate-price-old">${formatCurrency(valorCheio)}</span>
      </div>
      <div class="estimate-price-hero-main">
        <span class="estimate-price-label">Você paga</span>
        <strong class="estimate-price-final">${formatCurrency(valorFinal)}</strong>
      </div>
      <p class="estimate-price-discount">
        Economia de <strong>${formatCurrency(descontoClub)}</strong> com desconto no CCB - Club Carona Brasil
      </p>
    </div>

    <div class="estimate-modal-grid">
      <div class="estimate-modal-item"><span>Distância</span><strong>${estimate.distancia} km</strong></div>
      <div class="estimate-modal-item"><span>Tempo estimado</span><strong>${duration}</strong></div>
      <div class="estimate-modal-item"><span>Valor por km</span><strong>${formatCurrency(estimate.perKmPassageiro)}</strong></div>
      <div class="estimate-modal-item"><span>Taxa plataforma (5%)</span><strong>${formatCurrency(estimate.taxaPassageiro || estimate.taxa)}</strong></div>
      <div class="estimate-modal-item"><span>Forma de pagamento</span><strong>${PAYMENT_LABELS[pagamento] || pagamento}</strong></div>
      <div class="estimate-modal-item highlight"><span>Desconto CCB</span><strong>- ${formatCurrency(descontoClub)}</strong></div>
    </div>
    <div class="estimate-modal-ratings">
      <div class="estimate-modal-rating-card">
        <h3>🧳 Passageiro</h3>
        <strong>${user.nome}</strong>
        <span>${passengerRating.label}</span>
      </div>
      <div class="estimate-modal-rating-card">
        <h3>🚙 Motorista</h3>
        <strong>Aguardando motorista</strong>
        <span>⭐ Será exibida após aceite da corrida</span>
      </div>
    </div>
  `;

  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => {
    caronaMaps.renderModalRoute('estimateModalMap', estimate, origem, destino);
    setTimeout(() => {
      if (window.google?.maps && caronaMaps.modalMap) {
        google.maps.event.trigger(caronaMaps.modalMap, 'resize');
      }
    }, 250);
  });
}

function closeEstimateModal() {
  const modal = document.getElementById('estimateModal');
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function cancelEstimateFromModal() {
  closeEstimateModal();
  currentEstimate = null;
  document.getElementById('estimateResult').hidden = true;
  document.getElementById('mapPlaceholder').hidden = false;
  document.getElementById('routeMap').hidden = true;
  showFeedback(document.getElementById('rideFeedback'), 'Corrida cancelada. Você pode estimar novamente.', '');
}

function clearRideForm() {
  closeEstimateModal();
  const form = document.getElementById('rideForm');
  form.reset();
  currentEstimate = null;
  document.getElementById('estimateResult').hidden = true;
  document.getElementById('mapPlaceholder').hidden = false;
  document.getElementById('routeMap').hidden = true;
  showFeedback(document.getElementById('rideFeedback'), '', '');
  document.getElementById('origem').focus();
}

function switchPanel(panel) {
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.toggle('active', l.dataset.panel === panel));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${panel}`));
  document.getElementById('sidebar').classList.remove('open');
  if (panel === 'perfil') loadPassageiroProfile();
  if (panel === 'insights') loadStats();
  if (window.location.hash.replace('#', '') !== panel) {
    history.replaceState(null, '', `#${panel}`);
  }
  if (panel === 'solicitar') {
    requestAnimationFrame(() => document.getElementById('origem')?.focus());
  }
}

function loadPassageiroProfile() {
  loadProfileContent(
    (user) => `<div class="profile-field"><label>CPF</label><span>${user.cpf || '—'}</span></div>`,
    '🧳 Passageiro'
  );
}

async function loadStats() {
  try {
    const stats = await api.getStats();
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    setText('statCorridas', stats.concluidas ?? 0);
    setText('statCanceladas', stats.canceladas ?? 0);
    setText('statGasto', formatCurrency(stats.totalGasto || 0));
    setText('statCashback', formatCurrency(stats.cashback || 0));

    setText('kpiCredito', formatCurrency(stats.credito || 0));
    setText('kpiSaldo', formatCurrency(stats.dinheiroConta || 0));
    setText('kpiCashback', formatCurrency(stats.cashback || 0));
    setText('kpiEconomia', formatCurrency(stats.economia || 0));

    renderPassengerCharts(stats);
  } catch { /* silent */ }
}

const CHART_COLORS = {
  finalizadas: '#22C55E',
  canceladas: '#EF4444',
  aguardando: '#F59E0B',
  emAndamento: '#3B82F6',
  pix: '#10B981',
  dinheiro: '#6366F1',
  cartao: '#F97316',
  gasto: '#0B1220',
  cashback: '#22C55E',
  credito: '#8B5CF6',
  saldo: '#06B6D4'
};

function renderPassengerCharts(stats) {
  const fluxo = stats.fluxoUso || {
    finalizadas: stats.concluidas || 0,
    canceladas: stats.canceladas || 0,
    aguardando: stats.aguardando || 0,
    emAndamento: stats.emAndamento || 0
  };

  const fluxoSlices = [
    { key: 'finalizadas', label: 'Finalizadas', value: fluxo.finalizadas || 0, color: CHART_COLORS.finalizadas },
    { key: 'canceladas', label: 'Canceladas', value: fluxo.canceladas || 0, color: CHART_COLORS.canceladas },
    { key: 'aguardando', label: 'Aguardando', value: fluxo.aguardando || 0, color: CHART_COLORS.aguardando },
    { key: 'emAndamento', label: 'Em andamento', value: fluxo.emAndamento || 0, color: CHART_COLORS.emAndamento }
  ];

  renderPieChart('chartPieFluxo', 'chartPieLegend', fluxoSlices);
  renderBarChart('chartBarsFluxo', fluxoSlices.map((s) => ({
    label: s.label,
    value: s.value,
    color: s.color,
    display: String(s.value)
  })));

  const pay = stats.porPagamento || { pix: 0, dinheiro: 0, cartao: 0 };
  const paySlices = [
    { key: 'pix', label: 'Pix', value: pay.pix || 0, color: CHART_COLORS.pix },
    { key: 'dinheiro', label: 'Dinheiro', value: pay.dinheiro || 0, color: CHART_COLORS.dinheiro },
    { key: 'cartao', label: 'Cartão', value: pay.cartao || 0, color: CHART_COLORS.cartao }
  ];
  renderPieChart('chartPiePagamento', 'chartPayLegend', paySlices);

  const financeBars = [
    { label: 'Gasto', value: stats.totalGasto || 0, color: CHART_COLORS.gasto, display: formatCurrency(stats.totalGasto || 0) },
    { label: 'Cashback', value: stats.cashback || 0, color: CHART_COLORS.cashback, display: formatCurrency(stats.cashback || 0) },
    { label: 'Crédito', value: stats.credito || 0, color: CHART_COLORS.credito, display: formatCurrency(stats.credito || 0) },
    { label: 'Em conta', value: stats.dinheiroConta || 0, color: CHART_COLORS.saldo, display: formatCurrency(stats.dinheiroConta || 0) }
  ];
  renderBarChart('chartBarsFinance', financeBars);
}

function renderPieChart(svgId, legendId, slices) {
  const svg = document.getElementById(svgId);
  const legend = document.getElementById(legendId);
  if (!svg || !legend) return;

  const total = slices.reduce((sum, i) => sum + (Number(i.value) || 0), 0);
  const cx = 100;
  const cy = 100;
  const r = 78;

  if (total <= 0) {
    svg.innerHTML = `
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#E5E7EB"></circle>
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="#6B7280" font-size="13" font-family="Outfit, sans-serif">Sem dados</text>
    `;
    legend.innerHTML = slices.map((s) => `
      <li><span class="chart-swatch" style="background:${s.color}"></span>${s.label}: <strong>0</strong></li>
    `).join('');
    return;
  }

  let angle = -Math.PI / 2;
  const paths = slices.filter((s) => s.value > 0).map((s) => {
    const portion = (s.value / total) * Math.PI * 2;
    const start = angle;
    angle += portion;
    const end = angle;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const large = portion > Math.PI ? 1 : 0;
    return `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z" fill="${s.color}">
      <title>${s.label}: ${s.value}</title>
    </path>`;
  });

  svg.innerHTML = paths.join('') + `
    <circle cx="${cx}" cy="${cy}" r="42" fill="#fff"></circle>
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="#0B1220" font-size="18" font-weight="800" font-family="Space Grotesk, sans-serif">${total}</text>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" fill="#6B7280" font-size="11" font-family="Outfit, sans-serif">corridas</text>
  `;

  legend.innerHTML = slices.map((s) => {
    const pct = total ? Math.round((s.value / total) * 100) : 0;
    return `<li><span class="chart-swatch" style="background:${s.color}"></span>${s.label}: <strong>${s.value}</strong> <em>(${pct}%)</em></li>`;
  }).join('');
}

function renderBarChart(containerId, items) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const max = Math.max(...items.map((i) => Number(i.value) || 0), 1);

  el.innerHTML = items.map((item) => {
    const height = Math.max(6, Math.round(((Number(item.value) || 0) / max) * 100));
    return `
      <div class="chart-bar-col">
        <span class="chart-bar-value">${item.display ?? item.value}</span>
        <div class="chart-bar-track">
          <div class="chart-bar-fill" style="height:${height}%; background:${item.color}"></div>
        </div>
        <span class="chart-bar-label">${item.label}</span>
      </div>
    `;
  }).join('');
}

function updateEstimateUI(estimate) {
  document.getElementById('estimateValue').textContent = formatCurrency(estimate.total);
  document.getElementById('estimateDist').textContent = `${estimate.distancia} km`;
  document.getElementById('estimateDuration').textContent = estimate.duracaoTexto || formatDuration(estimate.duracaoSegundos);
  document.getElementById('estimatePerKm').textContent = formatCurrency(estimate.perKmPassageiro);
  document.getElementById('estimateTaxa').textContent = formatCurrency(estimate.taxaPassageiro || estimate.taxa);
  document.getElementById('estimateSource').textContent = estimate.mapsFonte === 'google' ? 'Google Maps' : 'Estimativa';
  document.getElementById('estimateResult').hidden = false;
  document.getElementById('mapPlaceholder').hidden = true;
  caronaMaps.renderRoute('routeMap', estimate);
}

async function handleEstimate() {
  const origem = document.getElementById('origem').value.trim();
  const destino = document.getElementById('destino').value.trim();
  const feedback = document.getElementById('rideFeedback');
  const btn = document.getElementById('estimateBtn');

  if (!origem || !destino) {
    return showFeedback(feedback, 'Informe origem e destino.', 'error');
  }

  btn.disabled = true;
  btn.textContent = '⏳ Calculando rota...';

  try {
    currentEstimate = await api.estimateRide(origem, destino);
    updateEstimateUI(currentEstimate);
    openEstimateModal(currentEstimate, origem, destino);
    showFeedback(feedback, '', '');
  } catch (err) {
    showFeedback(feedback, err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '💰 Preço';
  }
}

async function handleCreateRide(e) {
  e.preventDefault();
  const origem = document.getElementById('origem').value.trim();
  const destino = document.getElementById('destino').value.trim();
  const pagamento = document.getElementById('pagamento').value;
  const feedback = document.getElementById('rideFeedback');

  if (!origem || !destino) {
    return showFeedback(feedback, 'Informe origem e destino.', 'error');
  }

  try {
    const result = await api.createRide(origem, destino, pagamento);
    closeEstimateModal();
    const onlineMsg = result.motoristasOnline
      ? ` ${result.motoristasOnline} motorista(s) online — matching em andamento.`
      : ' Nenhum motorista online no momento; a corrida fica na fila.';
    showFeedback(feedback, `✅ Corrida solicitada!${onlineMsg}`, 'success');
    window.caronaPwa?.notify('Corrida solicitada', {
      body: 'Procurando motorista próximo...',
      tag: `ride-${result.ride?.id}`
    });
    document.getElementById('rideForm').reset();
    document.getElementById('estimateResult').hidden = true;
    document.getElementById('mapPlaceholder').hidden = false;
    document.getElementById('routeMap').hidden = true;
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
    notifyPassengerStatusChanges(rides);
    passengerRidesCache = rides;
    renderRidesList(rides);
    renderActiveRide(rides);
  } catch { /* silent */ }
}

function notifyPassengerStatusChanges(rides) {
  rides.forEach((ride) => {
    const prev = lastKnownStatus[ride.id];
    if (prev && prev !== ride.status) {
      if (ride.status === 'aceita') {
        window.caronaPwa?.playAlert();
        window.caronaPwa?.notify('Motorista encontrado!', {
          body: `${ride.motoristaNome} aceitou sua corrida.`,
          tag: `ride-${ride.id}`
        });
      } else if (ride.status === 'em_andamento') {
        window.caronaPwa?.notify('Corrida iniciada', {
          body: 'Sua viagem está em andamento.',
          tag: `ride-${ride.id}`
        });
      } else if (ride.status === 'concluida') {
        window.caronaPwa?.notify('Corrida concluída', {
          body: 'Avalie o motorista quando puder.',
          tag: `ride-${ride.id}`
        });
        if (!ride.avaliacao) {
          openPassengerRatingModal(ride.id, ride.motoristaNome);
        }
      }
    }
    lastKnownStatus[ride.id] = ride.status;
  });
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
      ${routeMetaHtml(ride)}
      <div class="ride-item-footer">
        <span class="ride-price">${formatCurrency(ride.total)}</span>
        ${ride.motoristaNome ? `<span class="ride-driver">🚙 ${ride.motoristaNome}</span>` : ''}
        ${ride.mapsUrl ? `<a href="${ride.mapsUrl}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary">🗺️ Ver rota</a>` : ''}
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
    ${routeMetaHtml(active)}
    <div class="active-ride-price">
      <span>${formatCurrency(active.total)}</span>
      <small>${active.distancia} km × R$ 2,00/km · taxa 5%</small>
    </div>
    ${active.motoristaNome
      ? `<p class="active-driver">🚙 Motorista: <strong>${active.motoristaNome}</strong>${active.motoristaRating?.media ? ` · ${active.motoristaRating.label}` : ''}</p>
         ${active.motoristaVeiculo ? `<p class="active-driver">🚗 ${active.motoristaVeiculo.modelo || ''} · ${active.motoristaVeiculo.cor || ''} · ${active.motoristaVeiculo.placa || ''}</p>` : ''}`
      : '<p class="active-driver">⏳ Procurando motorista online...</p>'}
    <p class="active-driver">💳 Pagamento: <strong>${PAYMENT_LABELS[active.pagamento] || active.pagamento || 'Pix'}</strong></p>
    ${active.mapsUrl ? `<a href="${active.mapsUrl}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">🗺️ Abrir rota no Google Maps</a>` : ''}
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

window.rateRide = function(id) {
  const ride = passengerRidesCache.find((r) => r.id === id);
  openPassengerRatingModal(id, ride?.motoristaNome || 'Motorista');
};

function openPassengerRatingModal(rideId, driverName) {
  const modal = document.getElementById('ratingModal');
  if (!modal) return;
  ratingRideId = rideId;
  document.getElementById('ratingValue').value = '5';
  const nameEl = document.getElementById('ratingDriverName');
  if (nameEl) nameEl.textContent = driverName || 'Motorista';
  document.querySelectorAll('#ratingStars button').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.value) <= 5);
  });
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
}

function closePassengerRatingModal() {
  const modal = document.getElementById('ratingModal');
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  ratingRideId = null;
}

async function submitPassengerRating() {
  if (!ratingRideId) return;
  const value = Number(document.getElementById('ratingValue').value);
  try {
    await api.rateRide(ratingRideId, value);
    closePassengerRatingModal();
    loadRides();
  } catch (err) {
    alert(err.message);
  }
}
