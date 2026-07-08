const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'carona-secret-key-2026';
const FEE_RATE = 0.05;
const PER_KM_PASSAGEIRO = 2.00;
const PER_KM_MOTORISTA = 2.00;

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const RIDES_FILE = path.join(DATA_DIR, 'rides.json');

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  });
}

loadEnv();
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.static(__dirname));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'Servidor Carona ativo.' });
});

function readJSON(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function ensureDataStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) {
    writeJSON(USERS_FILE, []);
  }
  if (!fs.existsSync(RIDES_FILE)) {
    writeJSON(RIDES_FILE, []);
  }
}

function writeJSON(file, data) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

ensureDataStore();

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não informado.' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

function sanitizeUser(user) {
  const { senha, resetToken, resetTokenExpiry, ...safe } = user;
  return safe;
}

function getUserRating(userId, role) {
  const rides = readJSON(RIDES_FILE);
  const scores = rides
    .filter((r) => r.status === 'concluida')
    .map((r) => {
      if (role === 'motorista' && r.motoristaId === userId) {
        return r.avaliacao || r.avaliacaoMotorista || null;
      }
      if (role === 'passageiro' && r.passageiroId === userId) {
        return r.avaliacaoPassageiro || null;
      }
      return null;
    })
    .filter((n) => typeof n === 'number' && n >= 1 && n <= 5);

  if (!scores.length) {
    return { media: null, total: 0, label: 'Nova conta · sem avaliações' };
  }

  const media = +(scores.reduce((s, n) => s + n, 0) / scores.length).toFixed(1);
  return {
    media,
    total: scores.length,
    label: `${'⭐'.repeat(Math.round(media))} (${media}) · ${scores.length} avaliação(ões)`
  };
}

function enrichRideForClient(ride) {
  const enriched = { ...ride };
  if (ride.passageiroId) {
    enriched.passageiroRating = getUserRating(ride.passageiroId, 'passageiro');
  }
  if (ride.motoristaId) {
    enriched.motoristaRating = getUserRating(ride.motoristaId, 'motorista');
  }
  return enriched;
}

function calculateFare(distancia) {
  const valorPassageiro = +(distancia * PER_KM_PASSAGEIRO).toFixed(2);
  const valorMotoristaBruto = +(distancia * PER_KM_MOTORISTA).toFixed(2);
  const taxaPassageiro = +(valorPassageiro * FEE_RATE).toFixed(2);
  const taxaMotorista = +(valorMotoristaBruto * FEE_RATE).toFixed(2);
  const taxa = +(taxaPassageiro + taxaMotorista).toFixed(2);
  const motorista = +(valorMotoristaBruto - taxaMotorista).toFixed(2);

  return {
    total: valorPassageiro,
    motoristaBruto: valorMotoristaBruto,
    motorista,
    taxa,
    taxaPassageiro,
    taxaMotorista,
    distancia,
    perKmPassageiro: PER_KM_PASSAGEIRO,
    perKmMotorista: PER_KM_MOTORISTA
  };
}

function formatDurationPt(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${Math.max(minutes, 1)} min`;
}

async function fetchGoogleRoute(origem, destino) {
  if (!GOOGLE_MAPS_API_KEY) return null;

  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
  url.searchParams.set('origin', origem);
  url.searchParams.set('destination', destino);
  url.searchParams.set('key', GOOGLE_MAPS_API_KEY);
  url.searchParams.set('language', 'pt-BR');
  url.searchParams.set('region', 'br');
  url.searchParams.set('mode', 'driving');

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== 'OK' || !data.routes?.length) {
    throw new Error(data.error_message || 'Não foi possível calcular a rota no Google Maps.');
  }

  const leg = data.routes[0].legs[0];
  const distanceKm = +(leg.distance.value / 1000).toFixed(1);

  return {
    distancia: Math.max(distanceKm, 0.1),
    duracaoSegundos: leg.duration.value,
    duracaoTexto: leg.duration.text,
    origemLat: leg.start_location.lat,
    origemLng: leg.start_location.lng,
    destinoLat: leg.end_location.lat,
    destinoLng: leg.end_location.lng,
    rotaPolyline: data.routes[0].overview_polyline.points,
    mapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origem)}&destination=${encodeURIComponent(destino)}&travelmode=driving`,
    mapsFonte: 'google'
  };
}

