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

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const RIDES_FILE = path.join(DATA_DIR, 'rides.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

function readJSON(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

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
  const { senha, ...safe } = user;
  return safe;
}

function calculateFare(origem, destino) {
  const base = 8;
  const perKm = 2.5;
  const distance = Math.max(2, (origem.length + destino.length) % 15 + 3);
  const total = base + distance * perKm;
  const taxa = +(total * FEE_RATE).toFixed(2);
  const motorista = +(total - taxa).toFixed(2);
  return { total: +total.toFixed(2), taxa, motorista, distancia: distance };
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

// --- RIDES ---

app.post('/api/rides/estimate', (req, res) => {
  const { origem, destino } = req.body;
  if (!origem || !destino) {
    return res.status(400).json({ error: 'Informe origem e destino.' });
  }
  const fare = calculateFare(origem, destino);
  res.json({
    ...fare,
    economia: +(fare.total * 0.2).toFixed(2),
    taxaPercentual: 5
  });
});

app.post('/api/rides', authMiddleware, (req, res) => {
  if (req.user.tipo !== 'passageiro') {
    return res.status(403).json({ error: 'Apenas passageiros podem solicitar corridas.' });
  }
  const { origem, destino } = req.body;
  if (!origem || !destino) {
    return res.status(400).json({ error: 'Informe origem e destino.' });
  }
  const fare = calculateFare(origem, destino);
  const rides = readJSON(RIDES_FILE);
  const ride = {
    id: uuidv4(),
    passageiroId: req.user.id,
    passageiroNome: req.user.nome,
    motoristaId: null,
    motoristaNome: null,
    origem, destino,
    ...fare,
    status: 'aguardando',
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString()
  };
  rides.push(ride);
  writeJSON(RIDES_FILE, rides);
  res.status(201).json({ message: 'Corrida solicitada!', ride });
});

app.get('/api/rides', authMiddleware, (req, res) => {
  const rides = readJSON(RIDES_FILE);
  let filtered;
  if (req.user.tipo === 'passageiro') {
    filtered = rides.filter(r => r.passageiroId === req.user.id);
  } else {
    filtered = rides.filter(r =>
      r.motoristaId === req.user.id ||
      (r.status === 'aguardando' && !r.motoristaId)
    );
  }
  filtered.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
  res.json({ rides: filtered });
});

app.patch('/api/rides/:id/accept', authMiddleware, (req, res) => {
  if (req.user.tipo !== 'motorista') {
    return res.status(403).json({ error: 'Apenas motoristas podem aceitar corridas.' });
  }
  const rides = readJSON(RIDES_FILE);
  const ride = rides.find(r => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Corrida não encontrada.' });
  if (ride.status !== 'aguardando') {
    return res.status(400).json({ error: 'Esta corrida não está mais disponível.' });
  }
  ride.motoristaId = req.user.id;
  ride.motoristaNome = req.user.nome;
  ride.status = 'aceita';
  ride.atualizadoEm = new Date().toISOString();
  writeJSON(RIDES_FILE, rides);
  res.json({ message: 'Corrida aceita!', ride });
});

app.patch('/api/rides/:id/start', authMiddleware, (req, res) => {
  const rides = readJSON(RIDES_FILE);
  const ride = rides.find(r => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Corrida não encontrada.' });
  if (ride.motoristaId !== req.user.id) {
    return res.status(403).json({ error: 'Sem permissão.' });
  }
  ride.status = 'em_andamento';
  ride.atualizadoEm = new Date().toISOString();
  writeJSON(RIDES_FILE, rides);
  res.json({ message: 'Corrida iniciada!', ride });
});

app.patch('/api/rides/:id/complete', authMiddleware, (req, res) => {
  const rides = readJSON(RIDES_FILE);
  const ride = rides.find(r => r.id === req.params.id);
  if (!ride) return res.status(404).json({ error: 'Corrida não encontrada.' });
  if (ride.motoristaId !== req.user.id && ride.passageiroId !== req.user.id) {
    return res.status(403).json({ error: 'Sem permissão.' });
  }
  ride.status = 'concluida';
  ride.avaliacao = req.body.avaliacao || null;
  ride.atualizadoEm = new Date().toISOString();
  writeJSON(RIDES_FILE, rides);
  res.json({ message: 'Corrida concluída!', ride });
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
  res.json({ message: 'Corrida cancelada.', ride });
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
