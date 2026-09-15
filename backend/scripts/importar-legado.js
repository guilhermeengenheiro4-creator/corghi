// Importa os dados legados (planilhas de rede) para o banco novo.
// Uso:
//   node scripts/importar-legado.js            -> dry-run (não grava nada, só mostra relatório)
//   node scripts/importar-legado.js --commit   -> apaga dados de teste e grava os dados reais

require('dotenv').config();
const xlsx = require('xlsx');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const COMMIT = process.argv.includes('--commit');

const CAMINHO_CHAMADOS = '\\\\brafs01\\Public_Data\\15 DOCUMENTOS ADM\\01. DIARIO\\ORDEM DE SERVIÇO 2026.xlsx';
const CAMINHO_RME = '\\\\brafs01\\Public_Data\\12 ÁREA TÉCNICA\\4 - PLANILHA RME\\PLANILHA AREA TECNICA.xlsx';

const MAPA_EQUIPAMENTO = {
  ALINHADORA: 'ALINHADORA',
  BALANCEADORA: 'BALANCEADORA',
  DESMONTADORA: 'DESMONTADORA',
  RAMPA: 'RAMPA',
  ELEVADOR: 'ELEVADOR',
  RECICLADORA: 'RECICLADORA',
  RECILADORA: 'RECICLADORA', // typo comum no legado
  RETIFICADORA: 'RETIFICADORA',
};

function normalizarEquipamento(raw) {
  if (!raw || !raw.trim()) return { categoria: 'OUTROS', nota: 'Equipamento não informado no legado.' };
  const v = raw.trim().toUpperCase();
  if (MAPA_EQUIPAMENTO[v]) return { categoria: MAPA_EQUIPAMENTO[v], nota: null };
  return { categoria: 'OUTROS', nota: `Categoria original no legado: "${raw.trim()}".` };
}

function normalizarSituacao(raw) {
  if (!raw || !raw.trim()) return { situacao: 'ABERTO', orcamentoStatus: null };
  const v = raw.trim().toUpperCase();
  if (v === 'ORÇAMENTO' || v === 'ORCAMENTO') return { situacao: 'ORCAMENTO', orcamentoStatus: 'ENVIADO' };
  if (['RESOLVIDO', 'FINALIZADO', 'REALIZADO', 'FECHADO', 'GARANTIA', 'RESOLVIDO/GARANTIA'].includes(v)) {
    return { situacao: 'RESOLVIDO', orcamentoStatus: null };
  }
  if (v === 'SEM RETORNO') return { situacao: 'SEM_RETORNO', orcamentoStatus: null };
  if (v === 'DEVENDO') return { situacao: 'DEVENDO', orcamentoStatus: null };
  return { situacao: 'OUTROS', orcamentoStatus: null };
}

