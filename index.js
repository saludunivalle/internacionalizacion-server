const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();
const sheetRoutes = require('./src/routes/sheet.route');
const authRoutes = require('./src/routes/auth.route');
const { requireAuth } = require('./src/middlewares/authMiddleware');
const app = express();
app.use(bodyParser.json());
app.use(cors());

app.use('/api/auth', authRoutes);
app.use('/api/sheets', requireAuth, sheetRoutes);

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('¡Servidor Express funcionando!');
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});