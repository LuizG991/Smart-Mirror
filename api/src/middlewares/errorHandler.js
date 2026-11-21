function errorHandler(err, req, res, next) {
  console.error(err);

  // Códigos de erro do PostgreSQL
  if (err.code === '23503') {
    return res.status(400).json({ erro: 'Referência inválida: o registro relacionado não existe.' });
  }
  if (err.code === '23505') {
    return res.status(409).json({ erro: 'Já existe um registro com esse valor único.' });
  }
  if (err.code === '22P02') {
    return res.status(400).json({ erro: 'Valor em formato inválido.' });
  }

  res.status(500).json({ erro: 'Erro interno do servidor.' });
}

module.exports = errorHandler;