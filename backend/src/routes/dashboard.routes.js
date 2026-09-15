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

module.exports = router;
