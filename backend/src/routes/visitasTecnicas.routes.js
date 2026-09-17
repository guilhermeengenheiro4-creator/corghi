const path = require('path');
const fs = require('fs');
const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const { unzip, zip } = require('../lib/zipUtil');

const router = express.Router();
router.use(requireAuth);

const treinamentoSchema = z.object({
  nome: z.string().optional().default(''),
  rg: z.string().optional().default(''),
});

const visitaSchema = z.object({
  representante: z.string().optional().nullable(),
  cliente: z.string().min(1),
  nomeFantasia: z.string().optional().nullable(),
  nf: z.string().optional().nullable(),
  data: z.coerce.date().optional().nullable(),
  contato: z.string().optional().nullable(),
  telefone: z.string().optional().nullable(),
  celular: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  horaInicio: z.string().optional().nullable(),
  dataInicio: z.coerce.date().optional().nullable(),
  equipamentoCategoria: z.enum(['ALINHADORA', 'BALANCEADORA', 'DESMONTADORA', 'RAMPA', 'ELEVADOR', 'RECICLADORA', 'RETIFICADORA', 'OUTROS']),
  modelo: z.string().optional().nullable(),
  numeroSerie: z.string().optional().nullable(),
  treinamentos: z.array(treinamentoSchema).optional().default([]),
  horaTermino: z.string().optional().nullable(),
  dataTermino: z.coerce.date().optional().nullable(),
  parecerCliente: z.string().optional().nullable(),
  tecnicoResponsavel: z.string().optional().nullable(),
  dataAssinatura: z.coerce.date().optional().nullable(),
});

router.get('/', async (req, res) => {
  const { q, page = '1', pageSize = '50' } = req.query;
  const where = {};
  if (q) {
    where.OR = [
      { cliente: { contains: q, mode: 'insensitive' } },
      { nf: { contains: q, mode: 'insensitive' } },
      { numeroSerie: { contains: q, mode: 'insensitive' } },
    ];
  }

  const take = Math.min(parseInt(pageSize, 10) || 50, 200);
  const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

  const [itens, total] = await Promise.all([
    prisma.visitaTecnica.findMany({ where, orderBy: { criadoEm: 'desc' }, take, skip }),
    prisma.visitaTecnica.count({ where }),
  ]);

  res.json({ itens, total, page: Number(page), pageSize: take });
});

router.get('/:id', async (req, res) => {
  const visita = await prisma.visitaTecnica.findUnique({ where: { id: req.params.id } });
  if (!visita) return res.status(404).json({ erro: 'Visita não encontrada.' });
  res.json(visita);
});

router.post('/', async (req, res) => {
  const parsed = visitaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos.', detalhes: parsed.error.flatten() });

  const visita = await prisma.visitaTecnica.create({ data: parsed.data });
  res.status(201).json(visita);
});

router.put('/:id', async (req, res) => {
  const parsed = visitaSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ erro: 'Dados inválidos.', detalhes: parsed.error.flatten() });

  const visita = await prisma.visitaTecnica.update({ where: { id: req.params.id }, data: parsed.data }).catch(() => null);
  if (!visita) return res.status(404).json({ erro: 'Visita não encontrada.' });
  res.json(visita);
});

router.delete('/:id', async (req, res) => {
  if (req.user.papel !== 'ADMIN') return res.status(403).json({ erro: 'Somente Admin pode excluir.' });
  await prisma.visitaTecnica.delete({ where: { id: req.params.id } }).catch(() => null);
  res.json({ ok: true });
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

router.get('/:id/relatorio', async (req, res) => {
  const visita = await prisma.visitaTecnica.findUnique({ where: { id: req.params.id } });
  if (!visita) return res.status(404).json({ erro: 'Visita não encontrada.' });

  const nomeTemplate = visita.equipamentoCategoria === 'ALINHADORA' ? 'ALINHADORA' : 'OUTROS';
  const caminhoTemplate = path.join(__dirname, '../../templates/rmt', `${nomeTemplate}.docx`);
  if (!fs.existsSync(caminhoTemplate)) {
    return res.status(400).json({ erro: `Não há template de RMT para "${visita.equipamentoCategoria}".` });
  }

  const arquivos = unzip(fs.readFileSync(caminhoTemplate));
  let documentXml = arquivos['word/document.xml'].toString('utf8');

  const treinamentos = Array.isArray(visita.treinamentos) ? visita.treinamentos : [];

  const valores = {
    '{{REPRESENTANTE}}': visita.representante || '',
    '{{CLIENTE}}': visita.cliente || '',
    '{{NOME_FANTASIA}}': visita.nomeFantasia || '',
    '{{NF}}': visita.nf || '',
    '{{DATA}}': fmtDataBr(visita.data),
    '{{CONTATO}}': visita.contato || '',
    '{{TEL}}': visita.telefone || '',
    '{{CEL}}': visita.celular || '',
    '{{EMAIL}}': visita.email || '',
    '{{HORA_INICIO}}': visita.horaInicio || '',
    '{{DATA_INICIO}}': fmtDataBr(visita.dataInicio),
    '{{EQUIPAMENTO}}': visita.equipamentoCategoria || '',
    '{{MODELO}}': visita.modelo || '',
    '{{SERIE}}': visita.numeroSerie || '',
    '{{HORA_TERMINO}}': visita.horaTermino || '',
    '{{DATA_TERMINO}}': fmtDataBr(visita.dataTermino),
    '{{PARECER_CLIENTE}}': visita.parecerCliente || '',
    '{{TECNICO_RESPONSAVEL}}': visita.tecnicoResponsavel || '',
    '{{DATA_ASSINATURA}}': fmtDataBr(visita.dataAssinatura),
  };
  for (let i = 1; i <= 4; i += 1) {
    const t = treinamentos[i - 1] || {};
    valores[`{{TREINO${i}_NOME}}`] = t.nome || '';
    valores[`{{TREINO${i}_RG}}`] = t.rg || '';
  }

  for (const [chave, valor] of Object.entries(valores)) {
    documentXml = documentXml.split(chave).join(escaparXml(valor));
  }
  arquivos['word/document.xml'] = Buffer.from(documentXml, 'utf8');

  const saida = zip(arquivos);
  const nomeArquivo = `RMT ${visita.equipamentoCategoria} - ${visita.cliente}.docx`.replace(/[\\/:*?"<>|]/g, '');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(nomeArquivo)}"`);
  res.send(saida);
});

module.exports = router;
