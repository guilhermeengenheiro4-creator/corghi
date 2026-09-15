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
router.get('/orcamentos', async (req, res) => {
  const porStatus = await prisma.chamado.groupBy({
    by: ['orcamentoStatus'],
    where: { orcamentoStatus: { not: null } },
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

  res.json({
    totalOrcamentos,
    taxaConversao,
    valorTotalOrcado,
    porStatus: { aMontar, enviado, aprovado, reprovado, cancelado },
  });
});

module.exports = router;
