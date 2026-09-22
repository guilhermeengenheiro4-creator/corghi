let currentUser = null;
let currentView = 'dashboard';
let usuariosCache = [];
let chartEquip = null;
let chartSituacao = null;
let chartChamMes = null;
let chartChamEquip = null;
let chartChamResp = null;
let chartTvEquip = null;
let chartTvSituacao = null;
let tvIntervaloSlide = null;
let tvIntervaloDados = null;

const EQUIPAMENTOS = ['ALINHADORA', 'BALANCEADORA', 'DESMONTADORA', 'RAMPA', 'ELEVADOR', 'RECICLADORA', 'RETIFICADORA', 'OUTROS'];
const SITUACOES = ['ABERTO', 'ORCAMENTO', 'SEM_RETORNO', 'OUTROS', 'DEVENDO', 'RESOLVIDO'];
const ORCAMENTO_STATUS = ['A_MONTAR', 'ENVIADO', 'APROVADO', 'REPROVADO', 'CANCELADO'];
const EQUIPAMENTOS_RME = [
  'BALANCEADORA', 'BALANCEADORA LINHA PESADA', 'BLACK TECH', 'DESMONTADORA',
  'DESMONTADORA LINHA PESADA', 'ELEVADOR ELETRO HIDRAULICO', 'ELEVADOR PANTOGRAFICO',
  'EXACT 70', 'EXACT LINEAR', 'PARTNER 70', 'RAMPA', 'RAMPA PANTOGRAFICO',
  'RECICLADORA DE AR', 'RETIFICADORA',
];

function badge(valor) {
  if (!valor) return '';
  const cls = 'b-' + valor.toLowerCase();
  return `<span class="badge ${cls}">${valor.replace(/_/g, ' ')}</span>`;
}

// Datas são armazenadas como "dia calendário" (meia-noite UTC); usamos os componentes UTC
// para exibir, senão o fuso do navegador pode "voltar" um dia.
function fmtData(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const dia = String(d.getUTCDate()).padStart(2, '0');
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${d.getUTCFullYear()}`;
}

function fmtMoeda(valor) {
  const n = Number(valor) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function diasEmAberto(dataAbertura) {
  const abertura = new Date(dataAbertura);
  const hojeUTC = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const aberturaUTC = Date.UTC(abertura.getUTCFullYear(), abertura.getUTCMonth(), abertura.getUTCDate());
  return Math.max(0, Math.round((hojeUTC - aberturaUTC) / 86400000));
}

const PRAZO_ORCAMENTO_DIAS = 7;

// Orçamentos da Corghi têm prazo de 7 dias corridos a partir do envio ao cliente.
function prazoOrcamentoHtml(dataEnvioOrcamento, orcamentoStatus) {
  if (!dataEnvioOrcamento) return '<span style="color:var(--text-faint);">não enviado</span>';

  if (['APROVADO', 'REPROVADO', 'CANCELADO'].includes(orcamentoStatus)) {
    return '<span class="badge b-resolvido">decidido</span>';
  }

  const envio = new Date(dataEnvioOrcamento);
  const envioUTC = Date.UTC(envio.getUTCFullYear(), envio.getUTCMonth(), envio.getUTCDate());
  const vencimentoUTC = envioUTC + PRAZO_ORCAMENTO_DIAS * 86400000;
  const hoje = new Date();
  const hojeUTC = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  const diasRestantes = Math.round((vencimentoUTC - hojeUTC) / 86400000);

  if (diasRestantes < 0) return `<span class="badge b-aberto">vencido há ${-diasRestantes}d</span>`;
  if (diasRestantes === 0) return '<span class="badge b-orcamento">vence hoje</span>';
  return `<span class="badge b-orcamento">${diasRestantes}d restantes</span>`;
}

function toast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; }, 2200);
  setTimeout(() => el.remove(), 2600);
}

// ---------- MODAL (substitui prompt()/confirm() nativos, que não funcionam em todo contexto) ----------

function abrirModal({ titulo, mensagem, campoTexto = false, valorInicial = '', textoConfirmar = 'Confirmar' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:1000;';
    overlay.innerHTML = `
      <div class="formPanel" style="width:360px;max-width:90vw;">
        <h3 style="margin:0 0 10px;font-size:15px;">${titulo}</h3>
        ${mensagem ? `<p style="color:var(--text-dim);font-size:13px;margin:0 0 12px;">${mensagem}</p>` : ''}
        ${campoTexto ? `<input type="text" id="modalInput" style="width:100%;margin-bottom:14px;" value="${valorInicial}">` : ''}
        <div class="formActions">
          <button class="ghostBtn" id="modalCancelar">Cancelar</button>
          <button class="primaryBtn" id="modalConfirmar">${textoConfirmar}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#modalInput');
    if (input) input.focus();

    const fechar = (valor) => { overlay.remove(); resolve(valor); };
    overlay.querySelector('#modalCancelar').addEventListener('click', () => fechar(null));
    overlay.querySelector('#modalConfirmar').addEventListener('click', () => fechar(input ? input.value : true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(null); });
  });
}

function pedirTexto(titulo, mensagem, valorInicial = '') {
  return abrirModal({ titulo, mensagem, campoTexto: true, valorInicial });
}

function pedirConfirmacao(titulo, mensagem) {
  return abrirModal({ titulo, mensagem, textoConfirmar: 'Sim, confirmar' });
}

// ---------- AUTH ----------

async function tentarSessao() {
  try {
    currentUser = await api.get('/auth/me');
    mostrarApp();
  } catch {
    mostrarLogin();
  }
}

function mostrarLogin() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function mostrarApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  if (currentUser.papel === 'TV') {
    iniciarModoTvKiosk();
    return;
  }

  document.getElementById('userNome').textContent = currentUser.nome;
  document.getElementById('navUsuarios').classList.toggle('hidden', currentUser.papel !== 'ADMIN');
  irParaView('dashboard');
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const senha = document.getElementById('loginSenha').value;
  const erroEl = document.getElementById('loginError');
  erroEl.textContent = '';
  try {
    currentUser = await api.post('/auth/login', { email, senha });
    mostrarApp();
  } catch (err) {
    erroEl.textContent = err.message || 'Falha ao entrar.';
  }
});

document.getElementById('btnLogout').addEventListener('click', async () => {
  await api.post('/auth/logout').catch(() => null);
  currentUser = null;
  mostrarLogin();
});

document.getElementById('btnTv').addEventListener('click', () => {
  document.body.classList.toggle('tv');
});

// ---------- NAV / ROUTER ----------

document.getElementById('mainNav').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-view]');
  if (!btn) return;
  irParaView(btn.dataset.view);
});

function irParaView(view) {
  currentView = view;
  document.querySelectorAll('#mainNav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  const renderers = {
    dashboard: renderDashboard,
    chamados: renderChamados,
    orcamentos: renderOrcamentos,
    rme: renderRme,
    tarefas: renderTarefas,
    agenda: renderAgenda,
    pintura: renderPintura,
    producao: renderProducao,
    visitasTecnicas: renderVisitasTecnicas,
    usuarios: renderUsuarios,
  };
  (renderers[view] || renderDashboard)();
}

// ---------- DASHBOARD ----------

