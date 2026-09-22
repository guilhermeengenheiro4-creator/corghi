const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/kpis', async (req, res) => {
  const agora = new Date();
  const anoAtual = agora.getUTCFullYear();
  const mesAtual = agora.getUTCMonth();
  const inicioAno = new Date(Date.UTC(anoAtual, 0, 1));
  const fimAno = new Date(Date.UTC(anoAtual + 1, 0, 1));
  const inicioMes = new Date(Date.UTC(anoAtual, mesAtual, 1));
  const fimMes = new Date(Date.UTC(anoAtual, mesAtual + 1, 1));

  const [total, abertos, resolvidos, porSituacao, porEquipamento, rmeSemRetorno, rmeAguardando, abertosNoAno, abertosNoMes] = await Promise.all([
    prisma.chamado.count(),
    prisma.chamado.count({ where: { situacao: 'ABERTO' } }),
    prisma.chamado.count({ where: { situacao: 'RESOLVIDO' } }),
    prisma.chamado.groupBy({ by: ['situacao'], _count: true }),
    prisma.chamado.groupBy({ by: ['equipamentoCategoria'], _count: true }),
    prisma.rme.count({ where: { cancelado: false, retornoData: null } }),
    prisma.rme.count({ where: { cancelado: false, retornoData: { not: null }, montagemData: null } }),
    prisma.chamado.count({ where: { data: { gte: inicioAno, lt: fimAno } } }),
    prisma.chamado.count({ where: { data: { gte: inicioMes, lt: fimMes } } }),
  ]);

  const orcamentosPorEtapa = await prisma.chamado.groupBy({
    by: ['orcamentoStatus'],
    where: { situacao: 'ORCAMENTO' },
    _count: true,
  });

  res.json({
    total,
    abertos,
    resolvidos,
    abertosNoAno,
    abertosNoMes,
    porSituacao,
    porEquipamento,
    orcamentosPorEtapa,
    rme: { semRetorno: rmeSemRetorno, aguardandoInstalacao: rmeAguardando },
  });
});

// Dashboard específico da aba Chamados: visão detalhada só de chamados (situação, equipamento,
// responsável, evolução mensal).
router.get('/chamados', async (req, res) => {
  const [total, porSituacao, porEquipamento, porResponsavel, porMes] = await Promise.all([
    prisma.chamado.count(),
    prisma.chamado.groupBy({ by: ['situacao'], _count: true }),
    prisma.chamado.groupBy({ by: ['equipamentoCategoria'], _count: true }),
    prisma.chamado.groupBy({ by: ['responsavel'], _count: true, orderBy: { _count: { responsavel: 'desc' } } }),
    prisma.$queryRaw`
      SELECT to_char(date_trunc('month', "data"), 'YYYY-MM') AS mes, COUNT(*)::int AS total
      FROM "Chamado"
      GROUP BY 1
      ORDER BY 1
    `,
  ]);

  res.json({ total, porSituacao, porEquipamento, porResponsavel, porMes });
});

