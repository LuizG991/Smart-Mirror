const pool = require('../config/db');

// GET /usuarios
// Repare que senha_hash NÃO está no SELECT: nunca envie isso ao front-end.
exports.listar = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, nome, email, tipo_perfil, cref, data_cadastro FROM usuarios ORDER BY id'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};