async function renderDashboard() {
  const main = document.getElementById('mainContent');
  main.innerHTML = '<p class="sectionLabel">Carregando…</p>';

  let kpis, agenda, chamadosAbertos, pintura;
  try {
    [kpis, agenda, chamadosAbertos, pintura] = await Promise.all([
      api.get('/dashboard/kpis'),
      api.get('/agenda'),
      api.get('/chamados?situacao=ABERTO&pageSize=200'),
      api.get('/pintura'),
    ]);
  } catch (err) {
    main.innerHTML = `<p>Erro ao carregar dashboard: ${err.message}</p>`;
    return;
  }

  const porSituacaoMap = Object.fromEntries(kpis.porSituacao.map((s) => [s.situacao, s._count]));
  const visitasShowroom = agenda.filter((v) => v.tipo === 'SHOWROOM');
  const visitasCampo = agenda.filter((v) => v.tipo === 'CAMPO');
  const abertos = chamadosAbertos.itens;
  const aguardandoPintura = pintura.filter((p) => p.status === 'AGUARDANDO');

  const linhaVisita = (v) => `
    <tr><td>${fmtData(v.data)}</td><td>${v.hora || '—'}</td><td>${v.representante || '—'}</td><td>${v.responsavel || '—'}</td><td>${v.linha || '—'}</td></tr>
  `;
  const linhaPintura = (p) => `
    <tr><td>${p.equipamento}</td><td>${p.serie || '—'}</td><td>${p.cliente || '—'}</td></tr>
  `;
  const linhaChamado = (c) => `
    <tr><td class="num">${c.numero}</td><td>${fmtData(c.data)}</td><td>${c.cliente}</td><td>${c.equipamentoCategoria}</td><td>${(c.assunto || '').slice(0, 40)}</td><td class="num">${diasEmAberto(c.data)}</td></tr>
  `;

  main.innerHTML = `
    <p class="sectionLabel">Visão geral</p>
    <div class="kpiRow">
      <div class="kpi" style="--accent:var(--red)"><div class="val num">${kpis.abertosNoAno}</div><div class="lbl">Chamados abertos no ano</div></div>
      <div class="kpi" style="--accent:var(--amber)"><div class="val num">${kpis.abertosNoMes}</div><div class="lbl">Chamados abertos no mês</div></div>
      <div class="kpi" style="--accent:var(--blue)"><div class="val num">${kpis.abertos}</div><div class="lbl">Chamados em aberto</div></div>
    </div>
    <div class="chartsRow">
      <div class="panel"><h3>Chamados por equipamento</h3><div class="chartWrap"><canvas id="chartEquip"></canvas></div></div>
      <div class="panel"><h3>Chamados por situação</h3><div class="chartWrap"><canvas id="chartSituacao"></canvas></div></div>
    </div>

    <p class="sectionLabel">Chamados em aberto (${abertos.length})</p>
    <div class="listPanel" style="max-height:320px;overflow-y:auto;">
      <table><thead><tr><th>Número</th><th>Data</th><th>Cliente</th><th>Equipamento</th><th>Assunto</th><th>Dias em aberto</th></tr></thead>
        <tbody>${abertos.map(linhaChamado).join('') || '<tr><td colspan="6">Nenhum chamado em aberto.</td></tr>'}</tbody>
      </table>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
      <div>
        <p class="sectionLabel">Visitas Showroom (${visitasShowroom.length})</p>
        <div class="listPanel" style="max-height:280px;overflow-y:auto;">
          <table><thead><tr><th>Data</th><th>Hora</th><th>Repres.</th><th>Respons.</th><th>Linha</th></tr></thead>
            <tbody>${visitasShowroom.map(linhaVisita).join('') || '<tr><td colspan="5">Nenhuma visita agendada.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
      <div>
        <p class="sectionLabel">Visitas em Campo (${visitasCampo.length})</p>
        <div class="listPanel" style="max-height:280px;overflow-y:auto;">
          <table><thead><tr><th>Data</th><th>Hora</th><th>Repres.</th><th>Respons.</th><th>Linha</th></tr></thead>
            <tbody>${visitasCampo.map(linhaVisita).join('') || '<tr><td colspan="5">Nenhuma visita agendada.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
      <div>
        <p class="sectionLabel">Aguardando pintura (${aguardandoPintura.length})</p>
        <div class="listPanel" style="max-height:280px;overflow-y:auto;">
          <table><thead><tr><th>Equipamento</th><th>Série</th><th>Cliente</th></tr></thead>
            <tbody>${aguardandoPintura.map(linhaPintura).join('') || '<tr><td colspan="3">Fila de pintura vazia.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const ctxEquip = document.getElementById('chartEquip');
  const ctxSit = document.getElementById('chartSituacao');
  if (chartEquip) chartEquip.destroy();
  if (chartSituacao) chartSituacao.destroy();

  chartEquip = new Chart(ctxEquip, {
    type: 'bar',
    data: {
      labels: kpis.porEquipamento.map((e) => e.equipamentoCategoria),
      datasets: [{ data: kpis.porEquipamento.map((e) => e._count), backgroundColor: '#5b8fd6' }],
    },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  });

  chartSituacao = new Chart(ctxSit, {
    type: 'doughnut',
    data: {
      labels: kpis.porSituacao.map((s) => s.situacao),
      datasets: [{
        data: kpis.porSituacao.map((s) => s._count),
        backgroundColor: ['#e2564f', '#e8963a', '#5b8fd6', '#a682e0', '#3fb88f', '#8b96a8'],
        borderColor: '#1a1f27',
        borderWidth: 2,
      }],
    },
    options: {
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: { legend: { position: 'right', align: 'center', labels: { color: '#8b96a8', boxWidth: 12, padding: 14 } } },
    },
  });
}

// ---------- MODO TV (login dedicado, quiosque tela cheia, sem menu) ----------

const TV_SLIDES_MS = 15000;
const TV_DADOS_MS = 60000;
const TV_SLIDES = ['visaoGeral', 'chamadosAbertos', 'agenda', 'pintura', 'rmeSemRetorno'];

let tvSlideAtual = 0;
let tvDados = null;

async function iniciarModoTvKiosk() {
  document.body.classList.add('tv-kiosk');
  await tvAtualizarDados();
  tvSlideAtual = 0;
  tvRenderizarSlide();

  clearInterval(tvIntervaloSlide);
  tvIntervaloSlide = setInterval(() => {
    tvSlideAtual = (tvSlideAtual + 1) % TV_SLIDES.length;
    tvRenderizarSlide();
  }, TV_SLIDES_MS);

  clearInterval(tvIntervaloDados);
  tvIntervaloDados = setInterval(tvAtualizarDados, TV_DADOS_MS);
}

async function tvAtualizarDados() {
  try {
    const [kpis, chamadosAbertos, agenda, pintura, rme] = await Promise.all([
      api.get('/dashboard/kpis'),
      api.get('/chamados?situacao=ABERTO&pageSize=200'),
      api.get('/agenda'),
      api.get('/pintura'),
      api.get('/rme?status=SEM_RETORNO&pageSize=200'),
    ]);
    tvDados = { kpis, abertos: chamadosAbertos.itens, agenda, pintura, rmeSemRetorno: rme.itens, atualizadoEm: new Date() };
  } catch {
    // mantém os dados anteriores na tela se a atualização falhar (ex.: instabilidade de rede)
  }
}

function tvCabecalho(titulo) {
  const agora = new Date();
  const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const data = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  return `
    <div class="tvKioskHeader">
      <h1>${titulo}</h1>
      <div class="relogio">${hora}<span>${data}</span></div>
    </div>
  `;
}

function tvRodape() {
  return `
    <div class="tvDots">
      ${TV_SLIDES.map((_, i) => `<span class="${i === tvSlideAtual ? 'active' : ''}"></span>`).join('')}
    </div>
    <button class="tvSairBtn" id="btnTvSair">sair</button>
  `;
}

function tvRenderizarSlide() {
  const main = document.getElementById('mainContent');
  if (!tvDados) {
    main.innerHTML = '<div class="tvKiosk"><p class="tvSectionLabel">Carregando…</p></div>';
    return;
  }

  const slide = TV_SLIDES[tvSlideAtual];
  const conteudo = {
    visaoGeral: tvSlideVisaoGeral,
    chamadosAbertos: tvSlideChamadosAbertos,
    agenda: tvSlideAgenda,
    pintura: tvSlidePintura,
    rmeSemRetorno: tvSlideRmeSemRetorno,
  }[slide]();

  main.innerHTML = `<div class="tvKiosk">${conteudo}${tvRodape()}</div>`;

  document.getElementById('btnTvSair').addEventListener('click', async () => {
    clearInterval(tvIntervaloSlide);
    clearInterval(tvIntervaloDados);
    document.body.classList.remove('tv-kiosk');
    await api.post('/auth/logout').catch(() => null);
    currentUser = null;
    mostrarLogin();
  });

  if (slide === 'visaoGeral') tvMontarGraficos();
}

function tvSlideVisaoGeral() {
  const { kpis } = tvDados;
  const porSituacaoMap = Object.fromEntries(kpis.porSituacao.map((s) => [s.situacao, s._count]));
  return `
    ${tvCabecalho('Visão Geral')}
    <div class="tvKioskBody">
      <div class="tvKpiRow">
        <div class="kpi" style="--accent:var(--red)"><div class="val num">${kpis.abertosNoAno}</div><div class="lbl">Chamados abertos no ano</div></div>
        <div class="kpi" style="--accent:var(--amber)"><div class="val num">${kpis.abertosNoMes}</div><div class="lbl">Chamados abertos no mês</div></div>
        <div class="kpi" style="--accent:var(--blue)"><div class="val num">${kpis.abertos}</div><div class="lbl">Chamados em aberto</div></div>
      </div>
      <div class="tvChartsRow">
        <div class="panel"><h3>Chamados por equipamento</h3><div class="chartWrap"><canvas id="tvChartEquip"></canvas></div></div>
        <div class="panel"><h3>Chamados por situação</h3><div class="chartWrap"><canvas id="tvChartSituacao"></canvas></div></div>
      </div>
    </div>
  `;
}

function tvMontarGraficos() {
  const { kpis } = tvDados;
  if (chartTvEquip) chartTvEquip.destroy();
  if (chartTvSituacao) chartTvSituacao.destroy();

  chartTvEquip = new Chart(document.getElementById('tvChartEquip'), {
    type: 'bar',
    data: {
      labels: kpis.porEquipamento.map((e) => e.equipamentoCategoria),
      datasets: [{ data: kpis.porEquipamento.map((e) => e._count), backgroundColor: '#5b8fd6' }],
    },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { ticks: { font: { size: 13 } } } } },
  });

  chartTvSituacao = new Chart(document.getElementById('tvChartSituacao'), {
    type: 'doughnut',
    data: {
      labels: kpis.porSituacao.map((s) => s.situacao),
      datasets: [{
        data: kpis.porSituacao.map((s) => s._count),
        backgroundColor: ['#e2564f', '#e8963a', '#5b8fd6', '#a682e0', '#3fb88f', '#8b96a8'],
        borderColor: '#1a1f27',
        borderWidth: 2,
      }],
    },
    options: {
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: { legend: { position: 'right', labels: { color: '#8b96a8', boxWidth: 14, padding: 12, font: { size: 14 } } } },
    },
  });
}

function tvSlideChamadosAbertos() {
  const abertos = tvDados.abertos.slice(0, 12);
  const linhas = abertos.map((c) => `
    <tr><td class="num">${c.numero}</td><td>${fmtData(c.data)}</td><td>${c.cliente}</td><td>${c.equipamentoCategoria}</td><td>${(c.assunto || '').slice(0, 50)}</td><td class="num">${diasEmAberto(c.data)}</td></tr>
  `).join('') || '<tr><td colspan="6">Nenhum chamado em aberto.</td></tr>';
  const restantes = tvDados.abertos.length - abertos.length;

  return `
    ${tvCabecalho(`Chamados em Aberto (${tvDados.abertos.length})`)}
    <div class="tvKioskBody tvTable">
      <div class="listPanel" style="flex:1;overflow:hidden;">
        <table><thead><tr><th>Número</th><th>Data</th><th>Cliente</th><th>Equipamento</th><th>Assunto</th><th>Dias</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
      ${restantes > 0 ? `<p class="tvSectionLabel" style="margin-top:12px;">+ ${restantes} outros chamados em aberto</p>` : ''}
    </div>
  `;
}

function tvSlideAgenda() {
  const showroom = tvDados.agenda.filter((v) => v.tipo === 'SHOWROOM').slice(0, 8);
  const campo = tvDados.agenda.filter((v) => v.tipo === 'CAMPO').slice(0, 8);
  const linha = (v) => `<tr><td>${fmtData(v.data)}</td><td>${v.hora || '—'}</td><td>${v.representante || '—'}</td><td>${v.responsavel || '—'}</td></tr>`;

  return `
    ${tvCabecalho('Agenda de Visitas')}
    <div class="tvGrid2 tvTable">
      <div>
        <p class="tvSectionLabel">Showroom</p>
        <div class="listPanel"><table><thead><tr><th>Data</th><th>Hora</th><th>Repres.</th><th>Respons.</th></tr></thead>
          <tbody>${showroom.map(linha).join('') || '<tr><td colspan="4">Nenhuma visita agendada.</td></tr>'}</tbody>
        </table></div>
      </div>
      <div>
        <p class="tvSectionLabel">Campo</p>
        <div class="listPanel"><table><thead><tr><th>Data</th><th>Hora</th><th>Repres.</th><th>Respons.</th></tr></thead>
          <tbody>${campo.map(linha).join('') || '<tr><td colspan="4">Nenhuma visita agendada.</td></tr>'}</tbody>
        </table></div>
      </div>
    </div>
  `;
}

function tvSlidePintura() {
  const itens = tvDados.pintura.slice(0, 14);
  const linhas = itens.map((p) => `
    <tr><td>${p.equipamento}</td><td>${p.serie || '—'}</td><td>${p.cliente || '—'}</td><td>${badge(p.status)}</td></tr>
  `).join('') || '<tr><td colspan="4">Fila de pintura vazia.</td></tr>';

  return `
    ${tvCabecalho(`Fila de Pintura (${tvDados.pintura.length})`)}
    <div class="tvKioskBody tvTable">
      <div class="listPanel" style="flex:1;overflow:hidden;">
        <table><thead><tr><th>Equipamento</th><th>Série</th><th>Cliente</th><th>Status</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
    </div>
  `;
}

function tvSlideRmeSemRetorno() {
  const itens = tvDados.rmeSemRetorno.slice(0, 14);
  const linhas = itens.map((r) => `
    <tr><td class="num">${r.nf}</td><td>${r.cliente}</td><td>${r.tecnico || '—'}</td><td>${fmtData(r.rmeData)}</td></tr>
  `).join('') || '<tr><td colspan="4">Nenhum RME sem retorno.</td></tr>';
  const restantes = tvDados.rmeSemRetorno.length - itens.length;

  return `
    ${tvCabecalho(`RME Sem Retorno (${tvDados.rmeSemRetorno.length})`)}
    <div class="tvKioskBody tvTable">
      <div class="listPanel" style="flex:1;overflow:hidden;">
        <table><thead><tr><th>NF</th><th>Cliente</th><th>Técnico</th><th>Envio</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
      ${restantes > 0 ? `<p class="tvSectionLabel" style="margin-top:12px;">+ ${restantes} outros sem retorno</p>` : ''}
    </div>
  `;
}

// ---------- CHAMADOS ----------

async function carregarUsuariosSeNecessario() {
  if (usuariosCache.length || currentUser.papel !== 'ADMIN') return;
  try { usuariosCache = await api.get('/usuarios'); } catch { /* técnico sem acesso */ }
}

async function renderChamados() {
  const main = document.getElementById('mainContent');
  main.innerHTML = '<p class="sectionLabel">Carregando…</p>';

  let resumo;
  try {
    resumo = await api.get('/dashboard/chamados');
  } catch (err) {
    main.innerHTML = `<p>Erro ao carregar dashboard de chamados: ${err.message}</p>`;
    return;
  }

  const porSituacaoMap = Object.fromEntries(resumo.porSituacao.map((s) => [s.situacao, s._count]));

  main.innerHTML = `
    <p class="sectionLabel">Dashboard de chamados</p>
    <div class="kpiRow">
      <div class="kpi" style="--accent:var(--blue)"><div class="val num">${resumo.total}</div><div class="lbl">Total</div></div>
      <div class="kpi" style="--accent:var(--red)"><div class="val num">${porSituacaoMap.ABERTO || 0}</div><div class="lbl">Aberto</div></div>
      <div class="kpi" style="--accent:var(--amber)"><div class="val num">${porSituacaoMap.ORCAMENTO || 0}</div><div class="lbl">Orçamento</div></div>
      <div class="kpi" style="--accent:var(--red)"><div class="val num">${porSituacaoMap.SEM_RETORNO || 0}</div><div class="lbl">Sem retorno</div></div>
      <div class="kpi" style="--accent:var(--purple)"><div class="val num">${porSituacaoMap.DEVENDO || 0}</div><div class="lbl">Devendo</div></div>
      <div class="kpi" style="--accent:var(--blue)"><div class="val num">${porSituacaoMap.OUTROS || 0}</div><div class="lbl">Outros (em andamento)</div></div>
      <div class="kpi" style="--accent:var(--green)"><div class="val num">${porSituacaoMap.RESOLVIDO || 0}</div><div class="lbl">Resolvido</div></div>
    </div>
    <div class="chartsRow">
      <div class="panel"><h3>Evolução mensal</h3><div class="chartWrap"><canvas id="chartChamMes"></canvas></div></div>
      <div class="panel"><h3>Por situação</h3><div class="chartWrap"><canvas id="chartChamSituacao"></canvas></div></div>
    </div>
    <div class="chartsRow">
      <div class="panel"><h3>Por equipamento</h3><div class="chartWrap"><canvas id="chartChamEquip"></canvas></div></div>
      <div class="panel"><h3>Por responsável</h3><div class="chartWrap"><canvas id="chartChamResp"></canvas></div></div>
    </div>

    <p class="sectionLabel">Lista de chamados</p>
    <div class="toolbar">
      <div class="filters">
        <input type="text" id="fChamBusca" placeholder="Buscar cliente, número, série…">
        <select id="fChamSituacao"><option value="">Situação (todas)</option>${SITUACOES.map((s) => `<option value="${s}">${s.replace(/_/g, ' ')}</option>`).join('')}</select>
      </div>
      <button class="primaryBtn" id="btnNovoChamado">+ Novo chamado</button>
    </div>
    <div id="chamadoFormWrap"></div>
    <div class="listPanel"><table id="tblChamados"><thead>
      <tr><th>Número</th><th>Data</th><th>Cliente</th><th>Equipamento</th><th>Assunto</th><th>Situação</th><th></th></tr>
    </thead><tbody></tbody></table>
    <div class="toolbar" style="margin:14px 0 0;">
      <span class="sectionLabel" id="chamPaginaInfo" style="margin:0;"></span>
      <div class="filters">
        <button class="ghostBtn" id="btnChamAnterior">‹ Anterior</button>
        <button class="ghostBtn" id="btnChamProxima">Próxima ›</button>
      </div>
    </div>
    </div>
  `;

  if (chartChamMes) chartChamMes.destroy();
  if (chartChamEquip) chartChamEquip.destroy();
  if (chartChamResp) chartChamResp.destroy();
  if (chartSituacao) chartSituacao.destroy();

  chartChamMes = new Chart(document.getElementById('chartChamMes'), {
    type: 'line',
    data: {
      labels: resumo.porMes.map((m) => m.mes),
      datasets: [{ data: resumo.porMes.map((m) => m.total), borderColor: '#e8963a', backgroundColor: 'rgba(232,150,58,.2)', fill: true, tension: 0.3 }],
    },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  });

  chartSituacao = new Chart(document.getElementById('chartChamSituacao'), {
    type: 'doughnut',
    data: {
      labels: resumo.porSituacao.map((s) => s.situacao),
      datasets: [{
        data: resumo.porSituacao.map((s) => s._count),
        backgroundColor: ['#e2564f', '#e8963a', '#5b8fd6', '#a682e0', '#3fb88f', '#8b96a8'],
        borderColor: '#1a1f27',
        borderWidth: 2,
      }],
    },
    options: {
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: { legend: { position: 'right', align: 'center', labels: { color: '#8b96a8', boxWidth: 12, padding: 14 } } },
    },
  });

  chartChamEquip = new Chart(document.getElementById('chartChamEquip'), {
    type: 'bar',
    data: {
      labels: resumo.porEquipamento.map((e) => e.equipamentoCategoria),
      datasets: [{ data: resumo.porEquipamento.map((e) => e._count), backgroundColor: '#5b8fd6' }],
    },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  });

  chartChamResp = new Chart(document.getElementById('chartChamResp'), {
    type: 'bar',
    data: {
      labels: resumo.porResponsavel.map((r) => r.responsavel),
      datasets: [{ data: resumo.porResponsavel.map((r) => r._count), backgroundColor: '#3fb88f' }],
    },
    options: { maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } },
  });

  document.getElementById('btnNovoChamado').addEventListener('click', () => abrirFormChamado());
  document.getElementById('fChamBusca').addEventListener('input', debounce(() => { chamadosPagina = 1; carregarChamados(); }, 350));
  document.getElementById('fChamSituacao').addEventListener('change', () => { chamadosPagina = 1; carregarChamados(); });
  document.getElementById('btnChamAnterior').addEventListener('click', () => { if (chamadosPagina > 1) { chamadosPagina -= 1; carregarChamados(); } });
  document.getElementById('btnChamProxima').addEventListener('click', () => { chamadosPagina += 1; carregarChamados(); });

  chamadosPagina = 1;
  await carregarChamados();
}

let chamadosPagina = 1;
const CHAMADOS_PAGE_SIZE = 50;

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function carregarChamados() {
  const q = document.getElementById('fChamBusca').value.trim();
  const situacao = document.getElementById('fChamSituacao').value;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (situacao) params.set('situacao', situacao);
  params.set('page', chamadosPagina);
  params.set('pageSize', CHAMADOS_PAGE_SIZE);

  const { itens, total, page, pageSize } = await api.get(`/chamados?${params.toString()}`);
  const totalPaginas = Math.max(Math.ceil(total / pageSize), 1);
  const info = document.getElementById('chamPaginaInfo');
  if (info) info.textContent = `Página ${page} de ${totalPaginas} — ${total} chamados`;
  document.getElementById('btnChamAnterior').disabled = page <= 1;
  document.getElementById('btnChamProxima').disabled = page >= totalPaginas;

  const tbody = document.querySelector('#tblChamados tbody');
  tbody.innerHTML = itens.map((c) => `
    <tr>
      <td class="num">${c.numero}</td>
      <td>${fmtData(c.data)}</td>
      <td>${c.cliente}</td>
      <td>${c.equipamentoCategoria}</td>
      <td>${(c.assunto || '').slice(0, 40)}</td>
      <td>
        <select data-situacao="${c.id}">
          ${SITUACOES.map((s) => `<option value="${s}" ${c.situacao === s ? 'selected' : ''}>${s.replace(/_/g, ' ')}</option>`).join('')}
        </select>
        ${c.orcamentoStatus ? ' ' + badge(c.orcamentoStatus) : ''}
      </td>
      <td class="rowActions">
        <button class="rowBtn" data-editar="${c.id}">Editar</button>
        <button class="rowBtn" data-relatorio="${c.id}">Gerar relatório</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7">Nenhum chamado encontrado.</td></tr>';

  tbody.querySelectorAll('[data-situacao]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      try {
        await api.put(`/chamados/${sel.dataset.situacao}`, { situacao: sel.value });
        toast('Situação atualizada.');
        await carregarChamados();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  tbody.querySelectorAll('[data-relatorio]').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.open(`${API_BASE}/chamados/${btn.dataset.relatorio}/relatorio`, '_blank');
    });
  });

  tbody.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const chamado = await api.get(`/chamados/${btn.dataset.editar}`);
      abrirFormChamado(chamado);
    });
  });
}

