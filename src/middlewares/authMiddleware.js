const jwt = require('jsonwebtoken');
require('dotenv').config();

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ status: false, message: 'No autorizado.' });
  }

  if (!process.env.APP_JWT_SECRET) {
    return res.status(500).json({
      status: false,
      message: 'Falta APP_JWT_SECRET en variables de entorno.',
    });
  }

  try {
    req.user = jwt.verify(token, process.env.APP_JWT_SECRET);
    return next();
  } catch (error) {
    return res.status(401).json({ status: false, message: 'Token invalido o expirado.' });
  }
};

module.exports = {
  requireAuth,
};
