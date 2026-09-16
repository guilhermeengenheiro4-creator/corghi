const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const producaoSchema = z.object({
  equipamento: z.string().min(1),
  codigo: z.string().optional().nullable(),
  numeroSerie: z.string().optional().nullable(),
  quemProduziu: z.string().min(1),
  data: z.coerce.date().optional(),
});

router.get('/', async (req, res) => {
  const { q, page = '1', pageSize = '100' } = req.query;
  const where = {};
  if (q) {
    where.OR = [
      { equipamento: { contains: q, mode: 'insensitive' } },
      { codigo: { contains: q, mode: 'insensitive' } },
      { numeroSerie: { contains: q, mode: 'insensitive' } },
      { quemProduziu: { contains: q, mode: 'insensitive' } },
    ];
  }

  const take = Math.min(parseInt(pageSize, 10) || 100, 500);
  const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

  const [itens, total] = await Promise.all([
    prisma.producao.findMany({ where, orderBy: { data: 'desc' }, take, skip }),
    prisma.producao.count({ where }),
  ]);

  res.json({ itens, total, page: Number(page), pageSize: take });
});

router.post('/', async (req, res) => {
  const parsed = producaoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos.', detalhes: parsed.error.flatten() });

  const producao = await prisma.producao.create({ data: parsed.data });
  res.status(201).json(producao);
});

router.put('/:id', async (req, res) => {
  const parsed = producaoSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos.', detalhes: parsed.error.flatten() });

  const producao = await prisma.producao.update({ where: { id: req.params.id }, data: parsed.data }).catch(() => null);
  if (!producao) return res.status(404).json({ erro: 'Registro não encontrado.' });
  res.json(producao);
});

router.delete('/:id', async (req, res) => {
  if (req.user.papel !== 'ADMIN') return res.status(403).json({ erro: 'Somente Admin pode excluir.' });
  await prisma.producao.delete({ where: { id: req.params.id } }).catch(() => null);
  res.json({ ok: true });
});

module.exports = router;
