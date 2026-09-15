const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const tarefaSchema = z.object({
  titulo: z.string().min(1),
  descricao: z.string().optional().nullable(),
  atribuidoParaId: z.string().min(1),
  prazo: z.coerce.date().optional().nullable(),
});

const atualizarStatusSchema = z.object({
  status: z.enum(['PENDENTE', 'CONCLUIDA']),
  observacao: z.string().optional().nullable(),
});

// Admin vê/cria tarefas para qualquer um. Técnico só vê as próprias.
router.get('/', async (req, res) => {
  const where = req.user.papel === 'ADMIN' ? {} : { atribuidoParaId: req.user.sub };
  const tarefas = await prisma.tarefa.findMany({
    where,
    orderBy: [{ status: 'asc' }, { prazo: 'asc' }, { dataCriacao: 'desc' }],
    include: {
      atribuidoPara: { select: { id: true, nome: true } },
      atribuidoPor: { select: { id: true, nome: true } },
    },
  });
  res.json(tarefas);
});

router.post('/', requireAdmin, async (req, res) => {
  const parsed = tarefaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos.', detalhes: parsed.error.flatten() });

  const tarefa = await prisma.tarefa.create({
    data: { ...parsed.data, atribuidoPorId: req.user.sub },
  });
  res.status(201).json(tarefa);
});

// Técnico só altera o status/observação das suas próprias tarefas.
router.patch('/:id/status', async (req, res) => {
  const parsed = atualizarStatusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos.', detalhes: parsed.error.flatten() });

  const tarefa = await prisma.tarefa.findUnique({ where: { id: req.params.id } });
  if (!tarefa) return res.status(404).json({ erro: 'Tarefa não encontrada.' });

  const ehDona = tarefa.atribuidoParaId === req.user.sub;
  if (!ehDona && req.user.papel !== 'ADMIN') {
    return res.status(403).json({ erro: 'Você só pode atualizar suas próprias tarefas.' });
  }

  const atualizada = await prisma.tarefa.update({
    where: { id: req.params.id },
    data: {
      status: parsed.data.status,
      observacao: parsed.data.observacao ?? tarefa.observacao,
      dataConclusao: parsed.data.status === 'CONCLUIDA' ? new Date() : null,
    },
  });
  res.json(atualizada);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  await prisma.tarefa.delete({ where: { id: req.params.id } }).catch(() => null);
  res.json({ ok: true });
});

module.exports = router;
