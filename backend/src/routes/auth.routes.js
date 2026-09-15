const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000, // 8 horas
  };
}

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos.' });

  const { email, senha } = parsed.data;
  const usuario = await prisma.usuario.findUnique({ where: { email } });

  if (!usuario || !usuario.ativo) {
    return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
  }

  const senhaOk = await bcrypt.compare(senha, usuario.senhaHash);
  if (!senhaOk) {
    return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
  }

  const token = jwt.sign(
    { sub: usuario.id, nome: usuario.nome, papel: usuario.papel },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.cookie('token', token, cookieOptions());
  res.json({ id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token', cookieOptions());
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  const usuario = await prisma.usuario.findUnique({ where: { id: req.user.sub } });
  if (!usuario || !usuario.ativo) return res.status(401).json({ erro: 'Não autenticado.' });
  res.json({ id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel });
});

const trocarSenhaSchema = z.object({
  senhaAtual: z.string().min(1),
  novaSenha: z.string().min(6),
});

router.post('/trocar-senha', requireAuth, async (req, res) => {
  const parsed = trocarSenhaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos.' });

  const usuario = await prisma.usuario.findUnique({ where: { id: req.user.sub } });
  const ok = await bcrypt.compare(parsed.data.senhaAtual, usuario.senhaHash);
  if (!ok) return res.status(401).json({ erro: 'Senha atual incorreta.' });

  const senhaHash = await bcrypt.hash(parsed.data.novaSenha, 12);
  await prisma.usuario.update({ where: { id: usuario.id }, data: { senhaHash } });
  res.json({ ok: true });
});

module.exports = router;
