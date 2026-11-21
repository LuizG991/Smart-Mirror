require('dotenv').config();   // precisa ser a primeira linha

const app = require('./src/app');
const migrar = require('./src/config/migrar');

const PORT = process.env.PORT || 3000;

// Ajusta o banco (se preciso) antes de aceitar requisições
migrar()
  .catch((err) => console.warn('Aviso: não foi possível preparar o banco:', err.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`API rodando em http://localhost:${PORT}`);
    });
  });
