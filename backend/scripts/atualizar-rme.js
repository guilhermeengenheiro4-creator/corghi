// Atualiza a tabela RME a partir da planilha de rede, SEM tocar em Chamados e SEM apagar
// campos preenchidos manualmente no sistema (montador, valorPago, cancelado).
// Uso:
//   node scripts/atualizar-rme.js            -> dry-run (só mostra o que mudaria)
//   node scripts/atualizar-rme.js --commit   -> grava de verdade

require('dotenv').config();
const xlsx = require('xlsx');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const COMMIT = process.argv.includes('--commit');
const CAMINHO_RME = '\\\\brafs01\\Public_Data\\12 ÁREA TÉCNICA\\4 - PLANILHA RME\\PLANILHA AREA TECNICA.xlsx';

function texto(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function dataUTC(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function mesmaData(a, b) {
  const ta = a ? new Date(a).getTime() : null;
  const tb = b ? new Date(b).getTime() : null;
  return ta === tb;
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
    });
  }
  return registros;
}

async function main() {
  const daPlanilha = lerRme();
  const doBanco = await prisma.rme.findMany();
  const porNf = new Map(doBanco.map((r) => [r.nf, r]));

  const nfsVistos = new Set();
  const duplicadosNaPlanilha = [];
  for (const r of daPlanilha) {
    if (nfsVistos.has(r.nf)) duplicadosNaPlanilha.push(r.nf);
    nfsVistos.add(r.nf);
  }

  const novos = [];
  const atualizados = [];
  const semMudanca = [];

  for (const r of daPlanilha) {
    const existente = porNf.get(r.nf);
    if (!existente) {
      novos.push(r);
      continue;
    }

    const mudou =
      existente.cliente !== r.cliente ||
      existente.representante !== r.representante ||
      existente.tecnico !== r.tecnico ||
      Number(existente.valor || 0) !== Number(r.valor || 0) ||
      existente.relatorio !== r.relatorio ||
      !mesmaData(existente.rmeData, r.rmeData) ||
      !mesmaData(existente.retornoData, r.retornoData) ||
      !mesmaData(existente.montagemData, r.montagemData);

    if (mudou) atualizados.push({ id: existente.id, ...r });
    else semMudanca.push(r);
  }

  const nfsNaPlanilha = new Set(daPlanilha.map((r) => r.nf));
  const removidosDaPlanilha = doBanco.filter((r) => !nfsNaPlanilha.has(r.nf));

  console.log(`\n=== ATUALIZAÇÃO RME (${COMMIT ? 'MODO COMMIT' : 'DRY-RUN, nada será gravado'}) ===\n`);
  console.log(`Registros na planilha: ${daPlanilha.length}`);
  console.log(`Novos (serão criados): ${novos.length}`);
  console.log(`Já existentes e sem mudança: ${semMudanca.length}`);
  console.log(`Já existentes e serão atualizados: ${atualizados.length}`);
  if (duplicadosNaPlanilha.length) console.log(`⚠ NFs duplicados na planilha: ${duplicadosNaPlanilha.join(', ')}`);
  if (removidosDaPlanilha.length) {
    console.log(`\nNo banco mas não aparecem mais na planilha (NÃO serão apagados): ${removidosDaPlanilha.length}`);
    removidosDaPlanilha.slice(0, 10).forEach((r) => console.log(`  - NF ${r.nf} (${r.cliente})`));
  }

  if (atualizados.length) {
    console.log('\nExemplos de atualização:');
    atualizados.slice(0, 5).forEach((a) => {
      const antes = porNf.get(a.nf);
      console.log(`  NF ${a.nf}: retorno ${antes.retornoData?.toISOString().slice(0,10) || '—'} -> ${a.retornoData?.toISOString().slice(0,10) || '—'}, montagem ${antes.montagemData?.toISOString().slice(0,10) || '—'} -> ${a.montagemData?.toISOString().slice(0,10) || '—'}`);
    });
  }

  if (!COMMIT) {
    console.log('\nRevise o relatório acima. Para gravar de verdade, rode:');
    console.log('  node scripts/atualizar-rme.js --commit\n');
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (novos.length) await tx.rme.createMany({ data: novos });
    for (const a of atualizados) {
      const { id, ...dados } = a;
      await tx.rme.update({ where: { id }, data: dados });
    }
  });

  console.log(`\n✔ ${novos.length} criados, ${atualizados.length} atualizados. Montador/Valor pago/Cancelado preservados.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
