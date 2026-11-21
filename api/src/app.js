const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const alertasRoutes = require('./routes/alertas.routes');
const sessoesRoutes = require('./routes/sessoes.routes');
const autenticar = require('./middlewares/auth');
const errorHandler = require('./middlewares/errorHandler');
const alunosRoutes = require('./routes/alunos.routes');
const perfilRoutes = require('./routes/perfil.routes');

const app = express();

app.use(cors());
app.use(express.json());

// Rota de teste (para conferir se a API está acessível pelo celular)
app.get('/', (req, res) => res.json({ ok: true }));

// Pública: cadastro e login
app.use('/auth', authRoutes);

// Protegidas: exigem o token de login
app.use('/alertas', autenticar, alertasRoutes);
app.use('/sessoes', autenticar, sessoesRoutes);
app.use('/alunos', autenticar, alunosRoutes);
app.use('/perfil', autenticar, perfilRoutes);

// Rota inexistente
app.use((req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada' });
});

// O errorHandler sempre por último
app.use(errorHandler);

module.exports = app;