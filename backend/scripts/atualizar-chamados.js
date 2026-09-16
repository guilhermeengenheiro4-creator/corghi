// Atualiza a tabela Chamado a partir da planilha de rede: cria os que forem novos e
// atualiza campos vindos do legado (cliente, NF, equipamento, situação bruta, etc.) nos
// já existentes. NÃO sobrescreve o que já foi trabalhado dentro do sistema (número do
// orçamento, data de envio, valor do orçamento) — se esses campos já foram preenchidos
// para um chamado, a situação/orcamentoStatus dele também deixam de ser tocados por aqui,
// para não desfazer uma decisão já tomada no app.
//
// Uso:
//   node scripts/atualizar-chamados.js            -> dry-run (só mostra o que mudaria)
//   node scripts/atualizar-chamados.js --commit   -> grava de verdade

require('dotenv').config();
const xlsx = require('xlsx');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const COMMIT = process.argv.includes('--commit');
const CAMINHO_CHAMADOS = '\\\\brafs01\\Public_Data\\15 DOCUMENTOS ADM\\01. DIARIO\\ORDEM DE SERVIÇO 2026.xlsx';

const MAPA_EQUIPAMENTO = {
  ALINHADORA: 'ALINHADORA',
  BALANCEADORA: 'BALANCEADORA',
  DESMONTADORA: 'DESMONTADORA',
  RAMPA: 'RAMPA',
  ELEVADOR: 'ELEVADOR',
  RECICLADORA: 'RECICLADORA',
  RECILADORA: 'RECICLADORA',
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

function mesmaData(a, b) {
  const ta = a ? new Date(a).getTime() : null;
  const tb = b ? new Date(b).getTime() : null;
  return ta === tb;
}

function lerChamados() {
  const wb = xlsx.readFile(CAMINHO_CHAMADOS, { cellDates: true });
  const linhas = xlsx.utils.sheet_to_json(wb.Sheets['CHAMADOS'], { header: 1, defval: null });

  const registros = [];
  const numerosVistos = new Set();
  const todosNumeros = linhas
    .map((l) => (l && l[0] ? String(l[0]).trim() : ''))
    .filter((n) => /^\d{4}\/\d{3}$/.test(n));
  const anoBase = todosNumeros.length ? todosNumeros[0].split('/')[0] : String(new Date().getFullYear());
  let proximoLivre = todosNumeros.length ? Math.max(...todosNumeros.map((n) => parseInt(n.split('/')[1], 10))) + 1 : 1;

  for (const linha of linhas) {
    let numero = linha && linha[0] ? String(linha[0]).trim() : '';
    if (!/^\d{4}\/\d{3}$/.test(numero)) continue;

    const cliente = texto(linha[3]);
    const assunto = texto(linha[9]);
    if (!cliente && !assunto) continue;

    if (numerosVistos.has(numero)) {
      numero = `${anoBase}/${String(proximoLivre).padStart(3, '0')}`;
      proximoLivre += 1;
    }
    numerosVistos.add(numero);

    const { categoria: equipamentoCategoria } = normalizarEquipamento(linha[7]);
    const { situacao, orcamentoStatus } = normalizarSituacao(linha[10]);

    registros.push({
      numero,
      responsavel: texto(linha[1]) || 'Não informado',
      data: dataUTC(linha[2]) || dataUTC(new Date()),
      cliente: cliente || '(NÃO INFORMADO NO LEGADO)',
      nf: texto(linha[4]),
      garantia: marcado(linha[5]),
      italiaAjuda: marcado(linha[12]),
      equipamentoCategoria,
      serie: texto(linha[8]),
      assunto: assunto || '(sem descrição informada no legado)',
      acoesRealizadas: texto(linha[10]),
      situacao,
      orcamentoStatus,
      dataFechamento: situacao === 'RESOLVIDO' ? dataUTC(linha[11]) : null,
    });
  }
  return registros;
}

async function main() {
  const daPlanilha = lerChamados();
  const doBanco = await prisma.chamado.findMany();
  const porNumero = new Map(doBanco.map((c) => [c.numero, c]));

  // Assinatura de conteúdo (cliente+data+assunto) para não recriar como "novo" um chamado
  // que já existe no banco sob outro número (acontece com os duplicados renumerados do
  // legado, cujo número final muda conforme a planilha cresce entre uma sincronização e outra).
  const assinatura = (c) => `${(c.cliente || '').trim().toUpperCase()}|${c.data ? new Date(c.data).toISOString().slice(0, 10) : ''}|${(c.assunto || '').trim().toUpperCase()}`;
  const assinaturasNoBanco = new Set(doBanco.map(assinatura));

  const novos = [];
  const atualizados = [];
  const puladosPorJaTrabalhados = [];
  const possiveisDuplicatas = [];
  let semMudanca = 0;

  for (const r of daPlanilha) {
    const existente = porNumero.get(r.numero);
    if (!existente) {
      if (assinaturasNoBanco.has(assinatura(r))) {
        possiveisDuplicatas.push(r.numero);
        continue;
      }
      novos.push(r);
      continue;
    }

    // Já foi trabalhado no app (tem número/data de envio/valor de orçamento preenchido) —
    // não mexe em situação/orçamento pra não desfazer uma decisão manual.
    const jaTrabalhado = existente.numeroOrcamento || existente.dataEnvioOrcamento || existente.valorOrcamento;

    const dados = jaTrabalhado
      ? { ...r, situacao: existente.situacao, orcamentoStatus: existente.orcamentoStatus, dataFechamento: existente.dataFechamento }
      : r;

    const mudou =
      existente.cliente !== dados.cliente ||
      existente.nf !== dados.nf ||
      existente.garantia !== dados.garantia ||
      existente.italiaAjuda !== dados.italiaAjuda ||
      existente.equipamentoCategoria !== dados.equipamentoCategoria ||
      existente.serie !== dados.serie ||
      existente.assunto !== dados.assunto ||
      existente.acoesRealizadas !== dados.acoesRealizadas ||
      existente.situacao !== dados.situacao ||
      existente.orcamentoStatus !== dados.orcamentoStatus ||
      !mesmaData(existente.dataFechamento, dados.dataFechamento);

    if (!mudou) { semMudanca += 1; continue; }

    if (jaTrabalhado) puladosPorJaTrabalhados.push(r.numero);
    atualizados.push({ id: existente.id, ...dados });
  }

  console.log(`\n=== ATUALIZAÇÃO CHAMADOS (${COMMIT ? 'MODO COMMIT' : 'DRY-RUN, nada será gravado'}) ===\n`);
  console.log(`Registros na planilha: ${daPlanilha.length}`);
  console.log(`Novos (serão criados): ${novos.length}`);
  if (possiveisDuplicatas.length) {
    console.log(`Ignorados por já existir um chamado igual no banco (número diferente, provável renumeração de duplicata do legado): ${possiveisDuplicatas.join(', ')}`);
  }
  console.log(`Sem mudança: ${semMudanca}`);
  console.log(`Serão atualizados: ${atualizados.length}`);
  if (puladosPorJaTrabalhados.length) {
    console.log(`  (destes, ${puladosPorJaTrabalhados.length} já têm dados de orçamento preenchidos no app — situação/orçamento preservados: ${puladosPorJaTrabalhados.join(', ')})`);
  }

  if (novos.length) {
    console.log('\nExemplos de novos chamados:');
    novos.slice(0, 5).forEach((n) => console.log(`  ${n.numero} - ${n.cliente} - ${n.assunto}`));
  }

  if (!COMMIT) {
    console.log('\nRevise o relatório acima. Para gravar de verdade, rode:');
    console.log('  node scripts/atualizar-chamados.js --commit\n');
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (novos.length) await tx.chamado.createMany({ data: novos });
    for (const a of atualizados) {
      const { id, ...dados } = a;
      await tx.chamado.update({ where: { id }, data: dados });
    }

    if (novos.length) {
      const maiorSequencia = Math.max(...daPlanilha.map((c) => parseInt(c.numero.split('/')[1], 10)));
      const ano = parseInt(daPlanilha[0].numero.split('/')[0], 10);
      const contadorAtual = await tx.contadorChamado.findUnique({ where: { ano } });
      if (!contadorAtual || contadorAtual.ultimo < maiorSequencia) {
        await tx.contadorChamado.upsert({
          where: { ano },
          create: { ano, ultimo: maiorSequencia },
          update: { ultimo: maiorSequencia },
        });
      }
    }
  });

  console.log(`\n✔ ${novos.length} criados, ${atualizados.length} atualizados.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
