# Central de Chamados — Corghi Brasil (Fase 1)

Sistema de gestão de chamados técnicos, orçamentos, RME/instalações, agenda de visitas,
pintura e tarefas, com backend + banco de dados real e login individual por usuário.
Baseado em `especificacao_sistema_corghi.md`.

## Stack

- **Backend**: Node.js + Express + Prisma
- **Banco de dados**: PostgreSQL
- **Autenticação**: JWT em cookie httpOnly (sessão de 8h), senha com hash bcrypt
- **Frontend**: HTML/CSS/JS simples (adaptado do protótipo), consumindo a API

## 1. Banco de dados

Você precisa de uma string de conexão PostgreSQL. Caminho mais rápido: um banco gerenciado
gratuito.

**Opção Neon** (https://neon.tech): crie uma conta, crie um projeto, copie a "Connection
string" (algo como `postgresql://usuario:senha@ep-xxxx.neon.tech/neondb?sslmode=require`).

**Opção Supabase** (https://supabase.com): crie um projeto, vá em Project Settings → Database
→ Connection string (modo "URI").

Cole a string em `backend/.env`, na variável `DATABASE_URL` (copie `backend/.env.example`
para `backend/.env` primeiro).

## 2. Instalar e rodar

```bash
cd backend
npm install
npx prisma migrate dev --name init
npm run seed
npm run dev
```

Isso sobe a API em `http://localhost:3000`. O `seed` cria 3 usuários iniciais:

| E-mail | Senha provisória | Papel |
|---|---|---|
| admin@corghi.local | TrocarSenha123! | ADMIN |
| felipe@corghi.local | TrocarSenha123! | TECNICO |
| israel@corghi.local | TrocarSenha123! | TECNICO |

**Troque essas senhas e e-mails antes de usar em produção** (edite `backend/prisma/seed.js`
ou use a rota `/api/usuarios` como Admin para criar os usuários reais e desativar estes).

## 3. Frontend

O frontend é estático (`frontend/index.html`). Para rodar localmente, sirva a pasta com
qualquer servidor estático, por exemplo:

```bash
npx serve frontend
```

Se a API não estiver em `http://localhost:3000/api`, defina antes de carregar `app.js`:

```html
<script>window.API_BASE_URL = 'https://sua-api.exemplo.com/api';</script>
```

## 4. O que já está implementado (Fase 1)

- Login individual com sessão própria (cookie httpOnly), sem senha em texto puro em lugar nenhum.
- Papéis Admin / Técnico com regras de acesso (técnico só edita as próprias tarefas).
- Chamados: CRUD completo, numeração automática `AAAA/NNN` (gerada de forma atômica no banco,
  segura para múltiplos usuários simultâneos), regras de situação/orçamento automáticas.
- RME/Montagem: CRUD com status derivado (sem retorno → aguardando instalação → concluído).
- Lookup de Número de Série → NF/Cliente/Modelo (tabela `SerieReferencia`, a popular).
- Tarefas: Admin atribui, técnico vê e conclui as suas.
- Agenda de visitas (Showroom/Campo) e fila de pintura.
- Dashboard com KPIs e gráficos (Chart.js).
- Cadastro de usuários pelo Admin (criar, ativar/desativar, resetar senha).
- "Modo TV" (esconde nav e amplia KPIs).

## 5. O que ainda falta portar do protótipo (próxima iteração)

- Geração do Relatório de Serviço para impressão/assinatura (layout papel Corghi).
- Exportação `.xlsx` (chamados, RME, relatório mensal com abas).
- Relatório mensal com filtro por mês de referência.
- Atualização em tempo real (polling/WebSocket) para o Modo TV.
- Deploy (Render/Railway/Fly.io) e domínio.

## 6. Migração dos dados reais (concluída)

Os 560 chamados e 122 RME das planilhas de rede (`ORDEM DE SERVIÇO 2026.xlsx` e
`PLANILHA AREA TECNICA.xlsx`) já foram importados para o banco local com
`backend/scripts/importar-legado.js`:

```bash
cd backend
npm run migrar-legado              # dry-run — só mostra o relatório, não grava nada
npm run migrar-legado -- --commit  # grava de verdade (apaga dados existentes antes)
```

O script mapeia texto livre do legado para os enums do sistema novo (situação, categoria de
equipamento) e ajusta o contador de numeração automática para continuar a partir do maior
número importado. Pontos que exigiram decisão/normalização, para referência futura:

- Situação "ORÇAMENTO" no legado não tinha sub-etapa registrada → todos os orçamentos
  importados entraram como `ENVIADO`.
- 3 chamados com categoria de equipamento fora do padrão (`CUBO`, `PARTNER70`,
  `ESPEÇÃO VEIC.`) foram marcados como `OUTROS`, com a categoria original preservada em nota.
- 1 chamado sem cliente informado no legado (`2026/254`) entrou com um marcador
  `(NÃO INFORMADO NO LEGADO)` — revisar manualmente.
- 1 número duplicado no legado (`2026/448`, dois chamados diferentes) — o segundo foi
  renumerado automaticamente para não colidir.

Se precisar reimportar (ex.: planilha atualizada), rode `--commit` de novo — o script apaga
os chamados/RME existentes antes de gravar (usuários não são afetados).

## 7. Estrutura

```
backend/          API Express + Prisma
  prisma/schema.prisma   modelo de dados
  prisma/seed.js         usuários iniciais
  scripts/importar-legado.js  importação das planilhas de rede
  src/routes/            um arquivo por módulo (chamados, rme, tarefas, agenda, pintura, usuarios)
frontend/         SPA estática (index.html + css/ + js/)
```
