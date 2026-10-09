# Estrutura de pastas — Projeto Carona

Padrão adotado: **raiz enxuta**, recursos agrupados por responsabilidade e URLs públicas estáveis (`/login.html`, `/css/...`, `/js/...`).

## Visão geral

```
Projeto-Carona/
├── index.html              # Única página HTML na raiz (landing)
├── package.json            # Scripts npm e dependências do servidor
├── package-lock.json
├── .gitignore
│
├── assets/                 # Imagens e ícones estáticos
├── css/                    # Folhas de estilo globais e por contexto
├── js/                     # Cliente (front) + servidor Express + service worker
├── pages/                  # Demais telas HTML (URLs amigáveis via servidor)
├── config/                 # Manifest PWA e modelo de ambiente
├── public/                 # Arquivos públicos servidos na raiz da URL (SEO)
├── data/                   # Persistência local JSON (runtime, gitignored parcial)
└── docs/                   # Documentação do projeto
```

## Raiz

| Arquivo | Descrição |
|---------|-----------|
| `index.html` | Landing: cadastro, SEO, PWA, scripts `/js/landing.js` e demais |

## `assets/`

| Arquivo | Descrição |
|---------|-----------|
| `logo.svg` | Logo / favicon SVG |
| `icon-192.png` | Ícone PWA 192×192 |
| `icon-512.png` | Ícone PWA 512×512 e Open Graph |

## `css/`

| Arquivo | Descrição |
|---------|-----------|
| `style.css` | Estilos principais da landing e componentes |
| `accessibility.css` | Modo de acessibilidade e skip links |
| `dashboard.css` | Painéis passageiro/motorista e áreas de app |

## `js/`

### Servidor e PWA

| Arquivo | Descrição |
|---------|-----------|
| `server.js` | API REST, autenticação, corridas, arquivos estáticos e rotas HTML |
| `sw.js` | Service Worker (cache offline, precache) |

### Cliente — núcleo

| Arquivo | Descrição |
|---------|-----------|
| `api.js` | Cliente HTTP para `/api/*` |
| `auth.js` | Token JWT e sessão no `localStorage` |
| `utils.js` | Formatação, validações e helpers compartilhados |
| `maps.js` | Integração Google Maps / rotas |
| `pwa.js` | Registro do SW e prompt de instalação |
| `accessibility.js` | Preferências de acessibilidade na UI |
| `goto-app-server.js` | Redireciona Live Server → `:3000` |

### Cliente — por página

| Arquivo | Descrição |
|---------|-----------|
| `landing.js` | Comportamento da `index.html` |
| `login.js` | `pages/login.html` |
| `esqueci-senha.js` | `pages/esqueci-senha.html` |
| `redefinir-senha.js` | `pages/redefinir-senha.html` |
| `passageiro.js` | `pages/passageiro.html` |
| `motorista.js` | `pages/motorista.html` |
| `profile.js` | Edição de perfil (compartilhado nos painéis) |

## `pages/`

Telas servidas com URL na raiz do site (alias no `server.js`).

| Arquivo | URL pública |
|---------|-------------|
| `login.html` | `/login.html` |
| `passageiro.html` | `/passageiro.html` |
| `motorista.html` | `/motorista.html` |
| `instalar.html` | `/instalar.html` |
| `esqueci-senha.html` | `/esqueci-senha.html` |
| `redefinir-senha.html` | `/redefinir-senha.html` |
| `termos.html` | `/termos.html` |
| `privacidade.html` | `/privacidade.html` |
| `offline.html` | `/offline.html` |
| `formulario.html` | `/formulario.html` |

## `config/`

| Arquivo | Descrição |
|---------|-----------|
| `manifest.webmanifest` | Manifest PWA (servido em `/manifest.webmanifest`) |
| `.env.example` | Modelo de variáveis; copiar para `.env` na raiz |

## `public/`

Arquivos expostos na **raiz da URL** pelo servidor (não ficam fisicamente na raiz do repo).

| Arquivo | URL |
|---------|-----|
| `robots.txt` | `/robots.txt` |
| `sitemap.xml` | `/sitemap.xml` |

## `data/`

| Arquivo | Descrição |
|---------|-----------|
| `.gitkeep` | Mantém a pasta no Git |
| `users.json` | Usuários (gerado em runtime, ignorado pelo Git) |
| `rides.json` | Corridas (gerado em runtime, ignorado pelo Git) |

## `docs/`

| Arquivo | Descrição |
|---------|-----------|
| `README.md` | Visão geral e início rápido |
| `ESTRUTURA.md` | Este documento |

## Convenções

1. **Novo HTML de app**: criar em `pages/` e registrar alias em `PAGE_ALIASES` em `js/server.js`.
2. **Novo script de página**: colocar em `js/` com nome alinhado à página e referenciar no HTML.
3. **SEO / arquivos na URL raiz**: colocar em `public/` e adicionar rota GET em `server.js` se necessário.
4. **Configuração**: manifest e exemplos em `config/`; segredos apenas em `.env` na raiz (não versionado).
