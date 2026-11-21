import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { respostaAoVivo } from "./aovivo";
import { reiniciarUsuarioDemo, respostaDemo } from "./demo";

// Modo demonstração: sem API e sem banco (EXPO_PUBLIC_MODO_DEMO=true)
const DEMO = process.env.EXPO_PUBLIC_MODO_DEMO === "true";

// Modo "sem banco": escolhido na tela de login ("Entrar sem login"). Não usa a API
// nem o PostgreSQL; Início e Alertas mostram só o que a câmera está analisando.
let semBanco = false;
export const isSemBanco = () => semBanco;

// Versão de demonstração (botão na tela de login): visão do PERSONAL com dados de exemplo
// na memória (sem API e sem banco). A aba Monitorar vira "Análise de vídeo": em vez da
// câmera ao vivo, a pessoa envia um vídeo de exercício para a IA analisar.
let demoApp = false;
export const isDemoApp = () => demoApp;
const semServidor = () => DEMO || semBanco || demoApp;

// De quanto em quanto tempo as telas se atualizam (lido a cada uso, pois o modo muda no login)
export const intervaloMs = () => (semBanco || demoApp ? 2000 : 5000);

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

const TOKEN_KEY = "token";

// O SecureStore não existe no navegador (Expo Web): lá o token fica no localStorage.
const webStorage = () => (globalThis as any).localStorage as Storage | undefined;

async function guardarToken(valor: string) {
  if (Platform.OS === "web") {
    try {
      webStorage()?.setItem(TOKEN_KEY, valor);
    } catch {}
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, valor);
}

