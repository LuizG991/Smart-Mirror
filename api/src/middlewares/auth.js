const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const [tipo, token] = (req.headers.authorization || '').split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ erro: 'Token não informado.' });
  }

  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET); // { id, perfil }
    next();
  } catch {
    res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
};