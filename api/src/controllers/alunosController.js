const pool = require('../config/db');
const PLANOS = ['Básico', 'Pro', 'Elite'];

// Confere AAAA-MM-DD, que a data existe e que não é futura
function dataValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto && d <= new Date();
}

// Primeira vaga (1 a 3) do personal que ainda não tem aluno; null se as três estiverem ocupadas
async function primeiraVagaLivre(personalId) {
  const { rows } = await pool.query(
    'SELECT vaga_monitor FROM alunos_perfil WHERE personal_id = $1 AND vaga_monitor IS NOT NULL',
    [personalId]
  );
  const usadas = new Set(rows.map((r) => r.vaga_monitor));
  return [1, 2, 3].find((v) => !usadas.has(v)) ?? null;
}

// GET /alunos  (só Personal)
// Cada aluno vem com o status do exercício em andamento, se houver.
exports.listar = async (req, res, next) => {
  try {
    if (req.usuario.perfil !== 'PERSONAL') {
      return res.status(403).json({ erro: 'Apenas personais acessam a lista de alunos.' });
    }

    const { rows } = await pool.query(
      `SELECT u.id,
              u.nome,
              ap.objetivo,
              ap.plano,
              ap.vaga_monitor AS vaga,
              DATE_PART('year', AGE(ap.data_nascimento))::int AS idade,
              ao_vivo.exercicio,
              ao_vivo.series_totais,
              ao_vivo.reps_alvo,
              ao_vivo.reps_atuais,
              ao_vivo.status_execucao,
              TO_CHAR(ult.data_sessao, 'YYYY-MM-DD')      AS ultima_sessao_data,
              TO_CHAR(ult.horario_agendado, 'HH24:MI')    AS ultima_sessao_horario,
              (SELECT COUNT(*)::int
                 FROM sessoes_treino st
                WHERE st.aluno_id = u.id AND st.personal_id = ap.personal_id) AS total_sessoes
         FROM alunos_perfil ap
         JOIN usuarios u ON u.id = ap.usuario_id
         LEFT JOIN LATERAL (
              SELECT e.nome AS exercicio, m.series_totais, m.reps_alvo,
                     m.reps_atuais, m.status_execucao
                FROM monitoramento_ao_vivo m
                JOIN sessoes_treino s ON s.id = m.sessao_id
                JOIN exercicios e     ON e.id = m.exercicio_id
               WHERE s.aluno_id = u.id
                 AND s.personal_id = ap.personal_id
                 AND s.status = 'em_andamento'
               ORDER BY m.data_atualizacao DESC
               LIMIT 1
         ) ao_vivo ON TRUE
         LEFT JOIN LATERAL (
              SELECT s.data_sessao, s.horario_agendado
                FROM sessoes_treino s
               WHERE s.aluno_id = u.id AND s.personal_id = ap.personal_id
               ORDER BY s.data_sessao DESC, s.horario_agendado DESC NULLS LAST
               LIMIT 1
         ) ult ON TRUE
        WHERE ap.personal_id = $1
        ORDER BY u.nome`,
      [req.usuario.id]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
};
// POST /alunos  (só Personal): vincula um aluno já cadastrado, pelo e-mail
exports.vincular = async (req, res, next) => {
  try {
    if (req.usuario.perfil !== 'PERSONAL') {
      return res.status(403).json({ erro: 'Apenas personais podem adicionar alunos.' });
    }

    const { email, objetivo, plano = 'Básico', data_nascimento } = req.body;

    if (!email) {
      return res.status(400).json({ erro: 'Informe o e-mail do aluno.' });
    }
    if (!PLANOS.includes(plano)) {
      return res.status(400).json({ erro: 'Plano inválido.' });
    }
    if (data_nascimento && !dataValida(data_nascimento)) {
      return res.status(400).json({ erro: 'Data de nascimento inválida.' });
    }

    const busca = await pool.query(
      'SELECT id, nome, tipo_perfil FROM usuarios WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    const aluno = busca.rows[0];

    if (!aluno || aluno.tipo_perfil !== 'ALUNO') {
      return res.status(404).json({
        erro: 'Nenhum aluno encontrado com esse e-mail. Peça para ele criar uma conta do tipo Aluno.',
      });
    }

    const vinculo = await pool.query(
      'SELECT personal_id FROM alunos_perfil WHERE usuario_id = $1',
      [aluno.id]
    );
    const existente = vinculo.rows[0];
    if (existente && existente.personal_id !== null) {
      const mensagem =
        existente.personal_id === req.usuario.id
          ? 'Este aluno já está na sua lista.'
          : 'Este aluno já está vinculado a outro personal.';
      return res.status(409).json({ erro: mensagem });
    }

    // O aluno novo já entra na primeira vaga livre (Aluno 1, 2 ou 3) da aba Monitorar
    const vaga = await primeiraVagaLivre(req.usuario.id);
    const dados = [aluno.id, req.usuario.id, data_nascimento || null, objetivo?.trim() || null, plano, vaga];

    if (existente) {
      // Aluno registrado que ainda não tinha personal (linha existe, personal_id nulo)
      await pool.query(
        `UPDATE alunos_perfil
            SET personal_id = $2, data_nascimento = $3, objetivo = $4, plano = $5, vaga_monitor = $6
          WHERE usuario_id = $1`,
        dados
      );
    } else {
      await pool.query(
        `INSERT INTO alunos_perfil (usuario_id, personal_id, data_nascimento, objetivo, plano, vaga_monitor)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        dados
      );
    }

    res.status(201).json({ id: aluno.id, nome: aluno.nome, vaga });
  } catch (err) {
    next(err);
  }
};

// GET /alunos/disponiveis  (só Personal): alunos registrados que ainda não têm personal
exports.disponiveis = async (req, res, next) => {
  try {
    if (req.usuario.perfil !== 'PERSONAL') {
      return res.status(403).json({ erro: 'Apenas personais acessam esta lista.' });
    }
    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.email
         FROM usuarios u
         LEFT JOIN alunos_perfil ap ON ap.usuario_id = u.id
        WHERE u.tipo_perfil = 'ALUNO'
          AND (ap.usuario_id IS NULL OR ap.personal_id IS NULL)
        ORDER BY u.nome`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

// PUT /alunos/:id/vaga  (só Personal): coloca o aluno numa vaga (1, 2 ou 3) ou tira da vaga (null).
// Se a vaga já tinha outro aluno, os dois trocam de lugar.
exports.definirVaga = async (req, res, next) => {
  if (req.usuario.perfil !== 'PERSONAL') {
    return res.status(403).json({ erro: 'Apenas personais podem organizar as vagas.' });
  }
  const alunoId = Number(req.params.id);
  const { vaga } = req.body;
  if (!Number.isInteger(alunoId)) {
    return res.status(400).json({ erro: 'Aluno inválido.' });
  }
  if (vaga !== null && ![1, 2, 3].includes(vaga)) {
    return res.status(400).json({ erro: 'Vaga inválida (use 1, 2, 3 ou null).' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const atual = await client.query(
      'SELECT vaga_monitor FROM alunos_perfil WHERE usuario_id = $1 AND personal_id = $2 FOR UPDATE',
      [alunoId, req.usuario.id]
    );
    if (atual.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Aluno não encontrado na sua lista.' });
    }
    const vagaAntiga = atual.rows[0].vaga_monitor;

    await client.query('UPDATE alunos_perfil SET vaga_monitor = NULL WHERE usuario_id = $1', [alunoId]);
    if (vaga !== null) {
      // Quem ocupava a vaga escolhida passa para a vaga antiga (ou fica sem vaga)
      await client.query(
        `UPDATE alunos_perfil SET vaga_monitor = $3
          WHERE personal_id = $1 AND vaga_monitor = $2 AND usuario_id <> $4`,
        [req.usuario.id, vaga, vagaAntiga, alunoId]
      );
      await client.query('UPDATE alunos_perfil SET vaga_monitor = $2 WHERE usuario_id = $1', [alunoId, vaga]);
    }
    await client.query('COMMIT');
    res.json({ id: alunoId, vaga });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
};