function abrirFormChamado(chamado = null) {
  const wrap = document.getElementById('chamadoFormWrap');
  const c = chamado || {};
  wrap.innerHTML = `
    <div class="formPanel">
      <div class="formGrid">
        <div><label>Responsável</label><input type="text" id="fResponsavel" value="${c.responsavel || currentUser.nome}"></div>
        <div><label>Data</label><input type="date" id="fData" value="${c.data ? c.data.slice(0, 10) : new Date().toISOString().slice(0, 10)}"></div>
        <div><label>Cliente</label><input type="text" id="fCliente" value="${c.cliente || ''}"></div>
        <div><label>Contato</label><input type="text" id="fContato" value="${c.contato || ''}"></div>
        <div><label>Cidade</label><input type="text" id="fCidade" value="${c.cidade || ''}"></div>
        <div><label>UF</label><input type="text" id="fUf" maxlength="2" value="${c.uf || ''}"></div>
        <div><label>NF</label><input type="text" id="fNf" value="${c.nf || ''}"></div>
        <div><label>Representante</label><input type="text" id="fRepresentante" value="${c.representante || ''}"></div>
        <div><label>Série (lookup automático)</label><input type="text" id="fSerie" value="${c.serie || ''}"></div>
        <div><label>Equipamento</label><select id="fEquipamento">${EQUIPAMENTOS.map((eq) => `<option value="${eq}" ${c.equipamentoCategoria === eq ? 'selected' : ''}>${eq}</option>`).join('')}</select></div>
        <div><label>Modelo</label><input type="text" id="fModelo" value="${c.modelo || ''}"></div>
        <div><label>Situação</label><select id="fSituacao">${SITUACOES.map((s) => `<option value="${s}" ${c.situacao === s ? 'selected' : ''}>${s.replace(/_/g, ' ')}</option>`).join('')}</select></div>
        <div id="orcamentoWrap" class="${c.situacao === 'ORCAMENTO' ? '' : 'hidden'}"><label>Etapa do orçamento</label><select id="fOrcamentoStatus">${ORCAMENTO_STATUS.map((s) => `<option value="${s}" ${c.orcamentoStatus === s ? 'selected' : ''}>${s.replace(/_/g, ' ')}</option>`).join('')}</select></div>
        <div><label>Garantia</label><select id="fGarantia"><option value="false" ${!c.garantia ? 'selected' : ''}>NÃO</option><option value="true" ${c.garantia ? 'selected' : ''}>SIM</option></select></div>
        <div><label>Itália ajuda</label><select id="fItaliaAjuda"><option value="false" ${!c.italiaAjuda ? 'selected' : ''}>NÃO</option><option value="true" ${c.italiaAjuda ? 'selected' : ''}>SIM</option></select></div>
        <div class="full"><label>Assunto (reclamação)</label><textarea id="fAssunto">${c.assunto || ''}</textarea></div>
        <div class="full"><label>Ações realizadas</label><textarea id="fAcoes">${c.acoesRealizadas || ''}</textarea></div>
        <div class="full"><label>Conclusão</label><textarea id="fConclusao">${c.conclusao || ''}</textarea></div>
      </div>
      <div class="formActions">
        <button class="ghostBtn" id="btnCancelarChamado">Cancelar</button>
        <button class="primaryBtn" id="btnSalvarChamado">${chamado ? 'Salvar alterações' : 'Criar chamado'}</button>
      </div>
    </div>
  `;

  document.getElementById('fSituacao').addEventListener('change', (e) => {
    document.getElementById('orcamentoWrap').classList.toggle('hidden', e.target.value !== 'ORCAMENTO');
  });

  document.getElementById('fSerie').addEventListener('blur', async (e) => {
    const serie = e.target.value.trim();
    if (!serie) return;
    try {
      const ref = await api.get(`/series/${encodeURIComponent(serie)}`);
      document.getElementById('fNf').value = ref.nf || '';
      document.getElementById('fCliente').value = ref.cliente || document.getElementById('fCliente').value;
      document.getElementById('fModelo').value = ref.modelo || '';
      toast('Dados preenchidos a partir da série.');
    } catch { /* série não cadastrada — segue preenchimento manual */ }
  });

  document.getElementById('btnCancelarChamado').addEventListener('click', () => { wrap.innerHTML = ''; });

  document.getElementById('btnSalvarChamado').addEventListener('click', async () => {
    const payload = {
      responsavel: document.getElementById('fResponsavel').value,
      data: document.getElementById('fData').value,
      cliente: document.getElementById('fCliente').value,
      contato: document.getElementById('fContato').value,
      cidade: document.getElementById('fCidade').value,
      uf: document.getElementById('fUf').value,
      nf: document.getElementById('fNf').value,
      representante: document.getElementById('fRepresentante').value,
      serie: document.getElementById('fSerie').value,
      equipamentoCategoria: document.getElementById('fEquipamento').value,
      modelo: document.getElementById('fModelo').value,
      situacao: document.getElementById('fSituacao').value,
      orcamentoStatus: document.getElementById('fSituacao').value === 'ORCAMENTO' ? document.getElementById('fOrcamentoStatus').value : null,
      garantia: document.getElementById('fGarantia').value === 'true',
      italiaAjuda: document.getElementById('fItaliaAjuda').value === 'true',
      assunto: document.getElementById('fAssunto').value,
      acoesRealizadas: document.getElementById('fAcoes').value,
      conclusao: document.getElementById('fConclusao').value,
    };
    try {
      if (chamado) await api.put(`/chamados/${chamado.id}`, payload);
      else await api.post('/chamados', payload);
      toast('Chamado salvo com sucesso.');
      wrap.innerHTML = '';
      await carregarChamados();
    } catch (err) {
      toast(err.message, true);
    }
  });
}

