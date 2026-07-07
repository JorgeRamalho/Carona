const API_BASE = '';

const api = {
  async request(endpoint, options = {}) {
    const token = localStorage.getItem('carona_token');
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(data.error || 'Erro na requisição.');
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

  createRide(origem, destino) {
    return this.request('/api/rides', { method: 'POST', body: JSON.stringify({ origem, destino }) });
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

  completeRide(id, avaliacao) {
    return this.request(`/api/rides/${id}/complete`, { method: 'PATCH', body: JSON.stringify({ avaliacao }) });
  },

  cancelRide(id) {
    return this.request(`/api/rides/${id}/cancel`, { method: 'PATCH' });
  },

  setDriverStatus(online) {
    return this.request('/api/driver/status', { method: 'PATCH', body: JSON.stringify({ online }) });
  },

  getStats() {
    return this.request('/api/stats');
  }
};

window.api = api;
