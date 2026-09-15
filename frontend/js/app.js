let currentUser = null;
let currentView = 'dashboard';
let usuariosCache = [];
let chartEquip = null;
let chartSituacao = null;

const EQUIPAMENTOS = ['ALINHADORA', 'BALANCEADORA', 'DESMONTADORA', 'RAMPA', 'ELEVADOR', 'RECICLADORA', 'RETIFICADORA', 'OUTROS'];
const SITUACOES = ['ABERTO', 'ORCAMENTO', 'SEM_RETORNO', 'OUTROS', 'DEVENDO', 'RESOLVIDO'];
const ORCAMENTO_STATUS = ['A_MONTAR', 'ENVIADO', 'APROVADO', 'REPROVADO', 'CANCELADO'];

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

function diasEmAberto(dataAbertura) {
  const abertura = new Date(dataAbertura);
  const hojeUTC = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const aberturaUTC = Date.UTC(abertura.getUTCFullYear(), abertura.getUTCMonth(), abertura.getUTCDate());
  return Math.max(0, Math.round((hojeUTC - aberturaUTC) / 86400000));
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
    rme: renderRme,
    tarefas: renderTarefas,
    agenda: renderAgenda,
    pintura: renderPintura,
    usuarios: renderUsuarios,
  };
  (renderers[view] || renderDashboard)();
}

// ---------- DASHBOARD ----------