// ---------- ORÇAMENTOS ----------

// Chamados importados do legado (antes desta data) não têm número/data de envio de
// orçamento preenchidos manualmente — por padrão a aba só considera daqui pra frente.
let orcamentosDesde = '2026-08-07';
let orcamentosStatusFiltro = '';

async function renderOrcamentos() {
  const main = document.getElementById('mainContent');
  main.innerHTML = '<p class="sectionLabel">Carregando…</p>';

  let metricas;
  try {
    metricas = await api.get(`/dashboard/orcamentos?desde=${orcamentosDesde}`);
  } catch (err) {
    main.innerHTML = `<p>Erro ao carregar orçamentos: ${err.message}</p>`;
    return;
  }

  const { aMontar, enviado, aprovado, reprovado, cancelado } = metricas.porStatus;
  const taxaTexto = metricas.taxaConversao === null ? '—' : `${(metricas.taxaConversao * 100).toFixed(0)}%`;

  main.innerHTML = `
    <p class="sectionLabel">Influência da área técnica nas vendas</p>
    <div class="kpiRow">
      <div class="kpi" style="--accent:var(--blue)"><div class="val num">${metricas.totalOrcamentos}</div><div class="lbl">Total de orçamentos</div></div>
      <div class="kpi" style="--accent:var(--green)"><div class="val num">${(metricas.taxaConversao === null ? '—' : taxaTexto)}</div><div class="lbl">Taxa de conversão</div></div>
      <div class="kpi" style="--accent:var(--green)"><div class="val num">${fmtMoeda(aprovado.valor)}</div><div class="lbl">Valor aprovado (${aprovado.quantidade})</div></div>
      <div class="kpi" style="--accent:var(--amber)"><div class="val num">${fmtMoeda(metricas.valorTotalOrcado)}</div><div class="lbl">Valor total orçado</div></div>
      <div class="kpi" style="--accent:var(--red)"><div class="val num">${fmtMoeda(reprovado.valor + cancelado.valor)}</div><div class="lbl">Reprovado/Cancelado (${reprovado.quantidade + cancelado.quantidade})</div></div>
      <div class="kpi" style="--accent:var(--blue)"><div class="val num">${aMontar.quantidade + enviado.quantidade}</div><div class="lbl">Aguardando decisão</div></div>
      <div class="kpi" style="--accent:var(--red)"><div class="val num">${metricas.vencidos}</div><div class="lbl">Vencidos (prazo 7 dias)</div></div>
    </div>

    <p class="sectionLabel">Lista de orçamentos</p>
    <div class="toolbar">
      <div class="filters">
        <label style="font-size:11.5px;color:var(--text-dim);display:flex;align-items:center;gap:6px;">
          Chamados a partir de
          <input type="date" id="fOrcDesde" value="${orcamentosDesde}">
        </label>
        <select id="fOrcStatus">
          <option value="" ${orcamentosStatusFiltro === '' ? 'selected' : ''}>Status (todos)</option>
          ${ORCAMENTO_STATUS.map((s) => `<option value="${s}" ${orcamentosStatusFiltro === s ? 'selected' : ''}>${s.replace(/_/g, ' ')}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="listPanel" style="overflow-x:auto;"><table id="tblOrcamentos"><thead>
      <tr>
        <th>Chamado</th><th>Cliente</th><th>Assunto</th><th>Nº orçamento</th><th>Envio</th><th>Prazo (7 dias)</th><th>Valor (R$)</th><th>Status</th>
      </tr>
    </thead><tbody></tbody></table></div>
  `;

  // Usa "blur" (não "change") porque o navegador dispara "change" a cada dígito digitado
  // no campo de data, o que recarregaria a tabela inteira e tiraria o foco no meio da digitação.
  document.getElementById('fOrcDesde').addEventListener('blur', (e) => {
    if (!e.target.value || e.target.value === orcamentosDesde) return;
    orcamentosDesde = e.target.value;
    renderOrcamentos();
  });
  document.getElementById('fOrcStatus').addEventListener('change', (e) => {
    orcamentosStatusFiltro = e.target.value;
    carregarOrcamentos();
  });
  await carregarOrcamentos();
}

async function carregarOrcamentos() {
  const params = new URLSearchParams({ orcamento: 'true', pageSize: '500', dataDesde: orcamentosDesde });
  if (orcamentosStatusFiltro) params.set('orcamentoStatus', orcamentosStatusFiltro);

  const { itens } = await api.get(`/chamados?${params.toString()}`);
  const tbody = document.querySelector('#tblOrcamentos tbody');

  tbody.innerHTML = itens.map((c) => `
    <tr>
      <td class="num">${c.numero}</td>
      <td>${c.cliente}</td>
      <td>${(c.assunto || '').slice(0, 40)}</td>
      <td><input type="text" data-numero="${c.id}" value="${c.numeroOrcamento ?? ''}" style="width:100px;" placeholder="Nº"></td>
      <td><input type="date" data-envio="${c.id}" value="${c.dataEnvioOrcamento ? c.dataEnvioOrcamento.slice(0, 10) : ''}" style="width:145px;"></td>
      <td>${prazoOrcamentoHtml(c.dataEnvioOrcamento, c.orcamentoStatus)}</td>
      <td><input type="number" step="0.01" data-valor="${c.id}" value="${c.valorOrcamento ?? ''}" style="width:110px;"></td>
      <td>
        <select data-status="${c.id}">
          ${ORCAMENTO_STATUS.map((s) => `<option value="${s}" ${c.orcamentoStatus === s ? 'selected' : ''}>${s.replace(/_/g, ' ')}</option>`).join('')}
        </select>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="8">Nenhum orçamento encontrado.</td></tr>';

  tbody.querySelectorAll('[data-status]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      try {
        await api.put(`/chamados/${sel.dataset.status}`, { orcamentoStatus: sel.value });
        toast('Status do orçamento atualizado.');
        await renderOrcamentos();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  // "blur" em vez de "change": em campos de data, o navegador dispara "change" a cada
  // dígito digitado, o que recarregava a tabela inteira e tirava o foco no meio da digitação.
  tbody.querySelectorAll('[data-valor]').forEach((input) => {
    input.addEventListener('blur', async () => {
      try {
        await api.put(`/chamados/${input.dataset.valor}`, { valorOrcamento: input.value === '' ? null : input.value });
        toast('Valor do orçamento atualizado.');
        await renderOrcamentos();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  tbody.querySelectorAll('[data-numero]').forEach((input) => {
    input.addEventListener('blur', async () => {
      try {
        await api.put(`/chamados/${input.dataset.numero}`, { numeroOrcamento: input.value || null });
        toast('Número do orçamento atualizado.');
      } catch (err) {
        toast(err.message, true);
      }
    });
  });

  tbody.querySelectorAll('[data-envio]').forEach((input) => {
    input.addEventListener('blur', async () => {
      try {
        await api.put(`/chamados/${input.dataset.envio}`, { dataEnvioOrcamento: input.value || null });
        toast('Data de envio atualizada.');
        await renderOrcamentos();
      } catch (err) {
        toast(err.message, true);
      }
    });
  });
}

// ---------- RME ----------

async function renderRme() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <p class="sectionLabel">RME / Montagem</p>
    <div class="toolbar">
      <div class="filters"><input type="text" id="fRmeBusca" placeholder="Buscar cliente ou NF…"></div>
      <button class="primaryBtn" id="btnNovoRme">+ Novo RME</button>
    </div>
    <div id="rmeFormWrap"></div>
    <div class="listPanel" style="overflow-x:auto;"><table id="tblRme"><thead>
      <tr><th>NF</th><th>Cliente</th><th>Equipamento</th><th>Técnico</th><th>Envio</th><th>Retorno</th><th>Montagem</th><th>Montador</th><th>Valor pago</th><th>Status</th><th></th></tr>
    </thead><tbody></tbody></table></div>
  `;
  document.getElementById('btnNovoRme').addEventListener('click', () => abrirFormRme());
  document.getElementById('fRmeBusca').addEventListener('input', debounce(carregarRme, 350));
  await carregarRme();
}

async function carregarRme() {
  const q = document.getElementById('fRmeBusca').value.trim();
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  const { itens } = await api.get(`/rme?${params.toString()}`);
  const tbody = document.querySelector('#tblRme tbody');
  tbody.innerHTML = itens.map((r) => `
    <tr>
      <td class="num">${r.nf}</td><td>${r.cliente}</td><td>${r.equipamento || '—'}</td><td>${r.tecnico || '—'}</td>
      <td>${fmtData(r.rmeData)}</td><td>${fmtData(r.retornoData)}</td><td>${fmtData(r.montagemData)}</td>
      <td>${r.montador || '—'}</td><td>${r.valorPago != null ? fmtMoeda(r.valorPago) : '—'}</td>
      <td>${badge(r.status)}</td>
      <td class="rowActions">
        <button class="rowBtn" data-editar="${r.id}">Editar</button>
        ${r.equipamento ? `<button class="rowBtn" data-formulario="${r.id}">Gerar formulário</button>` : ''}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="11">Nenhum RME encontrado.</td></tr>';

  tbody.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = itens.find((x) => x.id === btn.dataset.editar);
      abrirFormRme(r);
    });
  });

  tbody.querySelectorAll('[data-formulario]').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.open(`${API_BASE}/rme/${btn.dataset.formulario}/formulario`, '_blank');
    });
  });
}

