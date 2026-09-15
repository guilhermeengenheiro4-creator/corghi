const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const { gerarProximoNumero } = require('../utils/numeroChamado');

const router = express.Router();
router.use(requireAuth);

const EQUIPAMENTOS = [
  'ALINHADORA', 'BALANCEADORA', 'DESMONTADORA', 'RAMPA', 'ELEVADOR',
  'RECICLADORA', 'RETIFICADORA', 'OUTROS',
];
const SITUACOES = ['ABERTO', 'ORCAMENTO', 'SEM_RETORNO', 'OUTROS', 'DEVENDO', 'RESOLVIDO'];
const ORCAMENTO_STATUS = ['A_MONTAR', 'ENVIADO', 'APROVADO', 'REPROVADO', 'CANCELADO'];
const SITUACAO_FINANCEIRA = ['NAO_VERIFICADO', 'SEM_PENDENCIA', 'PENDENCIA_ENCONTRADA'];

const chamadoSchema = z.object({
  responsavel: z.string().min(1),
  data: z.coerce.date(),
  cliente: z.string().min(1),
  contato: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  uf: z.string().optional().nullable(),
  nf: z.string().optional().nullable(),
  representante: z.string().optional().nullable(),
  garantia: z.boolean().optional().default(false),
  italiaAjuda: z.boolean().optional().default(false),
  equipamentoCategoria: z.enum(EQUIPAMENTOS),
  modelo: z.string().optional().nullable(),
  serie: z.string().optional().nullable(),
  assunto: z.string().min(1),
  acoesRealizadas: z.string().optional().nullable(),
  conclusao: z.string().optional().nullable(),
  situacao: z.enum(SITUACOES).optional(),
  orcamentoStatus: z.enum(ORCAMENTO_STATUS).optional().nullable(),
  numeroOrcamento: z.string().optional().nullable(),
  dataEnvioOrcamento: z.coerce.date().optional().nullable(),
  valorOrcamento: z.coerce.number().optional().nullable(),
  cnpj: z.string().optional().nullable(),
  situacaoFinanceira: z.enum(SITUACAO_FINANCEIRA).optional(),
});

// Regra: RESOLVIDO fecha automaticamente e preenche dataFechamento.
// REPROVADO/CANCELADO no orçamento encerra o chamado (RESOLVIDO) automaticamente.
// APROVADO volta o chamado para "em andamento" (situacao = OUTROS).
// `existente` é o chamado atual no banco (null na criação) — usado para saber a situação
// efetiva quando a requisição só manda orcamentoStatus (ex.: aba Orçamentos), sem repetir
// o campo situacao.
function aplicarRegrasSituacao(dados, existente) {
  const resultado = { ...dados };
  const situacaoAnterior = existente ? existente.situacao : null;
  const situacaoBase = resultado.situacao !== undefined ? resultado.situacao : situacaoAnterior;

  if (situacaoBase === 'ORCAMENTO' && resultado.orcamentoStatus) {
    if (['REPROVADO', 'CANCELADO'].includes(resultado.orcamentoStatus)) {
      resultado.situacao = 'RESOLVIDO';
    } else if (resultado.orcamentoStatus === 'APROVADO') {
      resultado.situacao = 'OUTROS';
    }
  }

  const situacaoFinal = resultado.situacao !== undefined ? resultado.situacao : situacaoAnterior;
  if (situacaoFinal === 'RESOLVIDO' && situacaoAnterior !== 'RESOLVIDO') {
    resultado.dataFechamento = new Date();
  }
  if (situacaoFinal && situacaoFinal !== 'RESOLVIDO') {
    resultado.dataFechamento = null;
  }
  // orcamentoStatus NÃO é limpo ao sair de ORCAMENTO: fica como histórico da decisão
  // (aprovado/reprovado/etc.), usado na aba Orçamentos mesmo depois do chamado avançar.

  return resultado;
}

router.get('/', async (req, res) => {
  const { situacao, equipamento, uf, q, orcamento, orcamentoStatus, page = '1', pageSize = '50' } = req.query;

  const where = {};
  if (situacao) where.situacao = situacao;
  if (equipamento) where.equipamentoCategoria = equipamento;
  if (uf) where.uf = uf;
  if (orcamento === 'true') where.orcamentoStatus = { not: null };
  if (orcamentoStatus) where.orcamentoStatus = orcamentoStatus;
  if (q) {
    where.OR = [
      { cliente: { contains: q, mode: 'insensitive' } },
      { numero: { contains: q, mode: 'insensitive' } },
      { serie: { contains: q, mode: 'insensitive' } },
      { nf: { contains: q, mode: 'insensitive' } },
    ];
  }

  const take = Math.min(parseInt(pageSize, 10) || 50, 200);
  const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

  const [itens, total] = await Promise.all([
    prisma.chamado.findMany({ where, orderBy: { criadoEm: 'desc' }, take, skip }),
    prisma.chamado.count({ where }),
  ]);

  res.json({ itens, total, page: Number(page), pageSize: take });
});

router.get('/:id', async (req, res) => {
  const chamado = await prisma.chamado.findUnique({ where: { id: req.params.id } });
  if (!chamado) return res.status(404).json({ erro: 'Chamado não encontrado.' });
  res.json(chamado);
});

router.post('/', async (req, res) => {
  const parsed = chamadoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos.', detalhes: parsed.error.flatten() });

  const dados = aplicarRegrasSituacao(parsed.data, null);

  const chamado = await prisma.$transaction(async (tx) => {
    const numero = await gerarProximoNumero(tx);
    return tx.chamado.create({ data: { ...dados, numero } });
  });

  res.status(201).json(chamado);
});

router.put('/:id', async (req, res) => {
  const existente = await prisma.chamado.findUnique({ where: { id: req.params.id } });
  if (!existente) return res.status(404).json({ erro: 'Chamado não encontrado.' });

  const parsed = chamadoSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos.', detalhes: parsed.error.flatten() });

  const dados = aplicarRegrasSituacao(parsed.data, existente);

  const chamado = await prisma.chamado.update({ where: { id: req.params.id }, data: dados });
  res.json(chamado);
});

router.delete('/:id', async (req, res) => {
  if (req.user.papel !== 'ADMIN') return res.status(403).json({ erro: 'Somente Admin pode excluir chamados.' });
  await prisma.chamado.delete({ where: { id: req.params.id } }).catch(() => null);
  res.json({ ok: true });
});

module.exports = router;
