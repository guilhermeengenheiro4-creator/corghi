const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const pinturaSchema = z.object({
  equipamento: z.string().min(1),
  serie: z.string().optional().nullable(),
  cliente: z.string().optional().nullable(),
  status: z.enum(['AGUARDANDO', 'EM_PINTURA', 'CONCLUIDO']).optional(),
});

router.get('/', async (req, res) => {
  const itens = await prisma.pintura.findMany({ orderBy: { criadoEm: 'desc' } });
  res.json(itens);
});

router.post('/', async (req, res) => {
  const parsed = pinturaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos.', detalhes: parsed.error.flatten() });
  const item = await prisma.pintura.create({ data: parsed.data });
  res.status(201).json(item);
});

router.put('/:id', async (req, res) => {
  const parsed = pinturaSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos.', detalhes: parsed.error.flatten() });
  const item = await prisma.pintura.update({ where: { id: req.params.id }, data: parsed.data }).catch(() => null);
  if (!item) return res.status(404).json({ erro: 'Item não encontrado.' });
  res.json(item);
});

router.delete('/:id', async (req, res) => {
  await prisma.pintura.delete({ where: { id: req.params.id } }).catch(() => null);
  res.json({ ok: true });
});

module.exports = router;