// Métrica de quanto a área técnica influencia vendas: conversão de orçamentos e valor gerado.
// `desde`: filtra pela data do chamado — dados antigos (importados do legado) não têm
// número/data de envio preenchidos manualmente, então o padrão no frontend só considera
// chamados a partir de uma data de corte.
router.get('/orcamentos', async (req, res) => {
  const { desde } = req.query;
  const whereData = desde ? { data: { gte: new Date(desde) } } : {};

  const porStatus = await prisma.chamado.groupBy({
    by: ['orcamentoStatus'],
    where: { orcamentoStatus: { not: null }, ...whereData },
    _count: true,
    _sum: { valorOrcamento: true },
  });

  const mapa = Object.fromEntries(
    porStatus.map((s) => [s.orcamentoStatus, { quantidade: s._count, valor: Number(s._sum.valorOrcamento || 0) }])
  );

  const aprovado = mapa.APROVADO || { quantidade: 0, valor: 0 };
  const reprovado = mapa.REPROVADO || { quantidade: 0, valor: 0 };
  const cancelado = mapa.CANCELADO || { quantidade: 0, valor: 0 };
  const enviado = mapa.ENVIADO || { quantidade: 0, valor: 0 };
  const aMontar = mapa.A_MONTAR || { quantidade: 0, valor: 0 };

  const decididos = aprovado.quantidade + reprovado.quantidade + cancelado.quantidade;
  const taxaConversao = decididos ? aprovado.quantidade / decididos : null;
  const totalOrcamentos = decididos + enviado.quantidade + aMontar.quantidade;
  const valorTotalOrcado = aprovado.valor + reprovado.valor + cancelado.valor + enviado.valor + aMontar.valor;

  // Vencido = ainda não decidido (A_MONTAR/ENVIADO) e já passou dos 7 dias corridos desde o envio.
  const PRAZO_DIAS = 7;
  const limiteVencimento = new Date(Date.now() - PRAZO_DIAS * 86400000);
  const vencidos = await prisma.chamado.count({
    where: {
      orcamentoStatus: { in: ['A_MONTAR', 'ENVIADO'] },
      dataEnvioOrcamento: { lt: limiteVencimento },
      ...whereData,
    },
  });

  res.json({
    totalOrcamentos,
    taxaConversao,
    valorTotalOrcado,
    vencidos,
    porStatus: { aMontar, enviado, aprovado, reprovado, cancelado },
  });
});

// Relatório de desempenho mensal: chamados e orçamentos do mês escolhido (por data de
// abertura do chamado), pra fechamento mensal.
router.get('/relatorio-mensal', async (req, res) => {
  const ano = parseInt(req.query.ano, 10) || new Date().getUTCFullYear();
  const mes = parseInt(req.query.mes, 10) || new Date().getUTCMonth() + 1; // 1-12
  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(ano, mes, 1));
  const whereMes = { data: { gte: inicio, lt: fim } };

  const [totalAbertosNoMes, resolvidosNoMes, porSituacao, porEquipamento, porResponsavel] = await Promise.all([
    prisma.chamado.count({ where: whereMes }),
    prisma.chamado.count({ where: { dataFechamento: { gte: inicio, lt: fim } } }),
    prisma.chamado.groupBy({ by: ['situacao'], where: whereMes, _count: true }),
    prisma.chamado.groupBy({ by: ['equipamentoCategoria'], where: whereMes, _count: true }),
    prisma.chamado.groupBy({ by: ['responsavel'], where: whereMes, _count: true, orderBy: { _count: { responsavel: 'desc' } } }),
  ]);

  const porStatusOrcamento = await prisma.chamado.groupBy({
    by: ['orcamentoStatus'],
    where: { orcamentoStatus: { not: null }, ...whereMes },
    _count: true,
    _sum: { valorOrcamento: true },
  });

  const mapa = Object.fromEntries(
    porStatusOrcamento.map((s) => [s.orcamentoStatus, { quantidade: s._count, valor: Number(s._sum.valorOrcamento || 0) }])
  );
  const aprovado = mapa.APROVADO || { quantidade: 0, valor: 0 };
  const reprovado = mapa.REPROVADO || { quantidade: 0, valor: 0 };
  const cancelado = mapa.CANCELADO || { quantidade: 0, valor: 0 };
  const enviado = mapa.ENVIADO || { quantidade: 0, valor: 0 };
  const aMontar = mapa.A_MONTAR || { quantidade: 0, valor: 0 };
  const decididos = aprovado.quantidade + reprovado.quantidade + cancelado.quantidade;
  const taxaConversao = decididos ? aprovado.quantidade / decididos : null;
  const totalOrcamentos = decididos + enviado.quantidade + aMontar.quantidade;
  const valorTotalOrcado = aprovado.valor + reprovado.valor + cancelado.valor + enviado.valor + aMontar.valor;

  res.json({
    periodo: { ano, mes },
    chamados: { totalAbertosNoMes, resolvidosNoMes, porSituacao, porEquipamento, porResponsavel },
    orcamentos: {
      totalOrcamentos,
      taxaConversao,
      valorTotalOrcado,
      porStatus: { aMontar, enviado, aprovado, reprovado, cancelado },
    },
  });
});

module.exports = router;
