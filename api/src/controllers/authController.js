const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const PERFIS = ['ALUNO', 'PERSONAL'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function gerarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, perfil: usuario.tipo_perfil },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// POST /auth/register
exports.registrar = async (req, res, next) => {
  try {
    const { nome, email, senha, perfil } = req.body;

    if (!nome || !email || !senha || !perfil) {
      return res.status(400).json({ erro: 'Informe nome, e-mail, senha e perfil.' });
    }
    if (!PERFIS.includes(perfil)) {
      return res.status(400).json({ erro: 'Perfil inválido.' });
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ erro: 'E-mail inválido.' });
    }
    if (senha.length < 6) {
      return res.status(400).json({ erro: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const { rows } = await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, tipo_perfil)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nome, email, tipo_perfil, cref, data_cadastro`,
      [nome.trim(), email.trim().toLowerCase(), senhaHash, perfil]
    );

    const usuario = rows[0];
    res.status(201).json({ token: gerarToken(usuario), usuario });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Este e-mail já está cadastrado.' });
    }
    next(err);
  }
};

// POST /auth/login
exports.login = async (req, res, next) => {
  try {
    const { email, senha, perfil } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ erro: 'Informe e-mail e senha.' });
    }

    const { rows } = await pool.query(
      `SELECT id, nome, email, senha_hash, tipo_perfil, cref, data_cadastro
         FROM usuarios WHERE email = $1`,
      [email.trim().toLowerCase()]
    );

    const usuario = rows[0];
    const senhaOk = usuario ? await bcrypt.compare(senha, usuario.senha_hash) : false;

    // Mesma mensagem para "e-mail não existe" e "senha errada"
    if (!senhaOk) {
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }

    // O tipo de conta verdadeiro vem do banco, não do que o usuário marcou
    if (perfil && perfil !== usuario.tipo_perfil) {
      const real = usuario.tipo_perfil === 'PERSONAL' ? 'Personal' : 'Aluno';
      return res.status(403).json({ erro: `Esta conta é de ${real}. Selecione o tipo correto.` });
    }

    delete usuario.senha_hash;
    res.json({ token: gerarToken(usuario), usuario });
  } catch (err) {
    next(err);
  }
};