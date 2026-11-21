const pool = require('../config/db');

const SEVERIDADES = ['warn', 'danger'];

// GET /alertas
// Personal vê os alertas das sessões que ele conduz; aluno vê os dos próprios treinos.
exports.listar = async (req, res, next) => {
  try {
    const { id, perfil } = req.usuario;
    // Valor escolhido entre duas opções fixas (nunca vem do usuário)
    const filtro = perfil === 'PERSONAL' ? 's.personal_id' : 's.aluno_id';

    const { rows } = await pool.query(
      `SELECT al.id,
              al.titulo_erro,
              al.detalhes_sensor,
              al.risco_lesao,
              al.severidade,
              al.status_alerta,
              al.data_hora_alerta,
              s.aluno_id,
              u.nome AS aluno_nome,
              e.nome AS exercicio
         FROM alertas al
         JOIN monitoramento_ao_vivo m ON m.id = al.monitoramento_id
         JOIN sessoes_treino s        ON s.id = m.sessao_id
         JOIN usuarios u              ON u.id = s.aluno_id
         JOIN exercicios e            ON e.id = m.exercicio_id
        WHERE ${filtro} = $1
        ORDER BY al.data_hora_alerta DESC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

// POST /alertas
exports.criar = async (req, res, next) => {
  try {
    const {
      monitoramento_id,
      titulo_erro,
      detalhes_sensor,
      risco_lesao,
      severidade = 'warn',
    } = req.body;

    if (!monitoramento_id || !titulo_erro || !detalhes_sensor) {
      return res.status(400).json({
        erro: 'Campos obrigatórios: monitoramento_id, titulo_erro, detalhes_sensor',
      });
    }
    if (!SEVERIDADES.includes(severidade)) {
      return res.status(400).json({ erro: 'Severidade inválida (use "warn" ou "danger").' });
    }

    // Só quem participa da sessão pode criar alerta nela
    const participa = await pool.query(
      `SELECT 1
         FROM monitoramento_ao_vivo m
         JOIN sessoes_treino s ON s.id = m.sessao_id
        WHERE m.id = $1 AND (s.personal_id = $2 OR s.aluno_id = $2)`,
      [monitoramento_id, req.usuario.id]
    );
    if (participa.rowCount === 0) {
      return res.status(403).json({ erro: 'Monitoramento não encontrado para este usuário.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO alertas
         (monitoramento_id, titulo_erro, detalhes_sensor, risco_lesao, severidade)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [monitoramento_id, titulo_erro, detalhes_sensor, risco_lesao || null, severidade]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
};

// PATCH /alertas/:id/resolver
exports.resolver = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE alertas al
          SET status_alerta = 'RESOLVIDO'
         FROM monitoramento_ao_vivo m
         JOIN sessoes_treino s ON s.id = m.sessao_id
        WHERE al.id = $1
          AND m.id = al.monitoramento_id
          AND s.personal_id = $2
        RETURNING al.id, al.status_alerta, al.monitoramento_id`,
      [req.params.id, req.usuario.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Alerta não encontrado.' });
    }

    // Sem alertas pendentes nesse monitoramento, o aluno volta ao status "Correto"
    await pool.query(
      `UPDATE monitoramento_ao_vivo
          SET status_execucao = 'Correto'
        WHERE id = $1
          AND NOT EXISTS (
                SELECT 1 FROM alertas
                 WHERE monitoramento_id = $1 AND status_alerta = 'PENDENTE')`,
      [rows[0].monitoramento_id]
    );

    res.json({ id: rows[0].id, status_alerta: rows[0].status_alerta });
  } catch (err) {
    next(err);
  }
};