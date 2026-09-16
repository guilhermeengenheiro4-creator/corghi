const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ erro: 'Não autenticado.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    // Login "TV" (tela do escritório) é só leitura — nunca deve alterar dados.
    if (payload.papel === 'TV' && req.method !== 'GET') {
      return res.status(403).json({ erro: 'Login de TV é somente leitura.' });
    }
    next();
  } catch {
    return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.papel !== 'ADMIN') {
    return res.status(403).json({ erro: 'Acesso restrito ao Admin.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
