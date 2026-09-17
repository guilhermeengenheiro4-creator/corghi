const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth.routes');
const chamadosRoutes = require('./routes/chamados.routes');
const rmeRoutes = require('./routes/rme.routes');
const tarefasRoutes = require('./routes/tarefas.routes');
const agendaRoutes = require('./routes/agenda.routes');
const pinturaRoutes = require('./routes/pintura.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const seriesRoutes = require('./routes/series.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const producaoRoutes = require('./routes/producao.routes');
const visitasTecnicasRoutes = require('./routes/visitasTecnicas.routes');

const app = express();

// Em produção o frontend é servido pelo mesmo domínio (sem CORS necessário). Em dev local
// o frontend roda numa porta separada (5173) — FRONTEND_ORIGIN cobre esse caso.
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/chamados', chamadosRoutes);
app.use('/api/rme', rmeRoutes);
app.use('/api/tarefas', tarefasRoutes);
app.use('/api/agenda', agendaRoutes);
app.use('/api/pintura', pinturaRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/series', seriesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/producao', producaoRoutes);
app.use('/api/visitas-tecnicas', visitasTecnicasRoutes);

// Serve o frontend estático a partir do mesmo servidor/domínio da API — evita CORS e
// cookies cross-site em produção, e dá uma única URL para o sistema inteiro.
const frontendDir = path.join(__dirname, '../../frontend');
app.use(express.static(frontendDir));
app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(frontendDir, 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

module.exports = app;
