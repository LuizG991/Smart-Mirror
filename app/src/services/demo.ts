// MODO DEMO: simula a API inteiramente na memória, sem servidor e sem banco de dados.
// Ativado com EXPO_PUBLIC_MODO_DEMO=true (veja ABRIR-SEM-BANCO.bat).
// Os dados voltam ao padrão sempre que o app é recarregado.

const dia = (diasAtras: number) => {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const minAtras = (m: number) => new Date(Date.now() - m * 60000).toISOString();

type Aluno = {
  id: number;
  nome: string;
  objetivo: string | null;
  plano: "Básico" | "Pro" | "Elite";
  vaga: number | null;
  idade: number | null;
  exercicio: string | null;
  series_totais: number | null;
  reps_alvo: number | null;
  status_execucao: "Correto" | "Atencao" | "Erro" | "Descanso" | null;
  ultima_sessao_data: string | null;
  ultima_sessao_horario: string | null;
  total_sessoes: number;
  reps_detectadas?: number; // preenchido quando um vídeo do aluno é analisado pela IA
};

let alunos: Aluno[] = [
  { id: 1, nome: "Ana Souza", objetivo: "Hipertrofia", plano: "Pro", vaga: 1, idade: 28, exercicio: "Agachamento", series_totais: 4, reps_alvo: 12, status_execucao: "Atencao", ultima_sessao_data: dia(0), ultima_sessao_horario: "08:00", total_sessoes: 18 },
  { id: 2, nome: "Carlos Lima", objetivo: "Emagrecimento", plano: "Básico", vaga: 2, idade: 35, exercicio: "Flexão de braço", series_totais: 3, reps_alvo: 10, status_execucao: "Erro", ultima_sessao_data: dia(0), ultima_sessao_horario: "09:30", total_sessoes: 9 },
  { id: 3, nome: "Marina Alves", objetivo: "Condicionamento", plano: "Elite", vaga: 3, idade: 24, exercicio: "Remada curvada", series_totais: 4, reps_alvo: 8, status_execucao: "Correto", ultima_sessao_data: dia(0), ultima_sessao_horario: "10:30", total_sessoes: 31 },
  { id: 4, nome: "Pedro Santos", objetivo: "Reabilitação", plano: "Básico", vaga: null, idade: 41, exercicio: null, series_totais: null, reps_alvo: null, status_execucao: "Descanso", ultima_sessao_data: dia(1), ultima_sessao_horario: "17:00", total_sessoes: 5 },
];

type AlertaDemo = {
  id: number;
  titulo_erro: string;
  detalhes_sensor: string;
  risco_lesao: string | null;
  severidade: "warn" | "danger";
  status_alerta: "PENDENTE" | "RESOLVIDO";
  data_hora_alerta: string;
  aluno_id: number;
  aluno_nome: string;
  exercicio: string;
};

let alertas: AlertaDemo[] = [
  { id: 1, titulo_erro: "Joelhos para dentro", detalhes_sensor: "Valgo dinâmico detectado na descida.", risco_lesao: "Risco de lesão no ligamento do joelho.", severidade: "warn" as const, status_alerta: "PENDENTE" as "PENDENTE" | "RESOLVIDO", data_hora_alerta: minAtras(3), aluno_id: 1, aluno_nome: "Ana Souza", exercicio: "Agachamento" },
  { id: 2, titulo_erro: "Coluna arqueada", detalhes_sensor: "Quadril caindo durante a flexão.", risco_lesao: "Sobrecarga lombar.", severidade: "danger" as const, status_alerta: "PENDENTE" as "PENDENTE" | "RESOLVIDO", data_hora_alerta: minAtras(8), aluno_id: 2, aluno_nome: "Carlos Lima", exercicio: "Flexão de braço" },
  { id: 3, titulo_erro: "Movimento acelerado", detalhes_sensor: "Fase excêntrica muito rápida.", risco_lesao: null, severidade: "warn" as const, status_alerta: "RESOLVIDO" as "PENDENTE" | "RESOLVIDO", data_hora_alerta: minAtras(190), aluno_id: 3, aluno_nome: "Marina Alves", exercicio: "Remada curvada" },
];

const sessoes = [
  { id: 1, aluno_nome: "Ana Souza", horario: "08:00", status: "concluido", exercicios: "Agachamento + Afundo" },
  { id: 2, aluno_nome: "Carlos Lima", horario: "09:30", status: "em_andamento", exercicios: "Flexão de braço" },
  { id: 3, aluno_nome: "Marina Alves", horario: "10:30", status: "em_andamento", exercicios: "Remada curvada" },
  { id: 4, aluno_nome: "Pedro Santos", horario: "17:00", status: "agendado", exercicios: "Sem exercícios" },
];

// Alunos "registrados no app" que ainda não têm personal (para o botão Adicionar)
let registrados = [
  { id: 201, nome: "Lucas Mendes", email: "lucas.mendes@exemplo.com" },
  { id: 202, nome: "Beatriz Rocha", email: "beatriz.rocha@exemplo.com" },
];

// Quem está logado no demo (para a visão do aluno)
let usuarioDemo = { nome: "Aluno Demo", email: "aluno@exemplo.com", perfil: "PERSONAL" };

let config = { notificacoes_erro: true, vibrar_alerta: true, som_alerta: true };

const pausa = () => new Promise((r) => setTimeout(r, 150));

// Volta o usuário do demo para o Personal (usado ao entrar pelo botão "Versão de demonstração")
export function reiniciarUsuarioDemo() {
  usuarioDemo = { nome: "Personal Demo", email: "demo@smartmirror.app", perfil: "PERSONAL" };
}

// Resultado da IA para um vídeo enviado na versão de demonstração
export type AnaliseVideoDemo = {
  status: "ok" | "warn" | "danger";
  exercise: string;
  reps: number;
  targetReps: number;
  sets: string;
  feedback: string;
  problema: string;
  risco: string;
};

// Aplica a análise de um vídeo ao aluno escolhido: atualiza o exercício e o status dele, a sessão de
// hoje e, se houve erro de execução (atenção/erro), cria um alerta que aparece na aba Alertas.
export function registrarAnaliseDemo(alunoId: number, a: AnaliseVideoDemo) {
  const aluno = alunos.find((x) => x.id === alunoId);
  if (!aluno) return;
  const agora = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const hora = `${p(agora.getHours())}:${p(agora.getMinutes())}`;
  const semExercicio = /nenhum|aguardando/i.test(a.exercise);

  if (!semExercicio) {
    aluno.exercicio = a.exercise;
    aluno.reps_alvo = a.targetReps;
    aluno.reps_detectadas = Math.min(a.reps, a.targetReps);
    aluno.status_execucao =
      a.status === "danger" ? "Erro" : a.status === "warn" ? "Atencao" : "Correto";
    aluno.ultima_sessao_data = dia(0);
    aluno.ultima_sessao_horario = hora;

    const sessao = sessoes.find((x) => x.aluno_nome === aluno.nome);
    if (sessao) {
      sessao.exercicios = a.exercise;
      sessao.status = "concluido";
      sessao.horario = hora;
    } else {
      sessoes.push({
        id: Math.max(0, ...sessoes.map((x) => x.id)) + 1,
        aluno_nome: aluno.nome,
        horario: hora,
        status: "concluido",
        exercicios: a.exercise,
      });
    }
  }

  if (a.status !== "ok") {
    const titulo = a.problema || a.feedback || "Execução incorreta";
    alertas = [
      {
        id: Math.max(0, ...alertas.map((x) => x.id)) + 1,
        titulo_erro: titulo,
        detalhes_sensor: a.feedback || titulo,
        risco_lesao: a.risco || null,
        severidade: a.status,
        status_alerta: "PENDENTE",
        data_hora_alerta: agora.toISOString(),
        aluno_id: aluno.id,
        aluno_nome: aluno.nome,
        exercicio: a.exercise,
      },
      ...alertas,
    ];
  }
}

function nomeDoEmail(email: string) {
  const base = email.split("@")[0].replace(/[._-]+/g, " ").trim() || "Usuário";
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

function usuario(nome: string, email: string, perfil: string) {
  return {
    id: 100,
    nome,
    email: email.trim().toLowerCase(),
    tipo_perfil: perfil === "ALUNO" ? "ALUNO" : "PERSONAL",
    cref: perfil === "ALUNO" ? null : "000000-G/XX",
  };
}

export async function respostaDemo(
  caminho: string,
  opcoes: RequestInit = {},
): Promise<any> {
  await pausa();
  const metodo = (opcoes.method ?? "GET").toUpperCase();
  const corpo = opcoes.body ? JSON.parse(String(opcoes.body)) : {};

  if (caminho === "/auth/login" && metodo === "POST") {
    if (!corpo.email || !corpo.senha) throw new Error("Informe e-mail e senha.");
    usuarioDemo = { nome: nomeDoEmail(corpo.email), email: corpo.email, perfil: corpo.perfil };
    return { token: "demo", usuario: usuario(nomeDoEmail(corpo.email), corpo.email, corpo.perfil) };
  }
  if (caminho === "/auth/register" && metodo === "POST") {
    if (!corpo.nome || !corpo.email || !corpo.senha) {
      throw new Error("Informe nome, e-mail, senha e perfil.");
    }
    usuarioDemo = { nome: corpo.nome, email: corpo.email, perfil: corpo.perfil };
    return { token: "demo", usuario: usuario(corpo.nome, corpo.email, corpo.perfil) };
  }

  const ehAluno = usuarioDemo.perfil === "ALUNO";
  if (caminho === "/alertas" && metodo === "GET") {
    return ehAluno
      ? alertas
          .filter((a) => a.aluno_id === 1)
          .map((a) => ({ ...a, aluno_nome: usuarioDemo.nome }))
      : alertas;
  }
  const resolver = caminho.match(/^\/alertas\/(\d+)\/resolver$/);
  if (resolver && metodo === "PATCH") {
    const a = alertas.find((x) => x.id === Number(resolver[1]));
    if (!a) throw new Error("Alerta não encontrado.");
    a.status_alerta = "RESOLVIDO";
    return { id: a.id, status_alerta: a.status_alerta };
  }

  if (caminho === "/alunos" && metodo === "GET") {
    // Faz as repetições "andarem" com o tempo, para a tela parecer ao vivo
    const tick = Math.floor(Date.now() / 4000);
    return alunos.map((a) => ({
      ...a,
      reps_atuais: a.reps_alvo
        ? (a.reps_detectadas ?? (tick + a.id) % (a.reps_alvo + 1))
        : null,
    }));
  }
  if (caminho === "/alunos/disponiveis" && metodo === "GET") return registrados;
  const vagaRota = caminho.match(/^\/alunos\/(\d+)\/vaga$/);
  if (vagaRota && metodo === "PUT") {
    const aluno = alunos.find((a) => a.id === Number(vagaRota[1]));
    if (!aluno) throw new Error("Aluno não encontrado na sua lista.");
    const vaga: number | null = corpo.vaga ?? null;
    const antiga = aluno.vaga;
    // quem estava na vaga escolhida troca de lugar com este aluno
    if (vaga !== null) {
      alunos.forEach((a) => {
        if (a.id !== aluno.id && a.vaga === vaga) a.vaga = antiga;
      });
    }
    aluno.vaga = vaga;
    return { id: aluno.id, vaga };
  }
  if (caminho === "/alunos" && metodo === "POST") {
    if (!corpo.email) throw new Error("Informe o e-mail do aluno.");
    const email = String(corpo.email).trim().toLowerCase();
    const registrado = registrados.find((r) => r.email.toLowerCase() === email);
    const nome = registrado?.nome ?? nomeDoEmail(email);
    if (alunos.some((a) => a.nome === nome)) {
      throw new Error("Este aluno já está na sua lista.");
    }
    const novo: Aluno = {
      id: Math.max(...alunos.map((a) => a.id)) + 1,
      nome,
      objetivo: corpo.objetivo?.trim() || null,
      plano: corpo.plano ?? "Básico",
      vaga: [1, 2, 3].find((v) => !alunos.some((a) => a.vaga === v)) ?? null,
      idade: null,
      exercicio: null,
      series_totais: null,
      reps_alvo: null,
      status_execucao: "Descanso",
      ultima_sessao_data: null,
      ultima_sessao_horario: null,
      total_sessoes: 0,
    };
    alunos = [...alunos, novo];
    registrados = registrados.filter((r) => r.email.toLowerCase() !== email);
    return { id: novo.id, nome: novo.nome, vaga: novo.vaga };
  }

  if (caminho === "/sessoes/hoje") {
    return ehAluno
      ? sessoes
          .filter((x) => x.aluno_nome === "Ana Souza")
          .map((x) => ({ ...x, aluno_nome: usuarioDemo.nome }))
      : sessoes;
  }

  if (caminho === "/perfil/aluno") {
    return {
      id: 100,
      nome: usuarioDemo.nome,
      email: usuarioDemo.email,
      objetivo: "Hipertrofia",
      plano: "Pro",
      idade: 28,
      vaga: null,
      personal_nome: "Marcos Silva",
      personal_cref: "012345-G/CE",
      total_sessoes: 18,
    };
  }

  if (caminho === "/perfil/configuracoes" && metodo === "GET") return config;
  if (caminho === "/perfil/configuracoes" && metodo === "PUT") {
    config = { ...config, ...corpo };
    return config;
  }
  if (caminho === "/perfil/resumo") return { sessoes_mes: 24 };

  throw new Error("Rota não disponível no modo demonstração.");
}
