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

  logout() {
    localStorage.removeItem('carona_token');
    localStorage.removeItem('carona_user');
    window.location.href = '/login.html';
  },

  requireAuth(tipo) {
    if (!this.isLoggedIn()) {
      window.location.href = '/login.html';
      return false;
    }
    const user = this.getUser();
    if (tipo && user?.tipo !== tipo) {
      window.location.href = user?.tipo === 'motorista' ? '/motorista.html' : '/passageiro.html';
      return false;
    }
    return true;
  },

  redirectByRole() {
    const user = this.getUser();
    if (!user) return (window.location.href = '/login.html');
    window.location.href = user.tipo === 'motorista'
      ? '/motorista.html#corridas'
      : '/passageiro.html#solicitar';
  }
};

window.auth = auth;