function marcado(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function dataUTC(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function texto(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function lerChamados() {
  const wb = xlsx.readFile(CAMINHO_CHAMADOS, { cellDates: true });
  const linhas = xlsx.utils.sheet_to_json(wb.Sheets['CHAMADOS'], { header: 1, defval: null });

  const chamados = [];
  const anomalias = [];
  const numerosVistos = new Set();

  // Números duplicados no legado (dois chamados diferentes digitados com o mesmo número)
  // são reenumerados sequencialmente após o maior número real, preservando os dados de ambos.
  const todosNumeros = linhas
    .map((l) => (l && l[0] ? String(l[0]).trim() : ''))
    .filter((n) => /^\d{4}\/\d{3}$/.test(n));
  const anoBase = todosNumeros.length ? todosNumeros[0].split('/')[0] : String(new Date().getFullYear());
  let proximoLivre = Math.max(...todosNumeros.map((n) => parseInt(n.split('/')[1], 10))) + 1;

  for (const linha of linhas) {
    let numero = linha && linha[0] ? String(linha[0]).trim() : '';
    if (!/^\d{4}\/\d{3}$/.test(numero)) continue; // pula separadores de mês e linhas vazias

    const cliente = texto(linha[3]);
    const assunto = texto(linha[9]);
    if (!cliente && !assunto) continue; // linha reservada/placeholder, sem chamado real

    if (numerosVistos.has(numero)) {
      const original = numero;
      numero = `${anoBase}/${String(proximoLivre).padStart(3, '0')}`;
      proximoLivre += 1;
      anomalias.push(`${original} estava duplicado no legado — este registro foi renumerado para ${numero}.`);
    }
    numerosVistos.add(numero);

    const { categoria: equipamentoCategoria, nota: notaEquip } = normalizarEquipamento(linha[7]);
    const { situacao, orcamentoStatus } = normalizarSituacao(linha[10]);

    if (!cliente) anomalias.push(`${numero}: cliente não informado no legado.`);
    if (notaEquip) anomalias.push(`${numero}: ${notaEquip}`);

    chamados.push({
      numero,
      responsavel: texto(linha[1]) || 'Não informado',
      data: dataUTC(linha[2]) || dataUTC(new Date()),
      cliente: cliente || '(NÃO INFORMADO NO LEGADO)',
      nf: texto(linha[4]),
      garantia: marcado(linha[5]),
      italiaAjuda: marcado(linha[12]),
      equipamentoCategoria,
      serie: texto(linha[8]),
      assunto: texto(linha[9]) || '(sem descrição informada no legado)',
      acoesRealizadas: texto(linha[10]),
      situacao,
      orcamentoStatus,
      dataFechamento: situacao === 'RESOLVIDO' ? dataUTC(linha[11]) : null,
    });
  }

  return { chamados, anomalias };
}

function lerRme() {
  const wb = xlsx.readFile(CAMINHO_RME, { cellDates: true });
  const linhas = xlsx.utils.sheet_to_json(wb.Sheets['RME E MONTAGEM'], { header: 1, defval: null });

  const registros = [];
  for (const linha of linhas.slice(1)) {
    const nf = texto(linha[0]);
    if (!nf) continue;

    registros.push({
      nf,
      cliente: texto(linha[1]) || '(NÃO INFORMADO NO LEGADO)',
      representante: texto(linha[2]),
      rmeData: dataUTC(linha[3]),
      retornoData: dataUTC(linha[4]),
      montagemData: dataUTC(linha[5]),
      tecnico: texto(linha[6]),
      valor: typeof linha[7] === 'number' ? linha[7] : null,
      relatorio: texto(linha[8]),
      cancelado: false,
    });
  }
  return registros;
}

async function main() {
  const { chamados, anomalias } = lerChamados();
  const rme = lerRme();

  const porSituacao = {};
  for (const c of chamados) porSituacao[c.situacao] = (porSituacao[c.situacao] || 0) + 1;

  console.log(`\n=== RELATÓRIO DE IMPORTAÇÃO (${COMMIT ? 'MODO COMMIT' : 'DRY-RUN, nada será gravado'}) ===\n`);
  console.log(`Chamados encontrados: ${chamados.length}`);
  console.log('Distribuição por situação:', porSituacao);
  console.log(`\nRME/Montagem encontrados: ${rme.length}`);
  console.log(`\nAnomalias (${anomalias.length}) — revisar manualmente depois da importação:`);
  anomalias.forEach((a) => console.log('  - ' + a));

  console.log('\nExemplo (1º chamado mapeado):', JSON.stringify(chamados[0], null, 2));
  console.log('\nExemplo (1º RME mapeado):', JSON.stringify(rme[0], null, 2));

  if (!COMMIT) {
    console.log('\nRevise o relatório acima. Para gravar de verdade, rode:');
    console.log('  node scripts/importar-legado.js --commit\n');
    return;
  }

  const maiorSequencia = Math.max(...chamados.map((c) => parseInt(c.numero.split('/')[1], 10)));
  const ano = parseInt(chamados[0].numero.split('/')[0], 10);

  await prisma.$transaction(async (tx) => {
    await tx.chamado.deleteMany();
    await tx.rme.deleteMany();
    await tx.contadorChamado.deleteMany();

    await tx.chamado.createMany({ data: chamados });
    await tx.rme.createMany({ data: rme });
    await tx.contadorChamado.create({ data: { ano, ultimo: maiorSequencia } });
  });

  console.log(`\n✔ Gravado: ${chamados.length} chamados e ${rme.length} RME.`);
  console.log(`✔ Contador de numeração para ${ano} ajustado para ${maiorSequencia} (próximo será ${ano}/${String(maiorSequencia + 1).padStart(3, '0')}).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