function abrirFormRme(rme = null) {
  const wrap = document.getElementById('rmeFormWrap');
  const r = rme || {};
  wrap.innerHTML = `
    <div class="formPanel">
      <p class="sectionLabel" style="margin-top:0;">Dados para gerar o RME</p>
      <div class="formGrid">
        <div><label>NF</label><input type="text" id="rNf" value="${r.nf || ''}"></div>
        <div><label>Cliente</label><input type="text" id="rCliente" value="${r.cliente || ''}"></div>
        <div><label>Representante</label><input type="text" id="rRepresentante" value="${r.representante || ''}"></div>
        <div><label>Equipamento (para gerar formulário)</label>
          <select id="rEquipamento">
            <option value="">— selecione —</option>
            ${EQUIPAMENTOS_RME.map((e) => `<option value="${e}" ${r.equipamento === e ? 'selected' : ''}>${e}</option>`).join('')}
          </select>
        </div>
        <div><label>Modelo</label><input type="text" id="rModelo" value="${r.modelo || ''}"></div>
        <div><label>Número de série</label><input type="text" id="rNumeroSerie" value="${r.numeroSerie || ''}"></div>
        <div><label>Data da nota fiscal</label><input type="date" id="rDataNota" value="${r.dataNota ? r.dataNota.slice(0, 10) : ''}"></div>
        <div><label>Data de envio (RME)</label><input type="date" id="rRmeData" value="${r.rmeData ? r.rmeData.slice(0, 10) : ''}"></div>
      </div>

      <p class="sectionLabel">Acompanhamento (depois do RME enviado)</p>
      <div class="formGrid">
        <div><label>Técnico</label><input type="text" id="rTecnico" value="${r.tecnico || ''}"></div>
        <div><label>Data de retorno</label><input type="date" id="rRetornoData" value="${r.retornoData ? r.retornoData.slice(0, 10) : ''}"></div>
        <div><label>Data de montagem</label><input type="date" id="rMontagemData" value="${r.montagemData ? r.montagemData.slice(0, 10) : ''}"></div>
        <div><label>Montador (quem montou)</label><input type="text" id="rMontador" value="${r.montador || ''}"></div>
        <div><label>Valor</label><input type="number" step="0.01" id="rValor" value="${r.valor || ''}"></div>
        <div><label>Valor pago</label><input type="number" step="0.01" id="rValorPago" value="${r.valorPago ?? ''}"></div>
        <div><label>Cancelado</label><select id="rCancelado"><option value="false" ${!r.cancelado ? 'selected' : ''}>NÃO</option><option value="true" ${r.cancelado ? 'selected' : ''}>SIM</option></select></div>
        <div class="full"><label>Relatório</label><textarea id="rRelatorio">${r.relatorio || ''}</textarea></div>
      </div>
      <div class="formActions">
        <button class="ghostBtn" id="btnCancelarRme">Cancelar</button>
        <button class="primaryBtn" id="btnSalvarRme">${rme ? 'Salvar alterações' : 'Criar RME'}</button>
      </div>
    </div>
  `;
  document.getElementById('btnCancelarRme').addEventListener('click', () => { wrap.innerHTML = ''; });
  document.getElementById('btnSalvarRme').addEventListener('click', async () => {
    const payload = {
      nf: document.getElementById('rNf').value,
      cliente: document.getElementById('rCliente').value,
      representante: document.getElementById('rRepresentante').value,
      tecnico: document.getElementById('rTecnico').value,
      valor: document.getElementById('rValor').value || null,
      rmeData: document.getElementById('rRmeData').value || null,
      retornoData: document.getElementById('rRetornoData').value || null,
      montagemData: document.getElementById('rMontagemData').value || null,
      montador: document.getElementById('rMontador').value,
      valorPago: document.getElementById('rValorPago').value || null,
      equipamento: document.getElementById('rEquipamento').value || null,
      modelo: document.getElementById('rModelo').value,
      numeroSerie: document.getElementById('rNumeroSerie').value,
      dataNota: document.getElementById('rDataNota').value || null,
      cancelado: document.getElementById('rCancelado').value === 'true',
      relatorio: document.getElementById('rRelatorio').value,
    };
    try {
      if (rme) await api.put(`/rme/${rme.id}`, payload);
      else await api.post('/rme', payload);
      toast('RME salvo com sucesso.');
      wrap.innerHTML = '';
      await carregarRme();
    } catch (err) {
      toast(err.message, true);
    }
  });
}

