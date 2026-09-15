// Gera o próximo número no formato AAAA/NNN de forma atômica (via upsert com increment
// no banco), evitando colisão quando dois usuários criam um chamado ao mesmo tempo.
async function gerarProximoNumero(tx) {
  const ano = new Date().getFullYear();

  const contador = await tx.contadorChamado.upsert({
    where: { ano },
    create: { ano, ultimo: 1 },
    update: { ultimo: { increment: 1 } },
  });

  return `${ano}/${String(contador.ultimo).padStart(3, '0')}`;
}

module.exports = { gerarProximoNumero };
