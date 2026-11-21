// ANÁLISE DE VÍDEO (versão de demonstração): o app escolhe um vídeo de exercício, envia para o
// servidor da câmera (camera/camera_gemini.py) e acompanha a análise da IA até ela terminar.
// O servidor também grava cada análise em um arquivo .txt na pasta camera/analises.
import { Platform } from "react-native";
import { CAMERA_URL } from "./aovivo";

export const FORMATOS_VIDEO = "mp4, mov, m4v, webm, avi, mkv ou 3gp";
export const LIMITE_VIDEO_MB = 300;

// Vídeo escolhido pela pessoa: no navegador vem como arquivo (file); no celular, como endereço (uri)
export type VideoEscolhido = {
  nome: string;
  tamanho?: number;
  mimeType?: string;
  uri?: string;
  file?: Blob;
};

export type ResultadoVideo = {
  status: "ok" | "warn" | "danger";
  exercise: string;
  reps: number;
  targetReps: number;
  sets: string;
  feedback: string;
  problema: string;
  risco: string;
};

export type AndamentoVideo = {
  id: number;
  estado: "analisando" | "concluido" | "erro";
  mensagem: string;
  aluno: string;
  arquivo: string;
  resultado: ResultadoVideo | null;
  modelo: string;
  arquivo_txt: string | null;
  erro: string;
};

// Histórico das análises feitas desde que o app foi aberto (some ao recarregar a página)
export type ItemHistorico = {
  id: number;
  alunoId: string;
  alunoNome: string;
  arquivo: string;
  resultado: ResultadoVideo;
  modelo: string;
  arquivoTxt: string | null;
  quando: string; // ISO
};

let historico: ItemHistorico[] = [];
export const obterHistorico = () => historico;
export const adicionarHistorico = (item: ItemHistorico) => {
  historico = [item, ...historico].slice(0, 30);
};

export function formatarTamanho(bytes?: number) {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// ---------------------------------------------------------------------------
// Escolher o vídeo
// ---------------------------------------------------------------------------

// Navegador (Expo Web): abre o seletor de arquivos do próprio navegador
function escolherNoNavegador(): Promise<VideoEscolhido | null> {
  return new Promise((resolve) => {
    const doc = (globalThis as any).document;
    const input = doc.createElement("input");
    input.type = "file";
    input.accept = "video/*,.mp4,.mov,.m4v,.webm,.avi,.mkv,.3gp";
    input.style.display = "none";
    let resolvido = false;
    const fim = (valor: VideoEscolhido | null) => {
      if (resolvido) return;
      resolvido = true;
      input.remove?.();
      resolve(valor);
    };
    input.onchange = () => {
      const f = input.files?.[0];
      fim(f ? { nome: f.name, tamanho: f.size, mimeType: f.type, file: f } : null);
    };
    input.oncancel = () => fim(null);
    doc.body.appendChild(input);
    input.click();
  });
}

// Celular: usa o seletor de arquivos do Expo (pacote expo-document-picker)
async function escolherNoCelular(): Promise<VideoEscolhido | null> {
  let DocumentPicker: any = null;
  try {
    // @ts-ignore pacote opcional: instalado pelo 1-INSTALAR.bat / 3-ABRIR-TUDO.bat
    DocumentPicker = require("expo-document-picker");
  } catch {}
  if (!DocumentPicker) {
    throw new Error(
      "Para escolher vídeos no celular falta o seletor de arquivos. Na pasta app rode: npx expo install expo-document-picker  e abra o app de novo. No navegador (tecla w) funciona sem instalar nada.",
    );
  }
  const r = await DocumentPicker.getDocumentAsync({
    type: "video/*",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0];
  return {
    nome: a.name ?? "video.mp4",
    tamanho: a.size,
    mimeType: a.mimeType,
    uri: a.uri,
  };
}

export const escolherVideo = () =>
  Platform.OS === "web" ? escolherNoNavegador() : escolherNoCelular();

// ---------------------------------------------------------------------------
// Enviar e acompanhar a análise
// ---------------------------------------------------------------------------
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MSG_SERVIDOR = `Servidor da câmera desligado ou inacessível (${CAMERA_URL}). Abra o 3-ABRIR-TUDO.bat e confira se o celular está no mesmo Wi-Fi.`;

// Envia o vídeo, espera a IA analisar (consultando o servidor a cada 2 s) e devolve o resultado.
// onEtapa recebe a mensagem do momento ("Enviando...", "Analisando...") para mostrar na tela.
export async function analisarVideo(
  video: VideoEscolhido,
  alunoNome: string,
  onEtapa: (mensagem: string) => void,
): Promise<AndamentoVideo> {
  const corpo: Blob =
    video.file ?? (await (await fetch(video.uri as string)).blob());

  onEtapa("Enviando o vídeo para o servidor...");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10 * 60 * 1000);
  let atual: AndamentoVideo;
  try {
    const url =
      `${CAMERA_URL}/analisar-video?aluno=${encodeURIComponent(alunoNome)}` +
      `&arquivo=${encodeURIComponent(video.nome)}`;
    const r = await fetch(url, {
      method: "POST",
      body: corpo,
      headers: { "Content-Type": "application/octet-stream" },
      signal: controller.signal,
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error(
        dados.detail || `O servidor da câmera respondeu com erro ${r.status}.`,
      );
    }
    atual = dados as AndamentoVideo;
  } catch (e: any) {
    if (e.name === "AbortError" || e instanceof TypeError) {
      throw new Error(MSG_SERVIDOR);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  // A análise roda em segundo plano no servidor: consulta até terminar (no máximo 10 min)
  const limite = Date.now() + 10 * 60 * 1000;
  let falhas = 0;
  while (atual.estado === "analisando") {
    if (Date.now() > limite) {
      throw new Error("A análise demorou demais. Tente novamente.");
    }
    onEtapa(atual.mensagem || "Analisando o vídeo...");
    await esperar(2000);
    try {
      const r = await fetch(`${CAMERA_URL}/analisar-video/${atual.id}`);
      const dados = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(dados.detail || `Erro ${r.status} ao consultar a análise.`);
      }
      atual = dados as AndamentoVideo;
      falhas = 0;
    } catch (e: any) {
      // tolera uma queda rápida de rede; desiste depois de 3 falhas seguidas
      falhas += 1;
      if (falhas >= 3) {
        throw e instanceof TypeError ? new Error(MSG_SERVIDOR) : e;
      }
    }
  }

  if (atual.estado === "erro" || !atual.resultado) {
    throw new Error(
      atual.erro || "Não foi possível analisar o vídeo. Tente novamente.",
    );
  }
  return atual;
}
