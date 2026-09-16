const path = require('path');
const fs = require('fs');
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const { unzip, zip } = require('../lib/zipUtil');

const router = express.Router();
router.use(requireAuth);

// Nomes exatamente iguais aos arquivos em backend/templates/rme/*.docx
const EQUIPAMENTOS_RME = [
  'BALANCEADORA', 'BALANCEADORA LINHA PESADA', 'BLACK TECH', 'DESMONTADORA',
  'DESMONTADORA LINHA PESADA', 'ELEVADOR ELETRO HIDRAULICO', 'ELEVADOR PANTOGRAFICO',
  'EXACT 70', 'EXACT LINEAR', 'PARTNER 70', 'RAMPA', 'RAMPA PANTOGRAFICO',
  'RECICLADORA DE AR', 'RETIFICADORA',
];

const rmeSchema = z.object({
  nf: z.string().min(1),
  cliente: z.string().min(1),
  representante: z.string().optional().nullable(),
  tecnico: z.string().optional().nullable(),
  valor: z.coerce.number().optional().nullable(),
  relatorio: z.string().optional().nullable(),
  rmeData: z.coerce.date().optional().nullable(),
  retornoData: z.coerce.date().optional().nullable(),
  montagemData: z.coerce.date().optional().nullable(),
  montador: z.string().optional().nullable(),
  valorPago: z.coerce.number().optional().nullable(),
  equipamento: z.enum(EQUIPAMENTOS_RME).optional().nullable(),
  modelo: z.string().optional().nullable(),
  numeroSerie: z.string().optional().nullable(),
  dataNota: z.coerce.date().optional().nullable(),
  cancelado: z.boolean().optional().default(false),
});

function statusDerivado(rme) {
  if (rme.cancelado) return 'CANCELADO';
  if (rme.montagemData) return 'CONCLUIDO';
  if (rme.retornoData) return 'AGUARDANDO_INSTALACAO';
  return 'SEM_RETORNO';
}

function comStatus(rme) {
  return { ...rme, status: statusDerivado(rme) };
}

router.get('/', async (req, res) => {
  const { status, q, page = '1', pageSize = '50' } = req.query;
  const where = {};
  if (q) {
    where.OR = [
      { cliente: { contains: q, mode: 'insensitive' } },
      { nf: { contains: q, mode: 'insensitive' } },
    ];
  }

  const take = Math.min(parseInt(pageSize, 10) || 50, 200);
  const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

  const [itens, total] = await Promise.all([
    prisma.rme.findMany({ where, orderBy: { criadoEm: 'desc' }, take, skip }),
    prisma.rme.count({ where }),
  ]);

  let itensComStatus = itens.map(comStatus);
  if (status) itensComStatus = itensComStatus.filter((r) => r.status === status);

  res.json({ itens: itensComStatus, total, page: Number(page), pageSize: take });
});

router.post('/', async (req, res) => {
  const parsed = rmeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos.', detalhes: parsed.error.flatten() });

  const rme = await prisma.rme.create({ data: parsed.data });
  res.status(201).json(comStatus(rme));
});

router.put('/:id', async (req, res) => {
  const parsed = rmeSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos.', detalhes: parsed.error.flatten() });

  const rme = await prisma.rme.update({ where: { id: req.params.id }, data: parsed.data }).catch(() => null);
  if (!rme) return res.status(404).json({ erro: 'RME não encontrado.' });
  res.json(comStatus(rme));
});

router.get('/equipamentos-formulario', (req, res) => {
  res.json(EQUIPAMENTOS_RME);
});

function fmtDataBr(d) {
  if (!d) return '';
  const dt = new Date(d);
  const dia = String(dt.getUTCDate()).padStart(2, '0');
  const mes = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${dt.getUTCFullYear()}`;
}

function escaparXml(texto) {
  return String(texto).replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  }[c]));
}

router.get('/:id/formulario', async (req, res) => {
  const rme = await prisma.rme.findUnique({ where: { id: req.params.id } });
  if (!rme) return res.status(404).json({ erro: 'RME não encontrado.' });
  if (!rme.equipamento) return res.status(400).json({ erro: 'Defina o equipamento do RME antes de gerar o formulário.' });

  const caminhoTemplate = path.join(__dirname, '../../templates/rme', `${rme.equipamento}.docx`);
  if (!fs.existsSync(caminhoTemplate)) {
    return res.status(400).json({ erro: `Não há template de formulário para "${rme.equipamento}".` });
  }

  const arquivos = unzip(fs.readFileSync(caminhoTemplate));
  let documentXml = arquivos['word/document.xml'].toString('utf8');

  const valores = {
    '{{CLIENTE}}': rme.cliente || '',
    '{{MODELO}}': rme.modelo || '',
    '{{SERIE}}': rme.numeroSerie || '',
    '{{NF}}': rme.nf || '',
    '{{DATA}}': fmtDataBr(rme.dataNota),
  };
  for (const [chave, valor] of Object.entries(valores)) {
    documentXml = documentXml.split(chave).join(escaparXml(valor));
  }
  arquivos['word/document.xml'] = Buffer.from(documentXml, 'utf8');

  const saida = zip(arquivos);
  const nomeArquivo = `RME ${rme.equipamento} - ${rme.cliente}.docx`.replace(/[\\/:*?"<>|]/g, '');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(nomeArquivo)}"`);
  res.send(saida);
});

router.delete('/:id', async (req, res) => {
  if (req.user.papel !== 'ADMIN') return res.status(403).json({ erro: 'Somente Admin pode excluir.' });
  await prisma.rme.delete({ where: { id: req.params.id } }).catch(() => null);
  res.json({ ok: true });
});

module.exports = router;
