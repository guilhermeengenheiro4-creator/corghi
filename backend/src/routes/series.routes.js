const express = require('express');
const { requireAuth } = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();
router.use(requireAuth);

// Lookup: técnico digita a série e o sistema preenche NF/cliente/modelo automaticamente.
router.get('/:serie', async (req, res) => {
  const registro = await prisma.serieReferencia.findUnique({ where: { serie: req.params.serie } });
  if (!registro) return res.status(404).json({ erro: 'Série não encontrada na base de referência.' });
  res.json(registro);
});

module.exports = router;