// ---------- TAREFAS ----------

async function renderTarefas() {
  await carregarUsuariosSeNecessario();
  const main = document.getElementById('mainContent');
  const isAdmin = currentUser.papel === 'ADMIN';

  main.innerHTML = `
    <p class="sectionLabel">Tarefas</p>
    ${isAdmin ? `
      <div class="formPanel">
        <div class="formGrid">
          <div><label>Título</label><input type="text" id="tTitulo"></div>
          <div><label>Atribuir para</label><select id="tAtribuidoPara">${usuariosCache.filter((u) => u.ativo).map((u) => `<option value="${u.id}">${u.nome}</option>`).join('')}</select></div>
          <div><label>Prazo (opcional)</label><input type="date" id="tPrazo"></div>
          <div class="full"><label>Descrição</label><textarea id="tDescricao"></textarea></div>
        </div>
        <div class="formActions"><button class="primaryBtn" id="btnCriarTarefa">Atribuir tarefa</button></div>
      </div>
    ` : ''}
    <div class="listPanel"><table id="tblTarefas"><thead>
      <tr><th>Título</th>${isAdmin ? '<th>Atribuído para</th>' : ''}<th>Prazo</th><th>Status</th><th>Observação</th><th></th></tr>
    </thead><tbody></tbody></table></div>
  `;

  if (isAdmin) {
    document.getElementById('btnCriarTarefa').addEventListener('click', async () => {
      const payload = {
        titulo: document.getElementById('tTitulo').value,
        descricao: document.getElementById('tDescricao').value,
        atribuidoParaId: document.getElementById('tAtribuidoPara').value,
        prazo: document.getElementById('tPrazo').value || null,
      };
      if (!payload.titulo || !payload.atribuidoParaId) return toast('Preencha título e responsável.', true);
      try {
        await api.post('/tarefas', payload);
        toast('Tarefa atribuída.');
        renderTarefas();
      } catch (err) {
        toast(err.message, true);
      }
    });
  }

  const tarefas = await api.get('/tarefas');
  const tbody = document.querySelector('#tblTarefas tbody');
  tbody.innerHTML = tarefas.map((t) => `
    <tr>
      <td>${t.titulo}${t.descricao ? `<br><span style="color:var(--text-faint);font-size:11px;">${t.descricao}</span>` : ''}</td>
      ${isAdmin ? `<td>${t.atribuidoPara?.nome || '—'}</td>` : ''}
      <td>${t.prazo ? fmtData(t.prazo) : '—'}</td>
      <td>${badge(t.status)}</td>
      <td>${t.observacao || '—'}</td>
      <td class="rowActions">
        ${t.status === 'PENDENTE' ? `<button class="rowBtn ok" data-concluir="${t.id}">Concluir</button>` : `<button class="rowBtn" data-reabrir="${t.id}">Reabrir</button>`}
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6">Nenhuma tarefa.</td></tr>';

  tbody.querySelectorAll('[data-concluir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const observacao = await pedirTexto('Concluir tarefa', 'Observação (opcional):');
      if (observacao === null) return;
      await api.patch(`/tarefas/${btn.dataset.concluir}/status`, { status: 'CONCLUIDA', observacao: observacao || undefined });
      renderTarefas();
    });
  });
  tbody.querySelectorAll('[data-reabrir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api.patch(`/tarefas/${btn.dataset.reabrir}/status`, { status: 'PENDENTE' });
      renderTarefas();
    });
  });
}

// ---------- AGENDA ----------

async function renderAgenda() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <p class="sectionLabel">Agenda de visitas</p>
    <div class="formPanel">
      <div class="formGrid">
        <div><label>Tipo</label><select id="aTipo"><option value="SHOWROOM">Showroom</option><option value="CAMPO">Campo</option></select></div>
        <div><label>Data</label><input type="date" id="aData"></div>
        <div><label>Hora</label><input type="text" id="aHora" placeholder="14:00"></div>
        <div><label>Representante</label><input type="text" id="aRepresentante"></div>
        <div><label>Responsável</label><input type="text" id="aResponsavel"></div>
        <div><label>Linha</label><input type="text" id="aLinha" placeholder="Leve / Pesada"></div>
        <div class="full"><label>Observação</label><textarea id="aObservacao"></textarea></div>
      </div>
      <div class="formActions"><button class="primaryBtn" id="btnCriarVisita">Agendar visita</button></div>
    </div>
    <div class="listPanel"><table id="tblAgenda"><thead>
      <tr><th>Data</th><th>Hora</th><th>Tipo</th><th>Representante</th><th>Responsável</th><th>Linha</th><th></th></tr>
    </thead><tbody></tbody></table></div>
  `;

  document.getElementById('btnCriarVisita').addEventListener('click', async () => {
    const payload = {
      tipo: document.getElementById('aTipo').value,
      data: document.getElementById('aData').value,
      hora: document.getElementById('aHora').value,
      representante: document.getElementById('aRepresentante').value,
      responsavel: document.getElementById('aResponsavel').value,
      linha: document.getElementById('aLinha').value,
      observacao: document.getElementById('aObservacao').value,
    };
    if (!payload.data) return toast('Informe a data da visita.', true);
    try {
      await api.post('/agenda', payload);
      toast('Visita agendada.');
      renderAgenda();
    } catch (err) {
      toast(err.message, true);
    }
  });

  const visitas = await api.get('/agenda');
  document.querySelector('#tblAgenda tbody').innerHTML = visitas.map((v) => `
    <tr>
      <td>${fmtData(v.data)}</td><td>${v.hora || '—'}</td><td>${badge(v.tipo)}</td>
      <td>${v.representante || '—'}</td><td>${v.responsavel || '—'}</td><td>${v.linha || '—'}</td>
      <td class="rowActions"><button class="rowBtn no" data-excluir="${v.id}">Excluir</button></td>
    </tr>
  `).join('') || '<tr><td colspan="7">Nenhuma visita agendada.</td></tr>';

  document.querySelectorAll('#tblAgenda [data-excluir]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await pedirConfirmacao('Excluir visita', 'Tem certeza que deseja excluir esta visita?');
      if (!ok) return;
      await api.delete(`/agenda/${btn.dataset.excluir}`);
      renderAgenda();
    });
  });
}

