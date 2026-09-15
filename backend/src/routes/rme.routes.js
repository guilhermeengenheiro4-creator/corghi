const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const rmeSchema = z.object({
  nf: z.string().min(1),
  cliente: z.string().min(1),
  representante: z.string().optional().nullable(),
  tecnico: z.string().optional().nullable(),
  valor: z.coerce.number().optional().nullable(),
  relatorio: z.string().optional().nullable(),
  rmeData: z.coerce.date().optional().nullable(),
  retornoData: z.coerce.date().optional().nullable(),
  montagemData: z.coerce.date().optional().nullable(),
  cancelado: z.boolean().optional().default(false),
});

function statusDerivado(rme) {
  if (rme.cancelado) return 'CANCELADO';
  if (rme.montagemData) return 'CONCLUIDO';
  if (rme.retornoData) return 'AGUARDANDO_INSTALACAO';
  return 'SEM_RETORNO';
}

function comStatus(rme) {
  return { ...rme, status: statusDerivado(rme) };
}

router.get('/', async (req, res) => {
  const { status, q, page = '1', pageSize = '50' } = req.query;
  const where = {};
  if (q) {
    where.OR = [
      { cliente: { contains: q, mode: 'insensitive' } },
      { nf: { contains: q, mode: 'insensitive' } },
    ];
  }

  const take = Math.min(parseInt(pageSize, 10) || 50, 200);
  const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

  const [itens, total] = await Promise.all([
    prisma.rme.findMany({ where, orderBy: { criadoEm: 'desc' }, take, skip }),
    prisma.rme.count({ where }),
  ]);

  let itensComStatus = itens.map(comStatus);
  if (status) itensComStatus = itensComStatus.filter((r) => r.status === status);

  res.json({ itens: itensComStatus, total, page: Number(page), pageSize: take });
});

router.post('/', async (req, res) => {
  const parsed = rmeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos.', detalhes: parsed.error.flatten() });

  const rme = await prisma.rme.create({ data: parsed.data });
  res.status(201).json(comStatus(rme));
});

router.put('/:id', async (req, res) => {
  const parsed = rmeSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos.', detalhes: parsed.error.flatten() });

  const rme = await prisma.rme.update({ where: { id: req.params.id }, data: parsed.data }).catch(() => null);
  if (!rme) return res.status(404).json({ erro: 'RME não encontrado.' });
  res.json(comStatus(rme));
});

router.delete('/:id', async (req, res) => {
  if (req.user.papel !== 'ADMIN') return res.status(403).json({ erro: 'Somente Admin pode excluir.' });
  await prisma.rme.delete({ where: { id: req.params.id } }).catch(() => null);
  res.json({ ok: true });
});

module.exports = router;
