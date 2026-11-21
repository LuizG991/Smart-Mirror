// CÂMERA: o app conversa direto com o servidor da câmera (camera/camera_gemini.py).
// Existem 3 vagas independentes (Aluno 1, 2 e 3), cada uma com o seu monitoramento.
// Funciona para todos os acessos (personal, aluno e visitante): a câmera não depende do banco.
import { respostaDemo } from "./demo";

export const CAMERA_URL = (
  process.env.EXPO_PUBLIC_CAMERA_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

export const NUMEROS_ALUNOS = [1, 2, 3] as const;
export const nomeAluno = (n: number) => `Aluno ${n}`;
// Vaga do servidor da câmera usada por quem se auto-monitora (aluno sem vaga e visitante)
export const VAGA_VISITANTE = 0;

export type AnaliseCamera = {
  status: "ok" | "warn" | "danger";
  exercise: string;
  reps: number;
  targetReps: number;
  sets: string;
  feedback: string;
};

export type AlertaCamera = {
  id: number;
  titulo_erro: string;
  detalhes_sensor: string;
  risco_lesao: string | null;
  severidade: "warn" | "danger";
  exercicio: string;
  data_hora_alerta: string;
  resolvido: boolean;
};

export type EstadoAluno = {
  ligado: boolean;
  gravando: boolean;
  segundos_restantes: number;
  analisando: boolean;
  clipes_analisados: number;
  inicio_sessao: string | null;
  atualizado_em: string | null;
  erro: string;
  analise: AnaliseCamera;
  alertas: AlertaCamera[];
  // Pose estimation (esqueleto): se está ligada, se há pessoa no quadro e os ângulos medidos agora
  pose?: PoseCamera;
};

export type PoseCamera = {
  ativa: boolean;
  detectada: boolean;
  angulos: Record<string, number>; // ex.: { "joelho esquerdo": 92 } em graus
};

// /status devolve o estado dos 3 alunos, indexado por "1", "2", "3"
export type EstadoCamera = { alunos: Record<string, EstadoAluno> };

async function chamar<T>(caminho: string, metodo = "GET"): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const r = await fetch(`${CAMERA_URL}${caminho}`, {
      method: metodo,
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`O servidor da câmera respondeu com erro ${r.status}.`);
    return (await r.json()) as T;
  } catch (e: any) {
    if (e.name === "AbortError" || e instanceof TypeError) {
      throw new Error(
        `Servidor da câmera desligado ou inacessível (${CAMERA_URL}). Abra o 3-ABRIR-TUDO.bat e confira se o celular está no mesmo Wi-Fi.`,
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const statusCamera = () => chamar<EstadoCamera>("/status");
export const ligarAluno = (n: number) =>
  chamar<EstadoAluno & { ok: boolean }>(`/alunos/${n}/iniciar`, "POST");
export const pararAluno = (n: number) =>
  chamar<EstadoAluno>(`/alunos/${n}/parar`, "POST");
export const resolverAlertaCamera = (id: number | string) =>
  chamar<{ id: number; resolvido: boolean }>(`/alertas/${id}/resolver`, "POST");
export const urlVideo = (n: number) =>
  `${CAMERA_URL}/alunos/${n}/video?t=${Date.now()}`;

// ---------------------------------------------------------------------------
// Adaptador do VISITANTE: responde as mesmas rotas que o Aluno usa (perfil, alertas e treinos
// de hoje), mas a partir do estado da câmera (vaga 0 = auto-monitoramento), sem passar pela API.
// ---------------------------------------------------------------------------
const p2 = (n: number) => String(n).padStart(2, "0");
const horaLocal = (iso: string) => {
  const d = new Date(iso);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

const SEM_EXERCICIO = /nenhum|aguardando/i;
const houveSessao = (e: EstadoAluno) => e.ligado || e.clipes_analisados > 0;

export async function respostaAoVivo(
  caminho: string,
  opcoes: RequestInit = {},
): Promise<any> {
  const metodo = (opcoes.method ?? "GET").toUpperCase();

  // Login/cadastro e configurações do perfil são locais
  if (caminho.startsWith("/auth/") || caminho === "/perfil/configuracoes") {
    return respostaDemo(caminho, opcoes);
  }
  if (caminho === "/perfil/resumo") return { sessoes_mes: 0 };

  // Mesmo formato do perfil do aluno, para um visitante
  if (caminho === "/perfil/aluno") {
    return {
      id: 0,
      nome: "Visitante",
      email: "",
      objetivo: null,
      plano: null,
      idade: null,
      vaga: null,
      personal_nome: null,
      personal_cref: null,
      total_sessoes: 0,
    };
  }

  if (caminho === "/alunos") {
    if (metodo === "POST") {
      throw new Error("Visitantes não podem cadastrar alunos.");
    }
    return [];
  }

  const resolver = caminho.match(/^\/alertas\/(\d+)\/resolver$/);
  if (resolver && metodo === "PATCH") {
    await resolverAlertaCamera(resolver[1]);
    return { id: Number(resolver[1]), status_alerta: "RESOLVIDO" };
  }

  const { alunos } = await statusCamera();
  const e = alunos[String(VAGA_VISITANTE)];

  if (caminho === "/alertas") {
    return (e?.alertas ?? [])
      .map((a) => ({
        id: a.id,
        titulo_erro: a.titulo_erro,
        detalhes_sensor: a.detalhes_sensor,
        risco_lesao: a.risco_lesao,
        severidade: a.severidade,
        status_alerta: a.resolvido ? "RESOLVIDO" : "PENDENTE",
        data_hora_alerta: a.data_hora_alerta,
        aluno_id: VAGA_VISITANTE,
        aluno_nome: "Você",
        exercicio: a.exercicio,
      }))
      .sort(
        (x, y) =>
          new Date(y.data_hora_alerta).getTime() -
          new Date(x.data_hora_alerta).getTime(),
      );
  }

  if (caminho === "/sessoes/hoje") {
    if (!e || !houveSessao(e)) return [];
    const inicio = e.inicio_sessao ?? new Date().toISOString();
    return [
      {
        id: VAGA_VISITANTE,
        aluno_nome: "Você",
        horario: horaLocal(inicio),
        status: e.ligado ? "em_andamento" : "concluido",
        exercicios: SEM_EXERCICIO.test(e.analise.exercise)
          ? "Sem exercícios"
          : e.analise.exercise,
      },
    ];
  }

  throw new Error("Rota não disponível para visitantes.");
}
