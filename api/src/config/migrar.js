const pool = require('./db');

// Prepara o banco para a nova coluna "vaga_monitor" (Aluno 1, 2 e 3 da aba Monitorar).
// Roda sozinha ao abrir a API; se a coluna já existe, não faz nada.
module.exports = async function migrar() {
  const jaExiste = await pool.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'alunos_perfil'
        AND column_name = 'vaga_monitor'`
  );
  if (jaExiste.rowCount > 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `ALTER TABLE alunos_perfil
         ADD COLUMN vaga_monitor SMALLINT CHECK (vaga_monitor BETWEEN 1 AND 3)`
    );
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS alunos_perfil_vaga_unica
           ON alunos_perfil (personal_id, vaga_monitor)
        WHERE vaga_monitor IS NOT NULL`
    );
    // Alunos que já existem no banco ocupam as vagas 1, 2 e 3 de cada personal (por ordem de nome)
    await client.query(
      `UPDATE alunos_perfil ap
          SET vaga_monitor = x.rn
         FROM (SELECT a.usuario_id,
                      ROW_NUMBER() OVER (PARTITION BY a.personal_id ORDER BY u.nome, u.id) AS rn
                 FROM alunos_perfil a
                 JOIN usuarios u ON u.id = a.usuario_id
                WHERE a.personal_id IS NOT NULL) x
        WHERE ap.usuario_id = x.usuario_id AND x.rn <= 3`
    );
    await client.query('COMMIT');
    console.log('Banco atualizado: vagas de monitoramento (Aluno 1, 2 e 3) criadas.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};
