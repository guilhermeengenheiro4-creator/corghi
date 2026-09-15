require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Senhas provisórias — cada usuário deve trocar no primeiro acesso (rota /api/auth/trocar-senha).
const USUARIOS_INICIAIS = [
  { nome: 'Admin', email: 'admin@corghi.local', senha: 'TrocarSenha123!', papel: 'ADMIN' },
  { nome: 'Felipe', email: 'felipe@corghi.local', senha: 'TrocarSenha123!', papel: 'TECNICO' },
  { nome: 'Israel', email: 'israel@corghi.local', senha: 'TrocarSenha123!', papel: 'TECNICO' },
];

async function main() {
  for (const usuario of USUARIOS_INICIAIS) {
    const senhaHash = await bcrypt.hash(usuario.senha, 12);
    await prisma.usuario.upsert({
      where: { email: usuario.email },
      update: {},
      create: { nome: usuario.nome, email: usuario.email, senhaHash, papel: usuario.papel },
    });
    console.log(`Usuário pronto: ${usuario.email} / senha provisória: ${usuario.senha}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
