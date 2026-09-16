const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const usuarioSchema = z.object({
  nome: z.string().min(1),
  email: z.string().email(),
  senha: z.string().min(6),
  papel: z.enum(['ADMIN', 'TECNICO', 'TV']).default('TECNICO'),
});

router.get('/', async (req, res) => {
  const usuarios = await prisma.usuario.findMany({
    select: { id: true, nome: true, email: true, papel: true, ativo: true, criadoEm: true },
    orderBy: { nome: 'asc' },
  });
  res.json(usuarios);
});

router.post('/', async (req, res) => {
  const parsed = usuarioSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos.', detalhes: parsed.error.flatten() });

  const existente = await prisma.usuario.findUnique({ where: { email: parsed.data.email } });
  if (existente) return res.status(409).json({ erro: 'Já existe um usuário com este e-mail.' });

  const senhaHash = await bcrypt.hash(parsed.data.senha, 12);
  const usuario = await prisma.usuario.create({
    data: { nome: parsed.data.nome, email: parsed.data.email, papel: parsed.data.papel, senhaHash },
    select: { id: true, nome: true, email: true, papel: true, ativo: true },
  });
  res.status(201).json(usuario);
});

router.patch('/:id/ativo', async (req, res) => {
  const ativo = Boolean(req.body?.ativo);
  const usuario = await prisma.usuario
    .update({ where: { id: req.params.id }, data: { ativo }, select: { id: true, ativo: true } })
    .catch(() => null);
  if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  res.json(usuario);
});

router.post('/:id/resetar-senha', async (req, res) => {
  const novaSenha = req.body?.novaSenha;
  if (!novaSenha || novaSenha.length < 6) {
    return res.status(400).json({ erro: 'Nova senha deve ter ao menos 6 caracteres.' });
  }
  const senhaHash = await bcrypt.hash(novaSenha, 12);
  const usuario = await prisma.usuario
    .update({ where: { id: req.params.id }, data: { senhaHash }, select: { id: true } })
    .catch(() => null);
  if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  res.json({ ok: true });
});

module.exports = router;
