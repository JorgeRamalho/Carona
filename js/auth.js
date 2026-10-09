const auth = {
  saveSession(token, user) {
    localStorage.setItem('carona_token', token);
    localStorage.setItem('carona_user', JSON.stringify(user));
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem('carona_user'));
    } catch {
      return null;
    }
  },

  getToken() {
    return localStorage.getItem('carona_token');
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  getModoAtivo(user = this.getUser()) {
    if (!user) return 'passageiro';
    return user.modoAtivo || user.tipo || 'passageiro';
  },

  hasDriverProfile(user = this.getUser()) {
    if (!user) return false;
    const v = user.veiculo || {};
    return Boolean(user.cnh && v.modelo && v.placa);
  },

  isMotorista(user = this.getUser()) {
    return this.getModoAtivo(user) === 'motorista';
  },

  isPassageiro(user = this.getUser()) {
    return this.getModoAtivo(user) === 'passageiro';
  },

  /** Atualiza carona_user com dados do servidor (tipo, online, etc.). */
  async syncSessionFromServer() {
    if (!this.getToken()) return null;
    try {
      const { user } = await api.getMe();
      if (!user) return null;
      this.saveSession(this.getToken(), user);
      return user;
    } catch {
      return null;
    }
  },

  updateHeaderForLoggedUser() {
    const nav = document.getElementById('nav');
    const user = this.getUser();
    if (!nav || !user) return;

    const dashboardUrl = this.getModoAtivo(user) === 'motorista'
      ? '/motorista.html#corridas'
      : '/passageiro.html#solicitar';
    const loginBtn = nav.querySelector('.btn-nav-login');
    if (!loginBtn) return;

    loginBtn.href = dashboardUrl;
    loginBtn.textContent = 'Meu painel';
    loginBtn.classList.remove('btn-secondary');
    loginBtn.classList.add('btn-nav');
  },

  logout() {
    localStorage.removeItem('carona_token');
    localStorage.removeItem('carona_user');
    window.location.href = '/login.html';
  },

  requireLogin(options = {}) {
    const { redirect = true } = options;
    if (this.isLoggedIn()) return true;
    if (redirect) {
      const next = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
      window.location.href = `/login.html?redirect=${next}`;
    }
    return false;
  },

  /** @deprecated Use requireLogin + modo no servidor */
  requireAuth(tipo, options = {}) {
    if (!this.requireLogin(options)) return false;
    const user = this.getUser();
    if (tipo === 'motorista' && this.getModoAtivo(user) !== 'motorista') {
      if (options.redirect !== false) window.location.href = '/motorista.html';
      return false;
    }
    if (tipo === 'passageiro' && this.getModoAtivo(user) !== 'passageiro') {
      if (options.redirect !== false) window.location.href = '/passageiro.html';
      return false;
    }
    return true;
  },

  async switchModo(modo) {
    const { user } = await api.setModoAtivo(modo);
    this.saveSession(this.getToken(), user);
    return user;
  },

  redirectAfterLogin(fallback) {
    const params = new URLSearchParams(window.location.search);
    const target = params.get('redirect');
    if (target && target.startsWith('/') && !target.startsWith('//')) {
      window.location.href = target;
      return;
    }
    if (fallback) {
      window.location.href = fallback;
      return;
    }
    this.redirectByRole();
  },

  redirectByRole() {
    const user = this.getUser();
    if (!user) return (window.location.href = '/login.html');
    window.location.href = this.getModoAtivo(user) === 'motorista'
      ? '/motorista.html#corridas'
      : '/passageiro.html#solicitar';
  }
};

window.auth = auth;
