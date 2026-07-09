/**
 * Redireciona Live Server / portas locais para o app Node em :3000
 * (necessário para QR Code, API e PWA).
 */
(function () {
  var host = location.hostname;
  var port = location.port;
  var isLocal = host === 'localhost' || host === '127.0.0.1';
  if (isLocal && port && port !== '3000') {
    location.replace('http://localhost:3000' + location.pathname + location.search + location.hash);
  }
})();
