const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const googleClient = new OAuth2Client(process.env.GOOGLE_WEB_CLIENT_ID );

const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential || typeof credential !== 'string') {
      return res.status(400).json({
        status: false,
        message: 'Debes enviar credential (Google ID token).',
      });
    }

    const audience = process.env.GOOGLE_WEB_CLIENT_ID ;
    if (!audience) {
      return res.status(500).json({
        status: false,
        message: 'Falta GOOGLE_WEB_CLIENT_ID en variables de entorno.',
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
      return res.status(401).json({ status: false, message: 'Token de Google invalido.' });
    }

    if (!process.env.APP_JWT_SECRET) {
      return res.status(500).json({
        status: false,
        message: 'Falta APP_JWT_SECRET en variables de entorno.',
      });
    }

    const appToken = jwt.sign(
      {
        sub: payload.sub,
        email: payload.email,
        name: payload.name || '',
        picture: payload.picture || '',
      },
      process.env.APP_JWT_SECRET,
      { expiresIn: '12h' }
    );

    return res.status(200).json({
      status: true,
      token: appToken,
      user: {
        email: payload.email,
        name: payload.name || '',
        picture: payload.picture || '',
      },
    });
  } catch (error) {
    console.error('Error en autenticacion Google:', error);
    return res.status(401).json({
      status: false,
      message: 'No fue posible validar el token de Google.',
    });
  }
};

module.exports = {
  googleLogin,
};
