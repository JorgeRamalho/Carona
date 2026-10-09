# Carona — documentação do projeto

App de mobilidade web (PWA) com landing, cadastro, painéis de passageiro/motorista e API Node/Express.

## Início rápido

1. Copie as variáveis de ambiente:
   ```bash
   cp config/.env.example .env
   ```
2. Instale dependências na raiz do repositório:
   ```bash
   npm install
   ```
3. Inicie o servidor (porta 3000):
   ```bash
   npm start
   ```
4. Abra [http://localhost:3000](http://localhost:3000).

> Use sempre `npm start` (servidor Node). Live Server em outra porta redireciona para `:3000` para API, QR Code e PWA funcionarem.

## Estrutura

A organização de pastas e o papel de cada arquivo estão descritos em [ESTRUTURA.md](./ESTRUTURA.md).

## Raiz do repositório

Na raiz ficam apenas:

| Item | Motivo |
|------|--------|
| `index.html` | Entrada pública do site (landing) |
| `package.json` / `package-lock.json` | Ferramentas Node e dependências |
| `.gitignore` | Regras do Git |

Arquivos ocultos de ambiente (`.env`) não são versionados; o modelo está em `config/.env.example`.
