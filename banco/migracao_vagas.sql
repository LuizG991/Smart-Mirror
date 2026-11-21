-- Opcional: a API já faz isto sozinha ao abrir (api/src/config/migrar.js).
-- Use só se quiser aplicar a mudança manualmente em um banco que já existe.
-- Seguro para banco com dados: apenas ADICIONA a coluna vaga_monitor.

ALTER TABLE alunos_perfil
  ADD COLUMN IF NOT EXISTS vaga_monitor SMALLINT CHECK (vaga_monitor BETWEEN 1 AND 3);

CREATE UNIQUE INDEX IF NOT EXISTS alunos_perfil_vaga_unica
  ON alunos_perfil (personal_id, vaga_monitor) WHERE vaga_monitor IS NOT NULL;

-- Coloca os alunos que já existem nas vagas 1, 2 e 3 de cada personal (por ordem de nome),
-- somente para quem ainda não tem vaga e só se o personal ainda não usa nenhuma vaga.
UPDATE alunos_perfil ap
   SET vaga_monitor = x.rn
  FROM (SELECT a.usuario_id,
               ROW_NUMBER() OVER (PARTITION BY a.personal_id ORDER BY u.nome, u.id) AS rn
          FROM alunos_perfil a
          JOIN usuarios u ON u.id = a.usuario_id
         WHERE a.personal_id IS NOT NULL) x
 WHERE ap.usuario_id = x.usuario_id
   AND ap.vaga_monitor IS NULL
   AND x.rn <= 3
   AND NOT EXISTS (SELECT 1 FROM alunos_perfil o
                    WHERE o.personal_id = ap.personal_id AND o.vaga_monitor IS NOT NULL);
