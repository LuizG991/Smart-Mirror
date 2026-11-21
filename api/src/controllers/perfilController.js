const pool = require('../config/db');

const CAMPOS = ['notificacoes_erro', 'vibrar_alerta', 'som_alerta'];

function apenasPersonal(req, res) {
  if (req.usuario.perfil !== 'PERSONAL') {
    res.status(403).json({ erro: 'Disponível apenas para personais.' });
    return false;
  }
  return true;
}

// GET /perfil/resumo
exports.resumo = async (req, res, next) => {
  try {
    if (!apenasPersonal(req, res)) return;

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS sessoes_mes
         FROM sessoes_treino
        WHERE personal_id = $1
          AND data_sessao >= DATE_TRUNC('month', CURRENT_DATE)::date
          AND data_sessao <  (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::date`,
      [req.usuario.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

// GET /perfil/configuracoes
exports.obterConfiguracoes = async (req, res, next) => {
  try {
    if (!apenasPersonal(req, res)) return;

    // Cria a linha com os valores padrão se for o primeiro acesso
    await pool.query(
      `INSERT INTO configuracoes_personal (personal_id)
       VALUES ($1)
       ON CONFLICT (personal_id) DO NOTHING`,
      [req.usuario.id]
    );

    const { rows } = await pool.query(
      `SELECT notificacoes_erro, vibrar_alerta, som_alerta
         FROM configuracoes_personal
        WHERE personal_id = $1`,
      [req.usuario.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

// PUT /perfil/configuracoes
exports.salvarConfiguracoes = async (req, res, next) => {
  try {
    if (!apenasPersonal(req, res)) return;

    for (const campo of CAMPOS) {
      if (typeof req.body[campo] !== 'boolean') {
        return res.status(400).json({ erro: `O campo ${campo} deve ser verdadeiro ou falso.` });
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO configuracoes_personal
              (personal_id, notificacoes_erro, vibrar_alerta, som_alerta)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (personal_id) DO UPDATE
          SET notificacoes_erro = EXCLUDED.notificacoes_erro,
              vibrar_alerta     = EXCLUDED.vibrar_alerta,
              som_alerta        = EXCLUDED.som_alerta
       RETURNING notificacoes_erro, vibrar_alerta, som_alerta`,
      [
        req.usuario.id,
        req.body.notificacoes_erro,
        req.body.vibrar_alerta,
        req.body.som_alerta,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

// GET /perfil/aluno  (só Aluno): dados do próprio aluno logado
exports.meuPerfilAluno = async (req, res, next) => {
  try {
    if (req.usuario.perfil !== 'ALUNO') {
      return res.status(403).json({ erro: 'Disponível apenas para alunos.' });
    }
    const { rows } = await pool.query(
      `SELECT u.id,
              u.nome,
              u.email,
              ap.objetivo,
              ap.plano,
              DATE_PART('year', AGE(ap.data_nascimento))::int AS idade,
              ap.vaga_monitor AS vaga,
              p.nome AS personal_nome,
              p.cref AS personal_cref,
              (SELECT COUNT(*)::int FROM sessoes_treino st WHERE st.aluno_id = u.id) AS total_sessoes
         FROM usuarios u
         LEFT JOIN alunos_perfil ap ON ap.usuario_id = u.id
         LEFT JOIN usuarios p       ON p.id = ap.personal_id
        WHERE u.id = $1`,
      [req.usuario.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};
