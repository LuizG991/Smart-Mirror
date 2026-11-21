const pool = require('../config/db');

// Campo do filtro escolhido entre duas opções fixas (nunca vem do usuário)
const campoDoPerfil = (perfil) => (perfil === 'PERSONAL' ? 's.personal_id' : 's.aluno_id');

// GET /sessoes
exports.listar = async (req, res, next) => {
  try {
    const campo = campoDoPerfil(req.usuario.perfil);
    const { rows } = await pool.query(
      `SELECT s.id,
              TO_CHAR(s.data_sessao, 'YYYY-MM-DD')   AS data_sessao,
              TO_CHAR(s.horario_agendado, 'HH24:MI') AS horario,
              s.status,
              a.nome AS aluno,
              p.nome AS personal
         FROM sessoes_treino s
         JOIN usuarios a ON a.id = s.aluno_id
         JOIN usuarios p ON p.id = s.personal_id
        WHERE ${campo} = $1
        ORDER BY s.data_sessao DESC, s.horario_agendado`,
      [req.usuario.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

// GET /sessoes/hoje
exports.hoje = async (req, res, next) => {
  try {
    const campo = campoDoPerfil(req.usuario.perfil);
    const { rows } = await pool.query(
      `SELECT s.id,
              a.nome AS aluno_nome,
              TO_CHAR(s.horario_agendado, 'HH24:MI') AS horario,
              s.status,
              COALESCE(string_agg(DISTINCT e.nome, ' + '), 'Sem exercícios') AS exercicios
         FROM sessoes_treino s
         JOIN usuarios a ON a.id = s.aluno_id
         LEFT JOIN monitoramento_ao_vivo m ON m.sessao_id = s.id
         LEFT JOIN exercicios e            ON e.id = m.exercicio_id
        WHERE ${campo} = $1
          AND s.data_sessao = CURRENT_DATE
        GROUP BY s.id, a.nome
        ORDER BY s.horario_agendado`,
      [req.usuario.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

// GET /sessoes/:id/monitoramento
exports.monitoramento = async (req, res, next) => {
  try {
    const campo = campoDoPerfil(req.usuario.perfil);
    const { rows } = await pool.query(
      `SELECT m.*, e.nome AS exercicio
         FROM monitoramento_ao_vivo m
         JOIN sessoes_treino s ON s.id = m.sessao_id
         JOIN exercicios e     ON e.id = m.exercicio_id
        WHERE m.sessao_id = $1 AND ${campo} = $2`,
      [req.params.id, req.usuario.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};