const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const visitaSchema = z.object({
  tipo: z.enum(['SHOWROOM', 'CAMPO']),
  data: z.coerce.date(),
  hora: z.string().optional().nullable(),
  representante: z.string().optional().nullable(),
  responsavel: z.string().optional().nullable(),
  linha: z.string().optional().nullable(),
  observacao: z.string().optional().nullable(),
});

router.get('/', async (req, res) => {
  const { de, ate } = req.query;
  const where = {};
  if (de || ate) {
    where.data = {};
    if (de) where.data.gte = new Date(de);
    if (ate) where.data.lte = new Date(ate);
  }
  const visitas = await prisma.visitaAgenda.findMany({ where, orderBy: { data: 'asc' } });
  res.json(visitas);
});

router.post('/', async (req, res) => {
  const parsed = visitaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos.', detalhes: parsed.error.flatten() });
  const visita = await prisma.visitaAgenda.create({ data: parsed.data });
  res.status(201).json(visita);
});

router.put('/:id', async (req, res) => {
  const parsed = visitaSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos.', detalhes: parsed.error.flatten() });
  const visita = await prisma.visitaAgenda.update({ where: { id: req.params.id }, data: parsed.data }).catch(() => null);
  if (!visita) return res.status(404).json({ erro: 'Visita não encontrada.' });
  res.json(visita);
});

router.delete('/:id', async (req, res) => {
  await prisma.visitaAgenda.delete({ where: { id: req.params.id } }).catch(() => null);
  res.json({ ok: true });
});

module.exports = router;