async function lerToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return webStorage()?.getItem(TOKEN_KEY) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function apagarToken() {
  if (Platform.OS === "web") {
    try {
      webStorage()?.removeItem(TOKEN_KEY);
    } catch {}
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export type Perfil = "PERSONAL" | "ALUNO";

export type Usuario = {
  id: number;
  nome: string;
  email: string;
  tipo_perfil: Perfil;
  cref: string | null;
};

let usuarioAtual: Usuario | null = null;
export const getUsuario = () => usuarioAtual;

let token: string | null = null;

export async function carregarToken() {
  if (semServidor()) return null;
  token = await lerToken();
  return token;
}

async function salvarToken(novo: string) {
  token = novo;
  if (semServidor()) return;
  await guardarToken(novo);
}

// Entra como VISITANTE: sem e-mail e senha, com as mesmas abas do Aluno (Início, Monitorar,
// Meus alertas e Perfil). O monitoramento usa a vaga 0 (auto-monitoramento) da câmera.
export function entrarSemBanco(): Usuario {
  semBanco = true;
  token = null;
  usuarioAtual = {
    id: 0,
    nome: "Visitante",
    email: "",
    tipo_perfil: "ALUNO",
    cref: null,
  };
  return usuarioAtual;
}

// Entra na VERSÃO DE DEMONSTRAÇÃO: mesmas abas do Personal, com alunos, alertas e sessões de
// exemplo. Nada é salvo no banco; a análise de vídeos usa o servidor da câmera (camera/).
export function entrarDemonstracao(): Usuario {
  reiniciarUsuarioDemo();
  demoApp = true;
  semBanco = false;
  token = null;
  usuarioAtual = {
    id: 100,
    nome: "Personal Demo",
    email: "demo@smartmirror.app",
    tipo_perfil: "PERSONAL",
    cref: "000000-G/XX",
  };
  return usuarioAtual;
}

export async function sair() {
  const eraSemServidor = semServidor();
  usuarioAtual = null;
  token = null;
  semBanco = false;
  demoApp = false;
  if (eraSemServidor) return;
  await apagarToken();
}

async function requisicao<T>(
  caminho: string,
  opcoes: RequestInit = {},
): Promise<T> {
  if (semBanco) return (await respostaAoVivo(caminho, opcoes)) as T;
  if (DEMO || demoApp) return (await respostaDemo(caminho, opcoes)) as T;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const resposta = await fetch(`${API_URL}${caminho}`, {
      ...opcoes,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      throw new Error(dados.erro || "Erro ao comunicar com o servidor.");
    }
    return dados as T;
  } catch (e: any) {
    if (e.name === "AbortError") {
      throw new Error("O servidor demorou para responder.");
    }
    if (e instanceof TypeError) {
      throw new Error(
        "Não foi possível conectar à API. Verifique a rede e o endereço.",
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

type RespostaAuth = { token: string; usuario: Usuario };

export async function login(email: string, senha: string, perfil: Perfil) {
  const r = await requisicao<RespostaAuth>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, senha, perfil }),
  });
  await salvarToken(r.token);
  usuarioAtual = r.usuario;
  return r.usuario;
}

export async function cadastrar(dados: {
  nome: string;
  email: string;
  senha: string;
  perfil: Perfil;
}) {
  const r = await requisicao<RespostaAuth>("/auth/register", {
    method: "POST",
    body: JSON.stringify(dados),
  });
  await salvarToken(r.token);
  usuarioAtual = r.usuario;
  return r.usuario;
}

export type AlertaAPI = {
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

export const listarAlertas = () => requisicao<AlertaAPI[]>("/alertas");

export const resolverAlerta = (id: string | number) =>
  requisicao<{ id: number; status_alerta: string }>(`/alertas/${id}/resolver`, {
    method: "PATCH",
  });

export type AlunoAPI = {
  id: number;
  nome: string;
  objetivo: string | null;
  plano: "Básico" | "Pro" | "Elite";
  vaga: number | null;
  idade: number | null;
  exercicio: string | null;
  series_totais: number | null;
  reps_alvo: number | null;
  reps_atuais: number | null;
  status_execucao: "Correto" | "Atencao" | "Erro" | "Descanso" | null;
  ultima_sessao_data: string | null;
  ultima_sessao_horario: string | null;
  total_sessoes: number;
};

export type SessaoHojeAPI = {
  id: number;
  aluno_nome: string;
  horario: string | null;
  status: "agendado" | "em_andamento" | "concluido";
  exercicios: string;
};

export const listarAlunos = () => requisicao<AlunoAPI[]>("/alunos");
export const sessoesDeHoje = () => requisicao<SessaoHojeAPI[]>("/sessoes/hoje");
export type Configuracoes = {
  notificacoes_erro: boolean;
  vibrar_alerta: boolean;
  som_alerta: boolean;
};

export const obterConfiguracoes = () =>
  requisicao<Configuracoes>("/perfil/configuracoes");

export const salvarConfiguracoes = (config: Configuracoes) =>
  requisicao<Configuracoes>("/perfil/configuracoes", {
    method: "PUT",
    body: JSON.stringify(config),
  });

export const resumoPerfil = () =>
  requisicao<{ sessoes_mes: number }>("/perfil/resumo");

export const vincularAluno = (dados: {
  email: string;
  objetivo?: string;
  plano: "Básico" | "Pro" | "Elite";
  data_nascimento?: string;
}) =>
  requisicao<{ id: number; nome: string; vaga: number | null }>("/alunos", {
    method: "POST",
    body: JSON.stringify(dados),
  });

// Alunos que já se registraram no app mas ainda não têm personal
export type AlunoDisponivel = { id: number; nome: string; email: string };
export const listarDisponiveis = () =>
  requisicao<AlunoDisponivel[]>("/alunos/disponiveis");

// Coloca o aluno numa vaga (1, 2 ou 3) da aba Monitorar, ou tira da vaga (null)
export const atribuirVaga = (alunoId: number, vaga: 1 | 2 | 3 | null) =>
  requisicao<{ id: number; vaga: number | null }>(`/alunos/${alunoId}/vaga`, {
    method: "PUT",
    body: JSON.stringify({ vaga }),
  });

// Dados do aluno logado
export type PerfilAluno = {
  id: number;
  nome: string;
  email: string;
  objetivo: string | null;
  plano: "Básico" | "Pro" | "Elite" | null;
  idade: number | null;
  vaga: number | null;
  personal_nome: string | null;
  personal_cref: string | null;
  total_sessoes: number;
};
export const meuPerfilAluno = () => requisicao<PerfilAluno>("/perfil/aluno");