async function resolveRoute(origem, destino) {
  if (GOOGLE_MAPS_API_KEY) {
    const route = await fetchGoogleRoute(origem, destino);
    if (route) return route;
  }

  const distance = Math.max(2, (origem.length + destino.length) % 15 + 3);
  return {
    distancia: distance,
    duracaoSegundos: distance * 180,
    duracaoTexto: formatDurationPt(distance * 180),
    mapsUrl: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origem)}&destination=${encodeURIComponent(destino)}&travelmode=driving`,
    mapsFonte: 'estimativa'
  };
}

async function buildRideQuote(origem, destino) {
  const route = await resolveRoute(origem, destino);
  const fare = calculateFare(route.distancia);
  return { ...fare, ...route };
}

function findUserByEmail(email) {
  const users = readJSON(USERS_FILE);
  return users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, tipo: user.tipo, nome: user.nome },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// --- AUTH ---

app.post('/api/auth/register/passageiro', async (req, res) => {
  const { nome, email, telefone, cpf, senha, cidade } = req.body;
  if (!nome || !email || !telefone || !cpf || !senha || !cidade) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
  }
  if (senha.length < 8) {
    return res.status(400).json({ error: 'A senha deve ter no mínimo 8 caracteres.' });
  }
  const users = readJSON(USERS_FILE);
  if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
  }
  const user = {
    id: uuidv4(),
    tipo: 'passageiro',
    nome, email, telefone, cpf, cidade,
    senha: await bcrypt.hash(senha, 10),
    criadoEm: new Date().toISOString()
  };
  users.push(user);
  writeJSON(USERS_FILE, users);
  const token = createToken(user);
  res.status(201).json({ message: 'Cadastro realizado com sucesso!', token, user: sanitizeUser(user) });
});

app.post('/api/auth/register/motorista', async (req, res) => {
  const { nome, email, telefone, cpf, senha, cidade, cnh, cnh_categoria, veiculo, placa, cor, ano } = req.body;
  if (!nome || !email || !telefone || !cpf || !senha || !cidade || !cnh || !cnh_categoria || !veiculo || !placa || !cor || !ano) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
  }
  if (senha.length < 8) {
    return res.status(400).json({ error: 'A senha deve ter no mínimo 8 caracteres.' });
  }
  const users = readJSON(USERS_FILE);
  if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
  }
  const user = {
    id: uuidv4(),
    tipo: 'motorista',
    nome, email, telefone, cpf, cidade,
    cnh, cnh_categoria,
    veiculo: { modelo: veiculo, placa, cor, ano: parseInt(ano, 10) },
    senha: await bcrypt.hash(senha, 10),
    online: false,
    criadoEm: new Date().toISOString()
  };
  users.push(user);
  writeJSON(USERS_FILE, users);
  const token = createToken(user);
  res.status(201).json({ message: 'Cadastro realizado com sucesso!', token, user: sanitizeUser(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, senha } = req.body;
  if (!email || !senha) {
    return res.status(400).json({ error: 'Informe e-mail e senha.' });
  }
  const user = findUserByEmail(email);
  if (!user || !(await bcrypt.compare(senha, user.senha))) {
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }
  const token = createToken(user);
  res.json({ token, user: sanitizeUser(user) });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
  res.json({ user: sanitizeUser(user) });
});

app.post('/api/auth/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Informe seu e-mail.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Informe um e-mail válido.' });
  }

  const users = readJSON(USERS_FILE);
  const index = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
  const message = 'Se este e-mail estiver cadastrado, você receberá instruções para redefinir sua senha.';

  if (index === -1) {
    return res.json({ message });
  }

  const token = uuidv4();
  users[index].resetToken = token;
  users[index].resetTokenExpiry = Date.now() + 3600000;
  writeJSON(USERS_FILE, users);

  res.json({
    message,
    resetLink: `/redefinir-senha.html?token=${token}`
  });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { token, senha } = req.body;
  if (!token || !senha) {
    return res.status(400).json({ error: 'Informe o token e a nova senha.' });
  }
  if (senha.length < 8) {
    return res.status(400).json({ error: 'A senha deve ter no mínimo 8 caracteres.' });
  }

  const users = readJSON(USERS_FILE);
  const index = users.findIndex(
    u => u.resetToken === token && u.resetTokenExpiry && u.resetTokenExpiry > Date.now()
  );

  if (index === -1) {
    return res.status(400).json({ error: 'Link inválido ou expirado. Solicite uma nova redefinição.' });
  }

  users[index].senha = await bcrypt.hash(senha, 10);
  delete users[index].resetToken;
  delete users[index].resetTokenExpiry;
  writeJSON(USERS_FILE, users);

  res.json({ message: 'Senha redefinida com sucesso!' });
});

app.patch('/api/auth/profile', authMiddleware, (req, res) => {
  const { email, telefone, cidade } = req.body;
  if (!email || !telefone || !cidade) {
    return res.status(400).json({ error: 'Preencha e-mail, telefone e cidade.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Informe um e-mail válido.' });
  }
  if (telefone.replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'Informe um telefone válido.' });
  }
  if (!cidade.trim()) {
    return res.status(400).json({ error: 'Informe sua cidade.' });
  }

  const users = readJSON(USERS_FILE);
  const index = users.findIndex(u => u.id === req.user.id);
  if (index === -1) return res.status(404).json({ error: 'Usuário não encontrado.' });

  const emailTaken = users.some(
    u => u.id !== req.user.id && u.email.toLowerCase() === email.toLowerCase()
  );
  if (emailTaken) {
    return res.status(409).json({ error: 'Este e-mail já está em uso por outra conta.' });
  }

  users[index].email = email.trim();
  users[index].telefone = telefone.trim();
  users[index].cidade = cidade.trim();
  writeJSON(USERS_FILE, users);

  const user = sanitizeUser(users[index]);
  const token = createToken(users[index]);
  res.json({ message: 'Perfil atualizado com sucesso!', user, token });
});

// --- MAPS ---

app.get('/api/maps/config', (_req, res) => {
  res.json({
    enabled: !!GOOGLE_MAPS_API_KEY,
    apiKey: GOOGLE_MAPS_API_KEY
  });
});

// --- RIDES ---

app.post('/api/rides/estimate', async (req, res) => {
  const { origem, destino } = req.body;
  if (!origem || !destino) {
    return res.status(400).json({ error: 'Informe origem e destino.' });
  }
  try {
    const quote = await buildRideQuote(origem, destino);
    res.json({
      ...quote,
      economia: +(quote.total * 0.2).toFixed(2),
      taxaPercentual: 5
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/rides', authMiddleware, async (req, res) => {
  if (req.user.tipo !== 'passageiro') {
    return res.status(403).json({ error: 'Apenas passageiros podem solicitar corridas.' });
  }
  const { origem, destino, pagamento } = req.body;
  if (!origem || !destino) {
    return res.status(400).json({ error: 'Informe origem e destino.' });
  }
  const pagamentoOk = ['pix', 'dinheiro', 'cartao'].includes(pagamento) ? pagamento : 'pix';
  try {
    const quote = await buildRideQuote(origem, destino);
    const rides = readJSON(RIDES_FILE);
    const active = rides.find((r) =>
      r.passageiroId === req.user.id &&
      ['aguardando', 'aceita', 'em_andamento'].includes(r.status)
    );
    if (active) {
      return res.status(400).json({ error: 'Você já tem uma corrida em andamento.' });
    }

    const users = readJSON(USERS_FILE);
    const onlineDrivers = users.filter((u) => u.tipo === 'motorista' && u.online).length;

    const ride = {
      id: uuidv4(),
      passageiroId: req.user.id,
      passageiroNome: req.user.nome,
      motoristaId: null,
      motoristaNome: null,
      origem,
      destino,
      pagamento: pagamentoOk,
      ...quote,
      status: 'aguardando',
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString()
    };
    rides.push(ride);
    writeJSON(RIDES_FILE, rides);
    res.status(201).json({
      message: onlineDrivers
        ? `Corrida solicitada! ${onlineDrivers} motorista(s) online.`
        : 'Corrida solicitada! Aguardando motorista ficar online.',
      ride: enrichRideForClient(ride),
      motoristasOnline: onlineDrivers
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/rides', authMiddleware, (req, res) => {
  const rides = readJSON(RIDES_FILE);
  let filtered;
  if (req.user.tipo === 'passageiro') {
    filtered = rides.filter(r => r.passageiroId === req.user.id);
  } else {
    const users = readJSON(USERS_FILE);
    const me = users.find((u) => u.id === req.user.id);
    const isOnline = !!me?.online;
    filtered = rides.filter(r =>
      r.motoristaId === req.user.id ||
      (isOnline && r.status === 'aguardando' && !r.motoristaId)
    );
  }
  filtered.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
  res.json({ rides: filtered.map(enrichRideForClient) });
});

app.patch('/api/rides/:id/accept', authMiddleware, (req, res) => {
  if (req.user.tipo !== 'motorista') {
    return res.status(403).json({ error: 'Apenas motoristas podem aceitar corridas.' });
  }
  const users = readJSON(USERS_FILE);
  const me = users.find((u) => u.id === req.user.id);
  if (!me?.online) {
    return res.status(400).json({ error: 'Fique online para aceitar corridas.' });
  }
  const rides = readJSON(RIDES_FILE);
  const ride = rides.find(r => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Corrida não encontrada.' });
  if (ride.status !== 'aguardando') {
    return res.status(400).json({ error: 'Esta corrida não está mais disponível.' });
  }
  const busy = rides.some((r) =>
    r.motoristaId === req.user.id &&
    ['aceita', 'em_andamento'].includes(r.status)
  );
  if (busy) {
    return res.status(400).json({ error: 'Finalize a corrida atual antes de aceitar outra.' });
  }
  ride.motoristaId = req.user.id;
  ride.motoristaNome = req.user.nome;
  ride.motoristaTelefone = me.telefone || null;
  ride.motoristaVeiculo = me.veiculo || null;
  ride.status = 'aceita';
  ride.atualizadoEm = new Date().toISOString();
  writeJSON(RIDES_FILE, rides);
  res.json({ message: 'Corrida aceita! Passageiro notificado.', ride: enrichRideForClient(ride) });
});

app.patch('/api/rides/:id/start', authMiddleware, (req, res) => {
  const rides = readJSON(RIDES_FILE);
  const ride = rides.find(r => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Corrida não encontrada.' });
  if (ride.motoristaId !== req.user.id) {
    return res.status(403).json({ error: 'Sem permissão.' });
  }
  if (ride.status !== 'aceita') {
    return res.status(400).json({ error: 'Só é possível iniciar corridas aceitas.' });
  }
  ride.status = 'em_andamento';
  ride.atualizadoEm = new Date().toISOString();
  writeJSON(RIDES_FILE, rides);
  res.json({ message: 'Corrida iniciada!', ride: enrichRideForClient(ride) });
});

app.patch('/api/rides/:id/complete', authMiddleware, (req, res) => {
  const rides = readJSON(RIDES_FILE);
  const ride = rides.find(r => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Corrida não encontrada.' });
  if (ride.motoristaId !== req.user.id) {
    return res.status(403).json({ error: 'Apenas o motorista pode finalizar a corrida.' });
  }
  if (ride.status !== 'em_andamento') {
    return res.status(400).json({ error: 'Inicie a corrida antes de finalizar.' });
  }
  ride.status = 'concluida';
  if (req.body.avaliacaoPassageiro) {
    ride.avaliacaoPassageiro = Number(req.body.avaliacaoPassageiro);
  }
  ride.atualizadoEm = new Date().toISOString();
  writeJSON(RIDES_FILE, rides);
  res.json({ message: 'Corrida concluída!', ride: enrichRideForClient(ride) });
});

app.patch('/api/rides/:id/rate', authMiddleware, (req, res) => {
  const rides = readJSON(RIDES_FILE);
  const ride = rides.find(r => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Corrida não encontrada.' });
  if (ride.status !== 'concluida') {
    return res.status(400).json({ error: 'Só é possível avaliar corridas concluídas.' });
  }

  const nota = Number(req.body.avaliacao);
  if (!nota || nota < 1 || nota > 5) {
    return res.status(400).json({ error: 'Informe uma avaliação de 1 a 5.' });
  }

  if (req.user.tipo === 'passageiro' && ride.passageiroId === req.user.id) {
    ride.avaliacao = nota;
    ride.avaliacaoMotorista = nota;
  } else if (req.user.tipo === 'motorista' && ride.motoristaId === req.user.id) {
    ride.avaliacaoPassageiro = nota;
  } else {
    return res.status(403).json({ error: 'Sem permissão para avaliar.' });
  }

  ride.atualizadoEm = new Date().toISOString();
  writeJSON(RIDES_FILE, rides);
  res.json({ message: 'Avaliação registrada!', ride: enrichRideForClient(ride) });
});

app.patch('/api/rides/:id/cancel', authMiddleware, (req, res) => {
  const rides = readJSON(RIDES_FILE);
  const ride = rides.find(r => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Corrida não encontrada.' });
  const canCancel = ride.passageiroId === req.user.id ||
    (ride.motoristaId === req.user.id && ride.status === 'aceita');
  if (!canCancel) return res.status(403).json({ error: 'Sem permissão para cancelar.' });
  if (['concluida', 'cancelada'].includes(ride.status)) {
    return res.status(400).json({ error: 'Esta corrida já foi finalizada.' });
  }
  ride.status = 'cancelada';
  ride.atualizadoEm = new Date().toISOString();
  writeJSON(RIDES_FILE, rides);
  res.json({ message: 'Corrida cancelada.', ride: enrichRideForClient(ride) });
});

// --- DRIVER STATUS ---

app.patch('/api/driver/status', authMiddleware, (req, res) => {
  if (req.user.tipo !== 'motorista') {
    return res.status(403).json({ error: 'Apenas motoristas.' });
  }
  const users = readJSON(USERS_FILE);
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
  user.online = !!req.body.online;
  writeJSON(USERS_FILE, users);
  res.json({ online: user.online });
});

// --- STATS ---

app.get('/api/stats', authMiddleware, (req, res) => {
  const rides = readJSON(RIDES_FILE);
  const myRides = req.user.tipo === 'passageiro'
    ? rides.filter(r => r.passageiroId === req.user.id)
    : rides.filter(r => r.motoristaId === req.user.id);

  const concluidas = myRides.filter(r => r.status === 'concluida');
  const totalGasto = concluidas.reduce((s, r) => s + r.total, 0);
  const totalGanho = concluidas.reduce((s, r) => s + r.motorista, 0);
  const totalTaxa = concluidas.reduce((s, r) => s + r.taxa, 0);

  res.json({
    totalCorridas: myRides.length,
    concluidas: concluidas.length,
    aguardando: myRides.filter(r => r.status === 'aguardando').length,
    emAndamento: myRides.filter(r => r.status === 'em_andamento' || r.status === 'aceita').length,
    totalGasto: +totalGasto.toFixed(2),
    totalGanho: +totalGanho.toFixed(2),
    totalTaxa: +totalTaxa.toFixed(2),
    taxaPercentual: 5
  });
});

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    const file = path.join(__dirname, req.path === '/' ? 'index.html' : req.path);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      return res.sendFile(file);
    }
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
  res.status(404).json({ error: 'Rota não encontrada.' });
});

app.listen(PORT, () => {
  console.log(`\n🚗 Carona rodando em http://localhost:${PORT}\n`);
});
