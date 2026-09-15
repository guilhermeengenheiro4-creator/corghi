const express = require('express');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/kpis', async (req, res) => {
  const [total, abertos, resolvidos, porSituacao, porEquipamento, rmeSemRetorno, rmeAguardando] = await Promise.all([
    prisma.chamado.count(),
    prisma.chamado.count({ where: { situacao: 'ABERTO' } }),
    prisma.chamado.count({ where: { situacao: 'RESOLVIDO' } }),
    prisma.chamado.groupBy({ by: ['situacao'], _count: true }),
    prisma.chamado.groupBy({ by: ['equipamentoCategoria'], _count: true }),
    prisma.rme.count({ where: { cancelado: false, retornoData: null } }),
    prisma.rme.count({ where: { cancelado: false, retornoData: { not: null }, montagemData: null } }),
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
    porSituacao,
    porEquipamento,
    orcamentosPorEtapa,
    rme: { semRetorno: rmeSemRetorno, aguardandoInstalacao: rmeAguardando },
  });
});

module.exports = router;