async function renderDashboard() {
  const main = document.getElementById('mainContent');
  main.innerHTML = '<p class="sectionLabel">Carregando…</p>';

  let kpis, agenda, chamadosAbertos;
  try {
    [kpis, agenda, chamadosAbertos] = await Promise.all([
      api.get('/dashboard/kpis'),
      api.get('/agenda'),
      api.get('/chamados?situacao=ABERTO&pageSize=200'),
    ]);
  } catch (err) {
    main.innerHTML = `<p>Erro ao carregar dashboard: ${err.message}</p>`;
    return;
  }

  const porSituacaoMap = Object.fromEntries(kpis.porSituacao.map((s) => [s.situacao, s._count]));
  const visitasShowroom = agenda.filter((v) => v.tipo === 'SHOWROOM');
  const visitasCampo = agenda.filter((v) => v.tipo === 'CAMPO');
  const abertos = chamadosAbertos.itens;

  const linhaVisita = (v) => `
    <tr><td>${fmtData(v.data)}</td><td>${v.hora || '—'}</td><td>${v.representante || '—'}</td><td>${v.responsavel || '—'}</td><td>${v.linha || '—'}</td></tr>
  `;
  const linhaChamado = (c) => `
    <tr><td class="num">${c.numero}</td><td>${fmtData(c.data)}</td><td>${c.cliente}</td><td>${c.equipamentoCategoria}</td><td>${(c.assunto || '').slice(0, 40)}</td><td class="num">${diasEmAberto(c.data)}</td></tr>
  `;

  main.innerHTML = `
    <p class="sectionLabel">Visão geral</p>
    <div class="kpiRow">
      <div class="kpi" style="--accent:var(--blue)"><div class="val num">${kpis.total}</div><div class="lbl">Total de chamados</div></div>
      <div class="kpi" style="--accent:var(--red)"><div class="val num">${kpis.abertos}</div><div class="lbl">Abertos</div></div>
      <div class="kpi" style="--accent:var(--green)"><div class="val num">${kpis.resolvidos}</div><div class="lbl">Resolvidos</div></div>
      <div class="kpi" style="--accent:var(--amber)"><div class="val num">${porSituacaoMap.ORCAMENTO || 0}</div><div class="lbl">Em orçamento</div></div>
      <div class="kpi" style="--accent:var(--purple)"><div class="val num">${kpis.rme.semRetorno}</div><div class="lbl">RME sem retorno</div></div>
      <div class="kpi" style="--accent:var(--blue)"><div class="val num">${kpis.rme.aguardandoInstalacao}</div><div class="lbl">Aguardando instalação</div></div>
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

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
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
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  });

  chartSituacao = new Chart(ctxSit, {
    type: 'doughnut',
    data: {
      labels: kpis.porSituacao.map((s) => s.situacao),
      datasets: [{
        data: kpis.porSituacao.map((s) => s._count),
        backgroundColor: ['#e2564f', '#e8963a', '#5b8fd6', '#a682e0', '#3fb88f', '#8b96a8'],
      }],
    },
    options: { plugins: { legend: { position: 'bottom', labels: { color: '#8b96a8' } } } },
  });
}

// ---------- CHAMADOS ----------

async function carregarUsuariosSeNecessario() {
  if (usuariosCache.length || currentUser.papel !== 'ADMIN') return;
  try { usuariosCache = await api.get('/usuarios'); } catch { /* técnico sem acesso */ }
}

async function renderChamados() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <p class="sectionLabel">Chamados</p>
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
    </thead><tbody></tbody></table></div>
  `;

  document.getElementById('btnNovoChamado').addEventListener('click', () => abrirFormChamado());
  document.getElementById('fChamBusca').addEventListener('input', debounce(carregarChamados, 350));
  document.getElementById('fChamSituacao').addEventListener('change', carregarChamados);

  await carregarChamados();
}

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

  const { itens } = await api.get(`/chamados?${params.toString()}`);
  const tbody = document.querySelector('#tblChamados tbody');
  tbody.innerHTML = itens.map((c) => `
    <tr>
      <td class="num">${c.numero}</td>
      <td>${fmtData(c.data)}</td>
      <td>${c.cliente}</td>
      <td>${c.equipamentoCategoria}</td>
      <td>${(c.assunto || '').slice(0, 40)}</td>
      <td>${badge(c.situacao)}${c.orcamentoStatus ? ' ' + badge(c.orcamentoStatus) : ''}</td>
      <td class="rowActions"><button class="rowBtn" data-editar="${c.id}">Editar</button></td>
    </tr>
  `).join('') || '<tr><td colspan="7">Nenhum chamado encontrado.</td></tr>';

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
    <div class="listPanel"><table id="tblRme"><thead>
      <tr><th>NF</th><th>Cliente</th><th>Técnico</th><th>Envio</th><th>Retorno</th><th>Montagem</th><th>Status</th><th></th></tr>
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
      <td class="num">${r.nf}</td><td>${r.cliente}</td><td>${r.tecnico || '—'}</td>
      <td>${fmtData(r.rmeData)}</td><td>${fmtData(r.retornoData)}</td><td>${fmtData(r.montagemData)}</td>
      <td>${badge(r.status)}</td>
      <td class="rowActions"><button class="rowBtn" data-editar="${r.id}">Editar</button></td>
    </tr>
  `).join('') || '<tr><td colspan="8">Nenhum RME encontrado.</td></tr>';

  tbody.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = itens.find((x) => x.id === btn.dataset.editar);
      abrirFormRme(r);
    });
  });
}

function abrirFormRme(rme = null) {
  const wrap = document.getElementById('rmeFormWrap');
  const r = rme || {};
  wrap.innerHTML = `
    <div class="formPanel">
      <div class="formGrid">
        <div><label>NF</label><input type="text" id="rNf" value="${r.nf || ''}"></div>
        <div><label>Cliente</label><input type="text" id="rCliente" value="${r.cliente || ''}"></div>
        <div><label>Representante</label><input type="text" id="rRepresentante" value="${r.representante || ''}"></div>
        <div><label>Técnico</label><input type="text" id="rTecnico" value="${r.tecnico || ''}"></div>
        <div><label>Valor</label><input type="number" step="0.01" id="rValor" value="${r.valor || ''}"></div>
        <div><label>Data de envio (RME)</label><input type="date" id="rRmeData" value="${r.rmeData ? r.rmeData.slice(0, 10) : ''}"></div>
        <div><label>Data de retorno</label><input type="date" id="rRetornoData" value="${r.retornoData ? r.retornoData.slice(0, 10) : ''}"></div>
        <div><label>Data de montagem</label><input type="date" id="rMontagemData" value="${r.montagemData ? r.montagemData.slice(0, 10) : ''}"></div>
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
        <div><label>Papel</label><select id="uPapel"><option value="TECNICO">Técnico</option><option value="ADMIN">Admin</option></select></div>
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