// ---------- PINTURA ----------

async function renderPintura() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <p class="sectionLabel">Fila de pintura</p>
    <div class="formPanel">
      <div class="formGrid">
        <div><label>Equipamento</label><input type="text" id="pEquipamento"></div>
        <div><label>Série</label><input type="text" id="pSerie"></div>
        <div><label>Cliente</label><input type="text" id="pCliente"></div>
      </div>
      <div class="formActions"><button class="primaryBtn" id="btnCriarPintura">Adicionar à fila</button></div>
    </div>
    <div class="listPanel"><table id="tblPintura"><thead>
      <tr><th>Equipamento</th><th>Série</th><th>Cliente</th><th>Status</th><th></th></tr>
    </thead><tbody></tbody></table></div>
  `;

  document.getElementById('btnCriarPintura').addEventListener('click', async () => {
    const payload = {
      equipamento: document.getElementById('pEquipamento').value,
      serie: document.getElementById('pSerie').value,
      cliente: document.getElementById('pCliente').value,
    };
    if (!payload.equipamento) return toast('Informe o equipamento.', true);
    try {
      await api.post('/pintura', payload);
      toast('Adicionado à fila de pintura.');
      renderPintura();
    } catch (err) {
      toast(err.message, true);
    }
  });

  const itens = await api.get('/pintura');
  document.querySelector('#tblPintura tbody').innerHTML = itens.map((p) => `
    <tr>
      <td>${p.equipamento}</td><td>${p.serie || '—'}</td><td>${p.cliente || '—'}</td>
      <td>${badge(p.status)}</td>
      <td class="rowActions">
        <select data-status="${p.id}">
          <option value="AGUARDANDO" ${p.status === 'AGUARDANDO' ? 'selected' : ''}>Aguardando</option>
          <option value="EM_PINTURA" ${p.status === 'EM_PINTURA' ? 'selected' : ''}>Em pintura</option>
          <option value="CONCLUIDO" ${p.status === 'CONCLUIDO' ? 'selected' : ''}>Concluído</option>
        </select>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5">Fila de pintura vazia.</td></tr>';

  document.querySelectorAll('#tblPintura [data-status]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      await api.put(`/pintura/${sel.dataset.status}`, { status: sel.value });
      toast('Status atualizado.');
    });
  });
}

// ---------- PRODUÇÃO ----------

async function renderProducao() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <p class="sectionLabel">Produção</p>
    <div class="toolbar">
      <div class="filters"><input type="text" id="fProdBusca" placeholder="Buscar equipamento, código, série, produtor…"></div>
      <button class="primaryBtn" id="btnNovaProducao">+ Novo registro</button>
    </div>
    <div id="producaoFormWrap"></div>
    <div class="listPanel"><table id="tblProducao"><thead>
      <tr><th>Data</th><th>Equipamento</th><th>Código</th><th>Número de série</th><th>Quem produziu</th><th></th></tr>
    </thead><tbody></tbody></table></div>
  `;

  document.getElementById('btnNovaProducao').addEventListener('click', () => abrirFormProducao());
  document.getElementById('fProdBusca').addEventListener('input', debounce(carregarProducao, 350));
  await carregarProducao();
}

async function carregarProducao() {
  const q = document.getElementById('fProdBusca').value.trim();
  const params = new URLSearchParams();
  if (q) params.set('q', q);

  const { itens } = await api.get(`/producao?${params.toString()}`);
  const tbody = document.querySelector('#tblProducao tbody');
  tbody.innerHTML = itens.map((p) => `
    <tr>
      <td>${fmtData(p.data)}</td><td>${p.equipamento}</td><td>${p.codigo || '—'}</td>
      <td>${p.numeroSerie || '—'}</td><td>${p.quemProduziu}</td>
      <td class="rowActions"><button class="rowBtn" data-editar="${p.id}">Editar</button></td>
    </tr>
  `).join('') || '<tr><td colspan="6">Nenhum registro de produção.</td></tr>';

  tbody.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = itens.find((x) => x.id === btn.dataset.editar);
      abrirFormProducao(p);
    });
  });
}

function abrirFormProducao(producao = null) {
  const wrap = document.getElementById('producaoFormWrap');
  const p = producao || {};
  wrap.innerHTML = `
    <div class="formPanel">
      <div class="formGrid">
        <div><label>Equipamento</label><input type="text" id="pdEquipamento" value="${p.equipamento || ''}"></div>
        <div><label>Código</label><input type="text" id="pdCodigo" value="${p.codigo || ''}"></div>
        <div><label>Número de série</label><input type="text" id="pdSerie" value="${p.numeroSerie || ''}"></div>
        <div><label>Quem produziu</label><input type="text" id="pdQuemProduziu" value="${p.quemProduziu || ''}"></div>
        <div><label>Data</label><input type="date" id="pdData" value="${p.data ? p.data.slice(0, 10) : new Date().toISOString().slice(0, 10)}"></div>
      </div>
      <div class="formActions">
        <button class="ghostBtn" id="btnCancelarProducao">Cancelar</button>
        <button class="primaryBtn" id="btnSalvarProducao">${producao ? 'Salvar alterações' : 'Criar registro'}</button>
      </div>
    </div>
  `;
  document.getElementById('btnCancelarProducao').addEventListener('click', () => { wrap.innerHTML = ''; });
  document.getElementById('btnSalvarProducao').addEventListener('click', async () => {
    const payload = {
      equipamento: document.getElementById('pdEquipamento').value,
      codigo: document.getElementById('pdCodigo').value,
      numeroSerie: document.getElementById('pdSerie').value,
      quemProduziu: document.getElementById('pdQuemProduziu').value,
      data: document.getElementById('pdData').value || null,
    };
    try {
      if (producao) await api.put(`/producao/${producao.id}`, payload);
      else await api.post('/producao', payload);
      toast('Registro de produção salvo.');
      wrap.innerHTML = '';
      await carregarProducao();
    } catch (err) {
      toast(err.message, true);
    }
  });
}

// ---------- VISITAS TÉCNICAS (RMT) ----------

async function renderVisitasTecnicas() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <p class="sectionLabel">Visitas Técnicas — Relatório de Montagem e Treinamento</p>
    <div class="toolbar">
      <div class="filters"><input type="text" id="fVisitaBusca" placeholder="Buscar cliente, NF, série…"></div>
      <button class="primaryBtn" id="btnNovaVisita">+ Nova visita</button>
    </div>
    <div id="visitaFormWrap"></div>
    <div class="listPanel"><table id="tblVisitas"><thead>
      <tr><th>Data</th><th>Cliente</th><th>Equipamento</th><th>Técnico</th><th></th></tr>
    </thead><tbody></tbody></table></div>
  `;

  document.getElementById('btnNovaVisita').addEventListener('click', () => abrirFormVisitaTecnica());
  document.getElementById('fVisitaBusca').addEventListener('input', debounce(carregarVisitasTecnicas, 350));
  await carregarVisitasTecnicas();
}

