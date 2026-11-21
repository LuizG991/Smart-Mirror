-- Schema RECONSTRUÍDO a partir das consultas SQL da API (nenhum arquivo .sql veio nos zips).
-- Se você já tem o banco "smartmirrordb" funcionando, NÃO rode este arquivo.
-- Usa IF NOT EXISTS, então é seguro rodar mais de uma vez.

CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL PRIMARY KEY,
  nome          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  senha_hash    TEXT NOT NULL,
  tipo_perfil   TEXT NOT NULL CHECK (tipo_perfil IN ('ALUNO','PERSONAL')),
  cref          TEXT,
  data_cadastro TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alunos_perfil (
  usuario_id      INT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  personal_id     INT REFERENCES usuarios(id),
  data_nascimento DATE,
  objetivo        TEXT,
  plano           TEXT NOT NULL DEFAULT 'Básico',
  vaga_monitor    SMALLINT CHECK (vaga_monitor BETWEEN 1 AND 3)  -- Aluno 1, 2 ou 3 da aba Monitorar
);

CREATE UNIQUE INDEX IF NOT EXISTS alunos_perfil_vaga_unica
  ON alunos_perfil (personal_id, vaga_monitor) WHERE vaga_monitor IS NOT NULL;

CREATE TABLE IF NOT EXISTS exercicios (
  id   SERIAL PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS sessoes_treino (
  id               SERIAL PRIMARY KEY,
  aluno_id         INT NOT NULL REFERENCES usuarios(id),
  personal_id      INT NOT NULL REFERENCES usuarios(id),
  data_sessao      DATE NOT NULL DEFAULT CURRENT_DATE,
  horario_agendado TIME,
  status           TEXT NOT NULL DEFAULT 'agendada'   -- usado: 'em_andamento'
);

CREATE TABLE IF NOT EXISTS monitoramento_ao_vivo (
  id                SERIAL PRIMARY KEY,
  sessao_id         INT NOT NULL REFERENCES sessoes_treino(id) ON DELETE CASCADE,
  exercicio_id      INT NOT NULL REFERENCES exercicios(id),
  series_totais     INT,
  reps_alvo         INT,
  reps_atuais       INT DEFAULT 0,
  status_execucao   TEXT DEFAULT 'Correto',
  data_atualizacao  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alertas (
  id                SERIAL PRIMARY KEY,
  monitoramento_id  INT NOT NULL REFERENCES monitoramento_ao_vivo(id) ON DELETE CASCADE,
  titulo_erro       TEXT NOT NULL,
  detalhes_sensor   TEXT NOT NULL,
  risco_lesao       TEXT,
  severidade        TEXT NOT NULL DEFAULT 'warn' CHECK (severidade IN ('warn','danger')),
  status_alerta     TEXT NOT NULL DEFAULT 'PENDENTE',  -- ou 'RESOLVIDO'
  data_hora_alerta  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS configuracoes_personal (
  personal_id       INT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  notificacoes_erro BOOLEAN NOT NULL DEFAULT TRUE,
  vibrar_alerta     BOOLEAN NOT NULL DEFAULT TRUE,
  som_alerta        BOOLEAN NOT NULL DEFAULT TRUE
);
