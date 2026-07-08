function getApiBase() {
  const { protocol, hostname, port } = window.location;

  if (protocol === 'file:') {
    return 'http://localhost:3000';
  }

  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  const isNodeServer = port === '3000' || (isLocal && port === '');

  if (isLocal && !isNodeServer) {
    return 'http://localhost:3000';
  }

  return '';
}

const API_BASE = getApiBase();

function resolveAppUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const origin = API_BASE || window.location.origin;
  return `${origin}${path}`;
}

function getRequestError(res, data) {
  if (data.error) return data.error;
  if (res.status === 404 || res.status === 405) {
    return 'Servidor da API não encontrado. Execute "npm start" e acesse http://localhost:3000';
  }
  if (res.status === 409) {
    return 'Este e-mail já está cadastrado. Faça login ou use outro e-mail.';
  }
  return `Não foi possível completar a operação (código ${res.status}). Verifique se o servidor está rodando com "npm start".`;
}

const api = {
  getBase() {
    return API_BASE || window.location.origin;
  },

  resolveUrl(path) {
    return resolveAppUrl(path);
  },
  async request(endpoint, options = {}) {
    const token = localStorage.getItem('carona_token');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    } catch {
      throw new Error(
        'Não foi possível conectar ao servidor. Execute "npm start" na pasta do projeto e acesse http://localhost:3000'
      );
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(getRequestError(res, data));
    return data;
  },

  registerPassageiro(body) {
    return this.request('/api/auth/register/passageiro', { method: 'POST', body: JSON.stringify(body) });
  },

  registerMotorista(body) {
    return this.request('/api/auth/register/motorista', { method: 'POST', body: JSON.stringify(body) });
  },

  login(email, senha) {
    return this.request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, senha }) });
  },

  forgotPassword(email) {
    return this.request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
  },

  resetPassword(token, senha) {
    return this.request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, senha }) });
  },

  getMe() {
    return this.request('/api/auth/me');
  },

  updateProfile(email, telefone, cidade) {
    return this.request('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ email, telefone, cidade })
    });
  },

  estimateRide(origem, destino) {
    return this.request('/api/rides/estimate', { method: 'POST', body: JSON.stringify({ origem, destino }) });
  },

  createRide(origem, destino, pagamento) {
    return this.request('/api/rides', {
      method: 'POST',
      body: JSON.stringify({ origem, destino, pagamento })
    });
  },

  getRides() {
    return this.request('/api/rides');
  },

  acceptRide(id) {
    return this.request(`/api/rides/${id}/accept`, { method: 'PATCH' });
  },

  startRide(id) {
    return this.request(`/api/rides/${id}/start`, { method: 'PATCH' });
  },

  completeRide(id, avaliacaoPassageiro) {
    return this.request(`/api/rides/${id}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({ avaliacaoPassageiro })
    });
  },

  rateRide(id, avaliacao) {
    return this.request(`/api/rides/${id}/rate`, {
      method: 'PATCH',
      body: JSON.stringify({ avaliacao })
    });
  },

  cancelRide(id) {
    return this.request(`/api/rides/${id}/cancel`, { method: 'PATCH' });
  },

  setDriverStatus(online) {
    return this.request('/api/driver/status', { method: 'PATCH', body: JSON.stringify({ online }) });
  },

  getStats() {
    return this.request('/api/stats');
  },

  getMapsConfig() {
    return this.request('/api/maps/config');
  }
};

window.api = api;