async function carregarVisitasTecnicas() {
  const q = document.getElementById('fVisitaBusca').value.trim();
  const params = new URLSearchParams();
  if (q) params.set('q', q);

  const { itens } = await api.get(`/visitas-tecnicas?${params.toString()}`);
  const tbody = document.querySelector('#tblVisitas tbody');
  tbody.innerHTML = itens.map((v) => `
    <tr>
      <td>${fmtData(v.data)}</td><td>${v.cliente}</td><td>${v.equipamentoCategoria}</td>
      <td>${v.tecnicoResponsavel || '—'}</td>
      <td class="rowActions">
        <button class="rowBtn" data-editar="${v.id}">Editar</button>
        <button class="rowBtn" data-relatorio="${v.id}">Gerar RMT</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5">Nenhuma visita técnica registrada.</td></tr>';

  tbody.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const visita = await api.get(`/visitas-tecnicas/${btn.dataset.editar}`);
      abrirFormVisitaTecnica(visita);
    });
  });

  tbody.querySelectorAll('[data-relatorio]').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.open(`${API_BASE}/visitas-tecnicas/${btn.dataset.relatorio}/relatorio`, '_blank');
    });
  });
}

function abrirFormVisitaTecnica(visita = null) {
  const wrap = document.getElementById('visitaFormWrap');
  const v = visita || {};
  const treinamentos = Array.isArray(v.treinamentos) && v.treinamentos.length ? v.treinamentos : [{}, {}, {}, {}];
  while (treinamentos.length < 4) treinamentos.push({});

  wrap.innerHTML = `
    <div class="formPanel">
      <p class="sectionLabel">Dados para gerar o RMT</p>
      <div class="formGrid">
        <div><label>Representante</label><input type="text" id="vtRepresentante" value="${v.representante || ''}"></div>
        <div><label>Cliente</label><input type="text" id="vtCliente" value="${v.cliente || ''}"></div>
        <div><label>Nome Fantasia</label><input type="text" id="vtNomeFantasia" value="${v.nomeFantasia || ''}"></div>
        <div><label>N. Fiscal</label><input type="text" id="vtNf" value="${v.nf || ''}"></div>
        <div><label>Data da nota</label><input type="date" id="vtData" value="${v.data ? v.data.slice(0, 10) : ''}"></div>
        <div><label>Contato</label><input type="text" id="vtContato" value="${v.contato || ''}"></div>
        <div><label>Telefone</label><input type="text" id="vtTel" value="${v.telefone || ''}"></div>
        <div><label>Celular</label><input type="text" id="vtCel" value="${v.celular || ''}"></div>
        <div><label>E-mail</label><input type="text" id="vtEmail" value="${v.email || ''}"></div>
        <div><label>Equipamento</label><select id="vtEquipamento">${EQUIPAMENTOS.map((eq) => `<option value="${eq}" ${v.equipamentoCategoria === eq ? 'selected' : ''}>${eq}</option>`).join('')}</select></div>
        <div><label>Modelo</label><input type="text" id="vtModelo" value="${v.modelo || ''}"></div>
        <div><label>Número de série</label><input type="text" id="vtSerie" value="${v.numeroSerie || ''}"></div>
        <div><label>Hora início</label><input type="text" id="vtHoraInicio" placeholder="hh:mm" value="${v.horaInicio || ''}"></div>
        <div><label>Data início</label><input type="date" id="vtDataInicio" value="${v.dataInicio ? v.dataInicio.slice(0, 10) : ''}"></div>
      </div>

      <p class="sectionLabel">Treinamento (nome e RG — até 4 pessoas)</p>
      <div class="formGrid">
        ${treinamentos.slice(0, 4).map((t, i) => `
          <div><label>Nome ${i + 1}</label><input type="text" class="vtTreinoNome" value="${t.nome || ''}"></div>
          <div><label>RG ${i + 1}</label><input type="text" class="vtTreinoRg" value="${t.rg || ''}"></div>
        `).join('')}
        <div><label>Hora término</label><input type="text" id="vtHoraTermino" placeholder="hh:mm" value="${v.horaTermino || ''}"></div>
        <div><label>Data término</label><input type="date" id="vtDataTermino" value="${v.dataTermino ? v.dataTermino.slice(0, 10) : ''}"></div>
      </div>

      <p class="sectionLabel">Encerramento</p>
      <div class="formGrid">
        <div class="full"><label>Parecer do cliente</label><textarea id="vtParecer">${v.parecerCliente || ''}</textarea></div>
        <div><label>Técnico responsável</label><input type="text" id="vtTecnico" value="${v.tecnicoResponsavel || currentUser.nome}"></div>
        <div><label>Data assinatura</label><input type="date" id="vtDataAssinatura" value="${v.dataAssinatura ? v.dataAssinatura.slice(0, 10) : new Date().toISOString().slice(0, 10)}"></div>
      </div>

      <div class="formActions">
        <button class="ghostBtn" id="btnCancelarVisita">Cancelar</button>
        <button class="primaryBtn" id="btnSalvarVisita">${visita ? 'Salvar alterações' : 'Criar visita'}</button>
      </div>
    </div>
  `;

  document.getElementById('btnCancelarVisita').addEventListener('click', () => { wrap.innerHTML = ''; });
  document.getElementById('btnSalvarVisita').addEventListener('click', async () => {
    const nomes = Array.from(document.querySelectorAll('.vtTreinoNome')).map((el) => el.value);
    const rgs = Array.from(document.querySelectorAll('.vtTreinoRg')).map((el) => el.value);
    const payload = {
      representante: document.getElementById('vtRepresentante').value,
      cliente: document.getElementById('vtCliente').value,
      nomeFantasia: document.getElementById('vtNomeFantasia').value,
      nf: document.getElementById('vtNf').value,
      data: document.getElementById('vtData').value || null,
      contato: document.getElementById('vtContato').value,
      telefone: document.getElementById('vtTel').value,
      celular: document.getElementById('vtCel').value,
      email: document.getElementById('vtEmail').value,
      equipamentoCategoria: document.getElementById('vtEquipamento').value,
      modelo: document.getElementById('vtModelo').value,
      numeroSerie: document.getElementById('vtSerie').value,
      horaInicio: document.getElementById('vtHoraInicio').value,
      dataInicio: document.getElementById('vtDataInicio').value || null,
      treinamentos: nomes.map((nome, i) => ({ nome, rg: rgs[i] })),
      horaTermino: document.getElementById('vtHoraTermino').value,
      dataTermino: document.getElementById('vtDataTermino').value || null,
      parecerCliente: document.getElementById('vtParecer').value,
      tecnicoResponsavel: document.getElementById('vtTecnico').value,
      dataAssinatura: document.getElementById('vtDataAssinatura').value || null,
    };
    try {
      if (visita) await api.put(`/visitas-tecnicas/${visita.id}`, payload);
      else await api.post('/visitas-tecnicas', payload);
      toast('Visita técnica salva.');
      wrap.innerHTML = '';
      await carregarVisitasTecnicas();
    } catch (err) {
      toast(err.message, true);
    }
  });
}

// ---------- USUÁRIOS (admin) ----------

async function renderUsuarios() {
  if (currentUser.papel !== 'ADMIN') return irParaView('dashboard');
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <p class="sectionLabel">Usuários</p>
    <div class="formPanel">
      <div class="formGrid">
        <div><label>Nome</label><input type="text" id="uNome"></div>
        <div><label>E-mail</label><input type="email" id="uEmail"></div>
        <div><label>Senha provisória</label><input type="text" id="uSenha"></div>
        <div><label>Papel</label><select id="uPapel"><option value="TECNICO">Técnico</option><option value="ADMIN">Admin</option><option value="TV">TV (somente leitura, tela cheia)</option></select></div>
      </div>
      <div class="formActions"><button class="primaryBtn" id="btnCriarUsuario">Criar usuário</button></div>
    </div>
    <div class="listPanel"><table id="tblUsuarios"><thead>
      <tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Ativo</th><th></th></tr>
    </thead><tbody></tbody></table></div>
  `;

  document.getElementById('btnCriarUsuario').addEventListener('click', async () => {
    const payload = {
      nome: document.getElementById('uNome').value,
      email: document.getElementById('uEmail').value,
      senha: document.getElementById('uSenha').value,
      papel: document.getElementById('uPapel').value,
    };
    try {
      await api.post('/usuarios', payload);
      toast('Usuário criado.');
      usuariosCache = [];
      renderUsuarios();
    } catch (err) {
      toast(err.message, true);
    }
  });

  const usuarios = await api.get('/usuarios');
  usuariosCache = usuarios;
  document.querySelector('#tblUsuarios tbody').innerHTML = usuarios.map((u) => `
    <tr>
      <td>${u.nome}</td><td>${u.email}</td><td>${u.papel}</td>
      <td><input type="checkbox" data-ativo="${u.id}" ${u.ativo ? 'checked' : ''}></td>
      <td class="rowActions"><button class="rowBtn" data-reset="${u.id}">Resetar senha</button></td>
    </tr>
  `).join('');

  document.querySelectorAll('#tblUsuarios [data-ativo]').forEach((chk) => {
    chk.addEventListener('change', async () => {
      await api.patch(`/usuarios/${chk.dataset.ativo}/ativo`, { ativo: chk.checked });
      toast('Atualizado.');
    });
  });
  document.querySelectorAll('#tblUsuarios [data-reset]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const nova = await pedirTexto('Resetar senha', 'Nova senha provisória (mín. 6 caracteres):');
      if (!nova) return;
      try {
        await api.post(`/usuarios/${btn.dataset.reset}/resetar-senha`, { novaSenha: nova });
        toast('Senha resetada.');
      } catch (err) {
        toast(err.message, true);
      }
    });
  });
}

tentarSessao();
