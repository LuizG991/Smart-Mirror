"""
Servidor de análise por câmera (Gemini) controlado pelo aplicativo.

- Sobe uma API em http://0.0.0.0:8000
- Existem 3 "vagas" independentes: Aluno 1, Aluno 2 e Aluno 3 (o app liga cada vaga a um
  aluno do banco). Cada uma tem a sua própria sessão, estado, alertas e vídeo.
- Existe também a vaga 0, usada pelo aluno que se auto-monitora no app (sem vaga de personal).
- O app liga/desliga cada aluno por: POST /alunos/{n}/iniciar e POST /alunos/{n}/parar
- GET /status devolve o estado dos 3 alunos; GET /alunos/{n}/video mostra a câmera (MJPEG)
- Nada é gravado em banco: tudo fica em memória enquanto o servidor estiver aberto.

Câmeras: por padrão os 3 alunos usam a mesma webcam (CAMERA_INDEX), então só um
pode ficar ligado por vez. Se você tiver mais de uma câmera, defina no camera/.env:
CAMERA_ALUNO_1=0, CAMERA_ALUNO_2=1, CAMERA_ALUNO_3=2 (os índices das suas câmeras).
"""
# ────────────────────────────────────────────────────────────────────
# PARTE 1 — BIBLIOTECAS (IMPORTS)
# Aqui ficam as ferramentas que o programa usa:
# - cv2 (OpenCV): liga a câmera e grava os vídeos.
# - fastapi / uvicorn: criam o servidor que conversa com o aplicativo.
# - google.genai: biblioteca para falar com a IA (Gemini).
# - threading / queue: permitem fazer várias coisas ao mesmo tempo
#   (gravar o vídeo enquanto a IA analisa o anterior).
# - os / time / json / re / datetime: utilidades gerais (arquivos, tempo, textos).
# ────────────────────────────────────────────────────────────────────
import cv2
import os
import queue
import sys
import threading
import time
import json
import math
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor, TimeoutError as TempoEsgotado
from datetime import datetime

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import uvicorn
from google import genai
from google.genai import types

# MediaPipe (estimativa de pose). É opcional: se não estiver instalado, o resto funciona normalmente.
# Duas formas de usar: a API antiga (mp.solutions, mediapipe até 0.10.x) ou a API nova
# (mp.tasks, a única que existe no mediapipe 1.x / Python 3.13+, precisa do arquivo de modelo .task).
import urllib.request

POSE_MODO = ""        # "solutions" (antiga) ou "tasks" (nova)
_mp_pose = None
_POSE_MODELOS = {
    0: "pose_landmarker_lite.task",
    1: "pose_landmarker_full.task",
    2: "pose_landmarker_heavy.task",
}
_POSE_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/{nome}/float16/latest/{arquivo}"
# Ligações do esqueleto (33 pontos do MediaPipe), iguais nas duas APIs
POSE_CONEXOES = [
    (0, 1), (1, 2), (2, 3), (3, 7), (0, 4), (4, 5), (5, 6), (6, 8), (9, 10),
    (11, 12), (11, 13), (13, 15), (15, 17), (15, 19), (15, 21), (17, 19),
    (12, 14), (14, 16), (16, 18), (16, 20), (16, 22), (18, 20),
    (11, 23), (12, 24), (23, 24), (23, 25), (24, 26), (25, 27), (26, 28),
    (27, 29), (28, 30), (29, 31), (30, 32), (27, 31), (28, 32),
]
try:
    import mediapipe as mp
    if hasattr(mp, "solutions") and hasattr(mp.solutions, "pose"):
        _mp_pose = mp.solutions.pose
        POSE_MODO = "solutions"
    else:
        from mediapipe.tasks import python as _mp_tasks
        from mediapipe.tasks.python import vision as _mp_vision
        POSE_MODO = "tasks"
    POSE_DISPONIVEL = True
    _POSE_ERRO = ""
except Exception as _e:  # pacote ausente ou versão incompatível
    mp = None
    POSE_DISPONIVEL = False
    _POSE_ERRO = str(_e)


# Garante o arquivo de modelo da API nova ao lado deste script (baixa na primeira vez, ~6 MB).
def _caminho_modelo_pose(complexidade):
    arquivo = _POSE_MODELOS.get(complexidade, _POSE_MODELOS[1])
    caminho = os.path.join(os.path.dirname(os.path.abspath(__file__)), arquivo)
    if not os.path.exists(caminho) or os.path.getsize(caminho) < 100_000:
        nome = arquivo.replace(".task", "")
        print(f"Baixando o modelo de pose ({arquivo})...")
        urllib.request.urlretrieve(_POSE_URL.format(nome=nome, arquivo=arquivo), caminho)
    return caminho


# Evita caracteres quebrados no terminal do Windows
sys.stdout.reconfigure(encoding="utf-8")

# ────────────────────────────────────────────────────────────────────
# PARTE 2 — CONFIGURAÇÕES (O "PAINEL DE CONTROLE")
# Tudo o que dá para ajustar sem mexer na lógica do programa:
# qual câmera usar, quantos alunos, duração dos clipes, versão inicial da IA
# (3.5 lite), tempo limite de 7 s antes de trocar de versão, porta do servidor etc.
# ────────────────────────────────────────────────────────────────────
# ======================== CONFIGURAÇÕES ========================
CAMERA_INDEX = 0            # 0 = primeira câmera; se pegar a errada, tente 1 ou 2
NUM_ALUNOS = 3              # quantas vagas (Aluno 1, 2, 3...)
DURACAO_PRIMEIRO_CLIPE = 15 # segundos do primeiro clipe de cada sessão
DURACAO_CLIPE = 30          # segundos de cada clipe seguinte enviado à IA
LARGURA, ALTURA = 640, 480  # resolução da gravação
# Versão em que cada clipe COMEÇA (dentro dela, o flash-lite vem primeiro: gemini-3.5-flash-lite).
# Se ela não responder, o servidor tenta o 3.5 flash, depois desce para as mais antigas
# (3.1, 3, 2.5...) e só por último tenta as mais novas que ela (3.6, 3.7...).
VERSAO_INICIAL = (3, 5)
# Modelos do Gemini na ordem de tentativa. Na abertura o servidor consulta a sua chave e monta
# esta lista sozinho com TODAS as versões flash / flash-lite que ela enxerga (sem limite);
# a lista abaixo só é usada se essa consulta falhar.
MODELOS_GEMINI = [
    "gemini-3.5-flash-lite", "gemini-3.5-flash",
    "gemini-3.1-flash", "gemini-3.1-flash-lite", "gemini-3-flash", "gemini-2.5-flash",
    "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite",
    "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.8-flash",
]
MAX_MODELOS = None          # None = sem limite (usa todas as versões que a chave permitir)
TEMPO_LIMITE_MODELO = 7     # segundos: passou disso sem resposta, tenta a próxima versão
# Se TODAS as versões falharem (ex.: 503 "high demand"), o servidor NÃO mostra erro no app:
# espera um instante e percorre a fila de novo, dando um pouco mais de tempo a cada rodada.
ESPERA_ENTRE_RODADAS = 2    # segundos de pausa entre uma rodada completa e a seguinte
ACRESCIMO_POR_RODADA = 10   # segundos somados ao limite de cada versão a cada nova rodada
TEMPO_LIMITE_MAXIMO = 60    # teto do limite por versão
MAX_RODADAS = 8             # depois disso o clipe é descartado em silêncio (só aparece no terminal)
MAX_FILA = 2                # máximo de clipes aguardando (por aluno)
APAGAR_CLIPES_LOCAIS = True # apaga os vídeos após análise
PORTA = 8000
# Cada análise (ao vivo ou de vídeo enviado) é gravada como um arquivo .txt nesta pasta
# (por padrão camera/analises). Para guardar em outro lugar, defina ANALISES_DIR em camera/.env.
PASTA_ANALISES_PADRAO = "analises"
# Versão de demonstração do app: o aluno/personal envia um vídeo de exercício para a IA analisar
# Estimativa de pose (esqueleto) em tempo real, feita com MediaPipe Pose
POSE_ATIVA = True           # liga/desliga o esqueleto e as medições de ângulo
POSE_COMPLEXIDADE = 1       # 0 = leve e rápido, 1 = padrão, 2 = mais preciso e pesado
POSE_CONFIANCA = 0.5        # confiança mínima para detectar/seguir a pessoa (0 a 1)
POSE_GRAVAR_NO_CLIPE = True # True: o clipe gravado já leva o esqueleto desenhado
POSE_ENVIAR_ANGULOS = True  # True: manda os ângulos das articulações como apoio para a IA
POSE_VISIBILIDADE = 0.5     # um ponto só conta se o MediaPipe estiver pelo menos 50% seguro dele
MAX_UPLOAD_MB = 300         # tamanho máximo do vídeo enviado
EXTENSOES_VIDEO = (".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv", ".3gp")
# ===============================================================

PASTA = os.path.dirname(os.path.abspath(__file__))
PASTA_CLIPES = os.path.join(PASTA, "clipes")
os.makedirs(PASTA_CLIPES, exist_ok=True)
PASTA_ANALISES = os.path.abspath(os.getenv("ANALISES_DIR", "").strip() or os.path.join(PASTA, PASTA_ANALISES_PADRAO))
os.makedirs(PASTA_ANALISES, exist_ok=True)

ANALISE_INICIAL = {
    "status": "ok",
    "exercise": "Aguardando análise...",
    "reps": 0,
    "targetReps": 10,
    "sets": "1ª Série",
    "feedback": "Câmera pronta para analisar.",
}


def _indice_camera(numero):
    """Índice da câmera de cada aluno: CAMERA_ALUNO_<n> ou, se não existir, CAMERA_INDEX."""
    valor = os.getenv(f"CAMERA_ALUNO_{numero}", "").strip()
    try:
        return int(valor) if valor != "" else CAMERA_INDEX
    except ValueError:
        return CAMERA_INDEX


def _estado_vazio():
    return {
        "ligado": False,
        "gravando": False,
        "segundos_restantes": 0,
        "analisando": False,
        "clipes_analisados": 0,
        "inicio_sessao": None,
        "atualizado_em": None,
        "erro": "",
        "analise": dict(ANALISE_INICIAL),
        "alertas": [],
        "pose": {"ativa": False, "detectada": False, "angulos": {}},
    }


# ────────────────────────────────────────────────────────────────────
# PARTE 3 — SESSÃO (UMA "VAGA" PARA CADA ALUNO)
# A classe Sessao guarda tudo o que pertence a UM aluno: se está ligado, o que a IA
# respondeu, os alertas e a imagem da câmera. Assim, os dados de cada aluno ficam separados.
# Existem as vagas 1, 2 e 3 e a vaga 0 (aluno que se monitora sozinho no app).
# ────────────────────────────────────────────────────────────────────
class Sessao:
    """Tudo o que pertence a UM aluno: estado, thread de captura, vídeo e alertas."""

    def __init__(self, numero):
        self.numero = numero
        self.indice_camera = _indice_camera(numero)
        self.estado = _estado_vazio()
        self.lock = threading.Lock()
        self.iniciar_lock = threading.Lock()
        self.parar = threading.Event()
        self.thread = None
        self.ultimo_jpeg = None
        self.sid = 0
        self.em_analise = 0


# Cria todas as vagas de uma vez (0, 1, 2 e 3) e guarda no dicionário SESSOES.
# Os "locks" abaixo funcionam como uma trava de porta: evitam que duas partes do
# programa mexam na mesma coisa ao mesmo tempo.
SESSOES = {n: Sessao(n) for n in range(0, NUM_ALUNOS + 1)}  # 0 = auto-monitoramento do aluno
_cam_lock = threading.Lock()      # impede dois alunos de abrirem a mesma câmera ao mesmo tempo
_alerta_lock = threading.Lock()
_proximo_alerta = 1               # id de alerta único entre todos os alunos
client = None


# Funções pequenas de apoio: hora atual (para os avisos no terminal), cópia do estado de um aluno e busca de vaga pelo número.
def agora():
    return datetime.now().strftime("%H:%M:%S")


def iso_agora():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def snapshot(s):
    """Cópia do estado de um aluno."""
    with s.lock:
        return json.loads(json.dumps(s.estado))


def rotulo(n):
    return "o auto-monitoramento" if n == 0 else f"o Aluno {n}"


def obter_sessao(n):
    s = SESSOES.get(n)
    if s is None:
        raise HTTPException(status_code=404, detail=f"Vaga {n} não existe (use 0 a {NUM_ALUNOS}).")
    return s


# ────────────────────────────────────────────────────────────────────
# PARTE 4 — API PARA O APLICATIVO (A "PORTA DE ENTRADA")
# É por aqui que o app conversa com a câmera. Cada rota abaixo é um "endereço"
# que o app pode chamar: ver o status, ligar, desligar, ver o vídeo e resolver alertas.
# ────────────────────────────────────────────────────────────────────
# ------------------------- API PARA O APLICATIVO -------------------------
app = FastAPI(title="API de Monitoramento de Exercícios")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Rota /status: devolve como está cada aluno (ligado, análise atual, alertas).
@app.get("/status")
def obter_status():
    return {"alunos": {str(n): snapshot(s) for n, s in SESSOES.items()}}


# Rota /alunos/N/status: devolve o estado de um aluno só.
@app.get("/alunos/{n}/status")
def obter_status_aluno(n: int):
    return snapshot(obter_sessao(n))


# ────────────────────────────────────────────────────────────────────
# PARTE 5 — LIGAR E DESLIGAR O MONITORAMENTO
# iniciar: confere se a chave da IA existe, se a câmera está livre e se está enviando
# imagem. Se tudo estiver certo, zera o estado e começa a gravar em segundo plano.
# parar: pede para a gravação terminar e marca o aluno como desligado.
# ────────────────────────────────────────────────────────────────────
def iniciar(s):
    with s.iniciar_lock:
        if s.estado["ligado"]:
            return {"ok": True, **snapshot(s)}
        if client is None:
            s.estado["erro"] = "GEMINI_API_KEY não definida (camera/.env)."
            return {"ok": False, **snapshot(s)}

        with _cam_lock:
            for outro in SESSOES.values():
                if outro is not s and outro.estado["ligado"] and outro.indice_camera == s.indice_camera:
                    s.estado["erro"] = (
                        f"A câmera {s.indice_camera} já está sendo usada por {rotulo(outro.numero)}. "
                        f"Pare esse monitoramento antes de ligar {rotulo(s.numero)} "
                        "(ou configure outra câmera em camera/.env)."
                    )
                    return {"ok": False, **snapshot(s)}

            backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
            cap = cv2.VideoCapture(s.indice_camera, backend)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, LARGURA)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, ALTURA)
            if not cap.isOpened():
                cap.release()
                s.estado["erro"] = f"Não consegui abrir a webcam (índice {s.indice_camera}). Feche outros programas que usam a câmera ou troque o índice."
                return {"ok": False, **snapshot(s)}

            fps, tamanho = medir_fps(cap)
            if fps is None:
                cap.release()
                s.estado["erro"] = "A câmera abriu, mas não está enviando imagem."
                return {"ok": False, **snapshot(s)}

            s.parar.clear()
            s.ultimo_jpeg = None
            with s.lock:
                s.sid += 1
                s.estado.update(
                    ligado=True,
                    gravando=False,
                    segundos_restantes=0,
                    analisando=False,
                    clipes_analisados=0,
                    inicio_sessao=iso_agora(),
                    atualizado_em=None,
                    erro="",
                    analise=dict(ANALISE_INICIAL),
                    alertas=[],
                    pose={"ativa": POSE_ATIVA and POSE_DISPONIVEL, "detectada": False, "angulos": {}},
                )
                sid = s.sid

        s.thread = threading.Thread(
            target=ciclo_captura, args=(s, cap, fps, tamanho, sid), daemon=True
        )
        s.thread.start()
        print(f"[{agora()}] Aluno {s.numero}: análise LIGADA (sessão {sid}).")
        return {"ok": True, **snapshot(s)}


# Desliga o monitoramento do aluno e espera a gravação encerrar com segurança.
def parar(s):
    s.parar.set()
    t = s.thread
    if t is not None and t.is_alive():
        t.join(timeout=10)
    with s.lock:
        s.estado["ligado"] = False
        s.estado["gravando"] = False
        s.estado["segundos_restantes"] = 0
    print(f"[{agora()}] Aluno {s.numero}: análise DESLIGADA.")
    return snapshot(s)


# Rota que o botão "ligar" do app chama.
@app.post("/alunos/{n}/iniciar")
def iniciar_aluno(n: int):
    return iniciar(obter_sessao(n))


# Rota que o botão "desligar" do app chama.
@app.post("/alunos/{n}/parar")
def parar_aluno(n: int):
    return parar(obter_sessao(n))


# Rota que marca um alerta como resolvido (quando o professor já tratou o problema).
@app.post("/alertas/{alerta_id}/resolver")
def resolver_alerta(alerta_id: int):
    for s in SESSOES.values():
        with s.lock:
            for a in s.estado["alertas"]:
                if a["id"] == alerta_id:
                    a["resolvido"] = True
                    return {"id": alerta_id, "resolvido": True}
    return {"id": alerta_id, "resolvido": False}


# Rota do vídeo ao vivo: envia a imagem da câmera quadro a quadro para o app mostrar na tela.
@app.get("/alunos/{n}/video")
def video(n: int):
    s = obter_sessao(n)

    def gerar():
        while s.estado["ligado"]:
            jpg = s.ultimo_jpeg
            if jpg:
                yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpg + b"\r\n")
            time.sleep(0.1)

    return StreamingResponse(
        gerar(), media_type="multipart/x-mixed-replace; boundary=frame"
    )


# Sobe o servidor da API na porta definida nas configurações.
def iniciar_servidor_api():
    uvicorn.run(app, host="0.0.0.0", port=PORTA, log_level="warning")


# ────────────────────────────────────────────────────────────────────
# PARTE 6 — PROMPT (AS INSTRUÇÕES PARA A IA)
# É o texto enviado junto com o vídeo. Ele diz ao Gemini: "você é um especialista em
# biomecânica, analise o exercício e responda neste formato". A resposta traz o nome do
# exercício, as repetições, a correção e um status:
# - ok: execução correta
# - warn: desvio leve de postura
# - danger: execução errada ou risco de lesão
# ────────────────────────────────────────────────────────────────────
# ------------------------- PROMPT -------------------------
PROMPT = """
Você é um especialista em análise biomecânica de exercícios físicos.

Analise o vídeo da câmera e responda EXCLUSIVAMENTE em formato JSON com esta estrutura:
{
  "status": "ok" | "warn" | "danger",
  "exercise": "Nome do exercício (ex: Agachamento, Polichinelo, Flexão, Nenhum)",
  "reps": <número estimado de repetições completadas>,
  "targetReps": 10,
  "sets": "1ª Série",
  "feedback": "Mensagem curta de correção ou confirmação",
  "problema": "Título curto do erro de execução (ex: Joelhos para dentro). Vazio se status for ok",
  "risco": "Risco de lesão associado, em uma frase. Vazio se status for ok"
}

Regras para a chave 'status':
- 'ok': Execução correta do exercício.
- 'warn': Desvio leve de postura, velocidade inadequada ou risco de erro.
- 'danger': Execução totalmente incorreta ou perigo de lesão.

Se não houver ninguém se exercitando, retorne:
{
  "status": "ok",
  "exercise": "Nenhum exercício",
  "reps": 0,
  "targetReps": 10,
  "sets": "1ª Série",
  "feedback": "Nenhum movimento identificado no momento.",
  "problema": "",
  "risco": ""
}
"""


# Converte a resposta da IA em número inteiro; se vier algo estranho, usa um valor padrão.
def _inteiro(v, padrao=0):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return padrao


# ────────────────────────────────────────────────────────────────────
# PARTE 7 — REGISTRO DOS RESULTADOS E ALERTAS
# Recebe a resposta da IA, confere se está no formato certo e atualiza o estado do aluno.
# Se o status for warn ou danger, cria um ALERTA (erro, risco de lesão e horário),
# evitando repetir o mesmo alerta várias vezes seguidas.
# ────────────────────────────────────────────────────────────────────
def _normalizar(dados):
    """Confere a resposta da IA e devolve (analise, problema, risco) já no formato certo."""
    status = dados.get("status")
    if status not in ("ok", "warn", "danger"):
        status = "ok"
    analise = {
        "status": status,
        "exercise": str(dados.get("exercise") or "Nenhum exercício"),
        "reps": _inteiro(dados.get("reps")),
        "targetReps": _inteiro(dados.get("targetReps"), 10) or 10,
        "sets": str(dados.get("sets") or "1ª Série"),
        "feedback": str(dados.get("feedback") or ""),
    }
    problema = str(dados.get("problema") or "").strip()
    risco = str(dados.get("risco") or "").strip()
    return analise, problema, risco


def registrar_analise(s, dados, sid):
    global _proximo_alerta
    analise, problema, risco = _normalizar(dados)
    status = analise["status"]

    with s.lock:
        if sid != s.sid:  # resultado de uma sessão que já acabou
            return False
        s.estado["analise"] = analise
        s.estado["clipes_analisados"] += 1
        s.estado["atualizado_em"] = iso_agora()
        s.estado["erro"] = ""
        if status != "ok":
            titulo = problema or analise["feedback"] or "Execução incorreta"
            repetido = any(
                (not a["resolvido"])
                and a["titulo_erro"] == titulo
                and a["exercicio"] == analise["exercise"]
                for a in s.estado["alertas"][:3]
            )
            if not repetido:
                with _alerta_lock:
                    novo_id = _proximo_alerta
                    _proximo_alerta += 1
                s.estado["alertas"].insert(0, {
                    "id": novo_id,
                    "titulo_erro": titulo,
                    "detalhes_sensor": analise["feedback"] or titulo,
                    "risco_lesao": risco or None,
                    "severidade": status,
                    "exercicio": analise["exercise"],
                    "data_hora_alerta": iso_agora(),
                    "resolvido": False,
                })
    return True


# Limpa a resposta da IA (remove marcações extras) e a transforma em dados que o programa entende.
def _limpar_json(texto):
    texto = (texto or "").strip()
    texto = re.sub(r"^```(?:json)?\s*|\s*```$", "", texto)
    return json.loads(texto)


# gemini-X[.Y]-flash[-lite], opcionalmente "-preview" e/ou sufixo numérico (-001, -002...)
_PADRAO_MODELO = re.compile(r"gemini-(\d+(?:\.\d+)?)-flash(-lite)?(-preview(?:-\d{2}-\d{2,4})?)?(-\d{3})?")


# ────────────────────────────────────────────────────────────────────
# PARTE 8 — ARMAZENAMENTO DAS ANÁLISES EM TXT
# Toda análise feita pela IA (monitoramento ao vivo ou vídeo enviado pelo app) é gravada
# como um arquivo .txt na pasta camera/analises (ou na pasta definida em ANALISES_DIR).
# Cada arquivo tem data/hora, aluno, exercício, status, repetições, correção, problema e
# risco de lesão, e o nome já indica quando e de quem foi a análise.
# ────────────────────────────────────────────────────────────────────
ROTULO_STATUS = {"ok": "Correto", "warn": "Atenção", "danger": "Erro"}
_txt_lock = threading.Lock()


# Transforma um texto em um pedaço seguro para nome de arquivo (sem acento, espaço ou símbolo).
def _slug(texto, limite=40):
    texto = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode()
    texto = re.sub(r"[^A-Za-z0-9]+", "-", texto).strip("-").lower()
    return texto[:limite].strip("-") or "sem-nome"


# Grava a análise em um .txt dentro de PASTA_ANALISES e devolve o nome do arquivo (None se falhar).
def salvar_analise_txt(origem, quem, dados, modelo="", arquivo_video="", pose_linhas=None):
    try:
        analise, problema, risco = _normalizar(dados)
        momento = datetime.now()
        linhas = [
            "SMART MIRROR — ANÁLISE DE EXERCÍCIO",
            "=" * 40,
            f"Data/hora ......: {momento:%d/%m/%Y %H:%M:%S}",
            f"Origem .........: {origem}",
            f"Aluno ..........: {quem}",
        ]
        if arquivo_video:
            linhas.append(f"Vídeo ..........: {arquivo_video}")
        linhas += [
            f"Modelo de IA ...: {modelo or '-'}",
            "-" * 40,
            f"Exercício ......: {analise['exercise']}",
            f"Status .........: {ROTULO_STATUS[analise['status']]} ({analise['status']})",
            f"Repetições .....: {analise['reps']} de {analise['targetReps']}",
            f"Série ..........: {analise['sets']}",
            f"Correção .......: {analise['feedback'] or '-'}",
            f"Problema .......: {problema or '-'}",
            f"Risco de lesão .: {risco or '-'}",
        ]
        if pose_linhas:
            linhas.append("-" * 40)
            linhas.append("Medições de pose (MediaPipe) neste clipe:")
            linhas += [f"  {linha}" for linha in pose_linhas]
        base = f"{momento:%Y-%m-%d_%H-%M-%S}_{_slug(quem)}_{_slug(analise['exercise'])}"
        with _txt_lock:
            nome, n = base + ".txt", 2
            while os.path.exists(os.path.join(PASTA_ANALISES, nome)):
                nome, n = f"{base}_{n}.txt", n + 1
            with open(os.path.join(PASTA_ANALISES, nome), "w", encoding="utf-8") as f:
                f.write("\n".join(linhas) + "\n")
        return nome
    except Exception as e:
        print(f"[{agora()}] Não consegui salvar a análise em TXT: {e}")
        return None


# ────────────────────────────────────────────────────────────────────
# PARTE 9 — TROCA AUTOMÁTICA DE VERSÃO DA IA (FALLBACK)
# O Gemini às vezes fica sobrecarregado ou demora. Para o aluno nunca ver erro, o
# programa tem uma fila de versões:
# - descobrir_modelos: consulta a chave e monta a fila. Começa pelo 3.5 lite, depois o
#   3.5 flash, depois as versões mais antigas e, por último, as mais novas.
# - gerar_com_fallback: tenta uma versão por vez. Se passar de 7 segundos sem resposta
#   (ou der erro), passa para a próxima. Se a fila inteira falhar, espera e tenta de novo.
# ────────────────────────────────────────────────────────────────────
def descobrir_modelos():
    """Monta a fila com TODAS as versões flash / flash-lite que a chave enxerga (mais nova primeiro)."""
    global MODELOS_GEMINI
    try:
        achados = {}
        for m in client.models.list():
            nome = (m.name or "").replace("models/", "", 1)
            achou = _PADRAO_MODELO.fullmatch(nome)
            if not achou:
                continue
            acoes = getattr(m, "supported_actions", None)
            if acoes and "generateContent" not in acoes:
                continue
            versao = tuple(int(x) for x in achou.group(1).split("."))
            versao += (0,) * (2 - len(versao))
            lite = 1 if achou.group(2) else 0
            if versao == VERSAO_INICIAL:
                lite = 1 - lite  # na versão inicial o flash-lite vem ANTES do flash
            previa = 1 if achou.group(3) else 0
            # grupo 0 = versão inicial (3.5 lite, depois 3.5 flash); 1 = mais antigas que ela; 2 = mais novas que ela
            if versao == VERSAO_INICIAL:
                grupo = 0
            elif versao < VERSAO_INICIAL:
                grupo = 1
            else:
                grupo = 2
            sinal = 1 if grupo == 2 else -1  # mais novas que a inicial: da mais próxima (3.6) para a mais distante
            achados[nome] = (grupo, sinal * versao[0], sinal * versao[1], lite, previa, nome)
        # começa na versão inicial (lite primeiro), depois as mais antigas (da mais nova para a mais velha) e, por
        # último, as mais novas; na mesma versão: flash antes de flash-lite, estável antes de prévia
        ordem = sorted(achados, key=lambda n: achados[n])
        if ordem:
            MODELOS_GEMINI = ordem[:MAX_MODELOS] if MAX_MODELOS else ordem
    except Exception as e:
        print(f"[AVISO] Não consegui listar os modelos do Gemini ({e}); usando a lista padrão.")


# Faz UMA tentativa: manda o vídeo e o prompt para uma versão específica do Gemini.
def _tentar_modelo(modelo, arquivo_remoto, dica=""):
    resposta = client.models.generate_content(
        model=modelo,
        contents=[arquivo_remoto, PROMPT + dica],
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    return _limpar_json(resposta.text)


def _nome_log(s):
    return f"Aluno {s.numero}" if s.numero >= 0 else "Vídeo enviado"


def _sessao_ativa(s, sid):
    return (not s.parar.is_set()) and sid == s.sid


# Identifica erros sem solução (modelo inexistente ou sem permissão) para não tentar de novo à toa.
def _erro_definitivo(e):
    """Erros que não adianta repetir com o mesmo modelo (modelo inexistente / sem permissão)."""
    texto = str(e)
    return any(c in texto for c in ("404", "NOT_FOUND", "403", "PERMISSION_DENIED"))


# Percorre a fila de versões, respeitando o tempo limite de cada uma (veja a explicação da PARTE 9).
def gerar_com_fallback(s, arquivo_remoto, sid, dica=""):
    """Tenta a versão inicial (3.5 lite) primeiro; se passar de TEMPO_LIMITE_MODELO (7 s) (ou falhar, ex.: 503), vai para a próxima.

    Nunca devolve erro de "alta demanda" ao app: se a fila inteira falhar, espera um instante e
    percorre a fila de novo, até alguma versão responder (ou a sessão ser encerrada).
    """
    ultimo_erro = None
    descartados = set()
    for rodada in range(MAX_RODADAS):
        modelos = [m for m in MODELOS_GEMINI if m not in descartados]
        if not modelos:
            break
        limite = min(TEMPO_LIMITE_MODELO + rodada * ACRESCIMO_POR_RODADA, TEMPO_LIMITE_MAXIMO)
        for modelo in modelos:
            if not _sessao_ativa(s, sid):
                raise RuntimeError("sessão encerrada")
            pool = ThreadPoolExecutor(max_workers=1)
            futuro = pool.submit(_tentar_modelo, modelo, arquivo_remoto, dica)
            try:
                return futuro.result(timeout=limite), modelo
            except TempoEsgotado:
                ultimo_erro = f"{modelo} não respondeu em {limite}s"
            except Exception as e:
                ultimo_erro = f"{modelo}: {str(e)[:120]}"
                if _erro_definitivo(e):
                    descartados.add(modelo)
            finally:
                pool.shutdown(wait=False)  # uma chamada atrasada é simplesmente descartada
            print(f"[{agora()}] {_nome_log(s)}: {ultimo_erro}; tentando a próxima versão...")
        # fila inteira falhou: pausa curta (interrompível) e recomeça pela versão mais nova
        s.parar.wait(ESPERA_ENTRE_RODADAS)
    raise RuntimeError(f"nenhuma versão do Gemini respondeu ({ultimo_erro})")


# ────────────────────────────────────────────────────────────────────
# PARTE 10 — ANÁLISE DO CLIPE COM A IA
# analisar_clipe: envia o vídeo ao Gemini, espera ele processar, pede a análise
# (usando a troca de versão da PARTE 9), registra o resultado e apaga o vídeo.
# Se algo falhar, o erro aparece só no terminal; o app não mostra nada e o próximo clipe segue normal.
# trabalhador: fica em segundo plano pegando os clipes da fila, para a câmera
# não parar de gravar enquanto a IA ainda está pensando.
# ────────────────────────────────────────────────────────────────────
def analisar_clipe(s, caminho, sid, pose_linhas=None):
    nome = os.path.basename(caminho)
    arquivo_remoto = None
    with s.lock:
        s.em_analise += 1
        s.estado["analisando"] = True
    try:
        print(f"[{agora()}] Aluno {s.numero}: enviando {nome} para o Gemini...")
        for tentativa in range(4):  # o envio também pode dar 503 em alta demanda
            try:
                arquivo_remoto = client.files.upload(file=caminho)
                break
            except Exception as e:
                if tentativa == 3 or not _sessao_ativa(s, sid):
                    raise
                print(f"[{agora()}] Aluno {s.numero}: envio falhou ({str(e)[:80]}); tentando de novo...")
                s.parar.wait(2 * (tentativa + 1))
        while arquivo_remoto.state.name == "PROCESSING":
            time.sleep(1)
            arquivo_remoto = client.files.get(name=arquivo_remoto.name)
        if arquivo_remoto.state.name != "ACTIVE":
            raise RuntimeError("o Gemini não conseguiu processar o vídeo")

        dados, modelo = gerar_com_fallback(s, arquivo_remoto, sid, _dica_pose(pose_linhas))
        if registrar_analise(s, dados, sid):
            quem = "Auto-monitoramento (vaga 0)" if s.numero == 0 else f"Aluno {s.numero}"
            arquivo_txt = salvar_analise_txt("Monitoramento ao vivo", quem, dados, modelo, pose_linhas=pose_linhas)
            print(f"[{agora()}] Aluno {s.numero}: [{modelo}] {dados.get('status')} | {dados.get('exercise')} | reps {dados.get('reps')} | {dados.get('feedback')}")
            if arquivo_txt:
                print(f"[{agora()}] Aluno {s.numero}: análise salva em analises/{arquivo_txt}")
    except Exception as e:
        # Falhas de IA (alta demanda, 503, tempo esgotado...) ficam só no terminal: o app não
        # mostra erro; o próximo clipe é analisado normalmente.
        print(f"[{agora()}] Aluno {s.numero}: clipe {nome} descartado: {e}")
    finally:
        with s.lock:
            s.em_analise -= 1
            s.estado["analisando"] = s.em_analise > 0
        if arquivo_remoto is not None:
            try:
                client.files.delete(name=arquivo_remoto.name)
            except Exception:
                pass
        if APAGAR_CLIPES_LOCAIS:
            try:
                os.remove(caminho)
            except OSError:
                pass


# Pega os clipes da fila, um por vez, e manda analisar. Descarta tudo se a sessão já foi encerrada.
def trabalhador(s, fila, sid):
    while True:
        item = fila.get()
        if item is None:
            break
        caminho, pose_linhas = item
        if s.parar.is_set() or sid != s.sid:  # sessão encerrada: descarta
            try:
                os.remove(caminho)
            except OSError:
                pass
            continue
        analisar_clipe(s, caminho, sid, pose_linhas)


# ────────────────────────────────────────────────────────────────────
# PARTE 11 — ANÁLISE DE VÍDEO ENVIADO (VERSÃO DE DEMONSTRAÇÃO DO APP)
# Na demonstração não há câmera ao vivo: a pessoa escolhe um vídeo de exercício no app e
# ele é enviado para cá. O servidor guarda o arquivo, manda para o Gemini (com a mesma
# troca automática de versões da PARTE 9), salva o resultado em TXT e o app consulta o andamento.
# - POST /analisar-video: recebe o vídeo e começa a análise em segundo plano (devolve um id).
# - GET  /analisar-video/{id}: mostra o andamento e, quando termina, o resultado.
# ────────────────────────────────────────────────────────────────────
ANALISES_VIDEO = {}             # id -> andamento da análise de cada vídeo enviado
_videos_lock = threading.Lock()
_proximo_video = 1
MAX_ANALISES_GUARDADAS = 50     # só os andamentos mais recentes ficam na memória


# Atualiza o andamento de uma análise de vídeo (com trava, pois o app consulta ao mesmo tempo).
def _atualizar_video(job, **campos):
    with _videos_lock:
        job.update(campos)
        job["atualizado_em"] = iso_agora()


# Devolve uma cópia do andamento, segura para enviar ao app.
def _copia_video(job):
    with _videos_lock:
        return json.loads(json.dumps(job))


# Roda em segundo plano: envia o vídeo ao Gemini, analisa, salva o TXT e apaga o arquivo local.
def analisar_video_enviado(job, caminho):
    s = Sessao(-1)  # sessão "solta": só serve para reaproveitar a troca de versões da IA
    arquivo_remoto = None
    try:
        _atualizar_video(job, mensagem="Enviando o vídeo para a IA...")
        for tentativa in range(4):  # o envio também pode dar 503 em alta demanda
            try:
                arquivo_remoto = client.files.upload(file=caminho)
                break
            except Exception as e:
                if tentativa == 3:
                    raise
                print(f"[{agora()}] Vídeo enviado: envio falhou ({str(e)[:80]}); tentando de novo...")
                time.sleep(2 * (tentativa + 1))
        _atualizar_video(job, mensagem="A IA está processando o vídeo...")
        while arquivo_remoto.state.name == "PROCESSING":
            time.sleep(1)
            arquivo_remoto = client.files.get(name=arquivo_remoto.name)
        if arquivo_remoto.state.name != "ACTIVE":
            raise RuntimeError("o Gemini não conseguiu processar o vídeo")

        _atualizar_video(job, mensagem="Analisando a execução do exercício...")
        dados, modelo = gerar_com_fallback(s, arquivo_remoto, s.sid)
        analise, problema, risco = _normalizar(dados)
        arquivo_txt = salvar_analise_txt("Vídeo enviado (demonstração)", job["aluno"] or "Sem nome", dados, modelo, job["arquivo"])
        _atualizar_video(
            job,
            estado="concluido",
            mensagem="Análise concluída.",
            resultado={**analise, "problema": problema, "risco": risco},
            modelo=modelo,
            arquivo_txt=arquivo_txt,
        )
        print(f"[{agora()}] Vídeo enviado ({job['arquivo']}): [{modelo}] {analise['status']} | {analise['exercise']} | reps {analise['reps']} | {analise['feedback']}")
        if arquivo_txt:
            print(f"[{agora()}] Vídeo enviado: análise salva em analises/{arquivo_txt}")
    except Exception as e:
        print(f"[{agora()}] Vídeo enviado ({job['arquivo']}): análise falhou: {e}")
        _atualizar_video(
            job,
            estado="erro",
            mensagem="",
            erro="A IA não conseguiu analisar o vídeo agora (muita demanda ou vídeo inválido). Tente novamente em instantes.",
        )
    finally:
        if arquivo_remoto is not None:
            try:
                client.files.delete(name=arquivo_remoto.name)
            except Exception:
                pass
        try:
            os.remove(caminho)
        except OSError:
            pass


# Rota que recebe o vídeo (corpo da requisição = o arquivo) e começa a análise em segundo plano.
@app.post("/analisar-video")
async def receber_video(request: Request, aluno: str = "", arquivo: str = "video.mp4"):
    global _proximo_video
    if client is None:
        raise HTTPException(status_code=503, detail="GEMINI_API_KEY não definida (camera/.env).")
    nome = os.path.basename(arquivo.replace("\\", "/")) or "video.mp4"
    extensao = os.path.splitext(nome)[1].lower()
    if extensao not in EXTENSOES_VIDEO:
        raise HTTPException(
            status_code=400,
            detail="Formato de vídeo não aceito. Use " + ", ".join(e.lstrip(".") for e in EXTENSOES_VIDEO) + ".",
        )
    limite = MAX_UPLOAD_MB * 1024 * 1024
    declarado = request.headers.get("content-length", "")
    if declarado.isdigit() and int(declarado) > limite:
        raise HTTPException(status_code=413, detail=f"Vídeo grande demais (máximo {MAX_UPLOAD_MB} MB).")

    with _videos_lock:
        vid = _proximo_video
        _proximo_video += 1
    caminho = os.path.join(PASTA_CLIPES, f"upload_{vid}{extensao}")
    total = 0
    try:
        with open(caminho, "wb") as f:
            async for pedaco in request.stream():
                total += len(pedaco)
                if total > limite:
                    raise HTTPException(status_code=413, detail=f"Vídeo grande demais (máximo {MAX_UPLOAD_MB} MB).")
                f.write(pedaco)
        if total == 0:
            raise HTTPException(status_code=400, detail="O vídeo chegou vazio.")
    except HTTPException:
        _remover_se_existir(caminho)
        raise
    except Exception:
        _remover_se_existir(caminho)
        raise HTTPException(status_code=400, detail="Não consegui receber o vídeo. Tente de novo.")

    job = {
        "id": vid,
        "estado": "analisando",
        "mensagem": "Vídeo recebido.",
        "aluno": aluno.strip()[:80],
        "arquivo": nome[:120],
        "resultado": None,
        "modelo": "",
        "arquivo_txt": None,
        "erro": "",
        "criado_em": iso_agora(),
        "atualizado_em": iso_agora(),
    }
    with _videos_lock:
        ANALISES_VIDEO[vid] = job
        for antigo in sorted(ANALISES_VIDEO)[:-MAX_ANALISES_GUARDADAS]:
            ANALISES_VIDEO.pop(antigo, None)
    threading.Thread(target=analisar_video_enviado, args=(job, caminho), daemon=True).start()
    print(f"[{agora()}] Vídeo enviado: {nome} recebido ({total // 1024} KB) para {job['aluno'] or 'aluno sem nome'}.")
    return _copia_video(job)


# Rota que mostra o andamento (e o resultado) da análise de um vídeo enviado.
@app.get("/analisar-video/{vid}")
def andamento_video(vid: int):
    job = ANALISES_VIDEO.get(vid)
    if job is None:
        raise HTTPException(status_code=404, detail="Análise não encontrada (o servidor pode ter sido reiniciado).")
    return _copia_video(job)


def _remover_se_existir(caminho):
    try:
        os.remove(caminho)
    except OSError:
        pass


# ────────────────────────────────────────────────────────────────────
# PARTE 12 — POSE ESTIMATION (ESQUELETO EM TEMPO REAL)
# O MediaPipe Pose encontra 33 pontos do corpo (ombros, cotovelos, quadril, joelhos...).
# Cada aluno ligado tem um RastreadorPose, que roda em uma thread própria: ele analisa o
# quadro mais recente da câmera e a gravação nunca espera por ele (se a pose ficar lenta,
# só o esqueleto atualiza menos vezes por segundo; o vídeo continua fluido).
# O esqueleto é desenhado em cada quadro, aparece ao vivo no app e (se POSE_GRAVAR_NO_CLIPE)
# também no clipe gravado. Os ângulos das articulações são medidos a cada quadro:
# - aparecem no status do aluno (o app mostra ao vivo);
# - viram um resumo (mín/máx/média por clipe) enviado à IA como apoio e salvo no TXT.
# Se o mediapipe não estiver instalado, nada disso liga e o resto do sistema funciona igual.
# ────────────────────────────────────────────────────────────────────
# Cada articulação é medida pelo ângulo formado por 3 pontos do corpo (números do MediaPipe):
# (ponto de um lado, a articulação no meio, ponto do outro lado). Esquerdo/direito é o lado da pessoa.
ARTICULACOES = {
    "joelho esquerdo": (23, 25, 27),
    "joelho direito": (24, 26, 28),
    "cotovelo esquerdo": (11, 13, 15),
    "cotovelo direito": (12, 14, 16),
    "quadril esquerdo": (11, 23, 25),
    "quadril direito": (12, 24, 26),
    "ombro esquerdo": (13, 11, 23),
    "ombro direito": (14, 12, 24),
}
NOME_TRONCO = "inclinação do tronco"            # 0° = em pé, 90° = deitado
ARTICULACOES_NO_VIDEO = ("joelho esquerdo", "joelho direito", "cotovelo esquerdo", "cotovelo direito")
COR_LINHA = (127, 255, 0)   # cores em BGR (padrão do OpenCV)
COR_PONTO = (0, 0, 255)
COR_TEXTO = (255, 255, 255)


# Ângulo (em graus) no ponto b, formado pelos segmentos b→a e b→c. None se algum segmento for nulo.
def _angulo(a, b, c):
    v1 = (a[0] - b[0], a[1] - b[1])
    v2 = (c[0] - b[0], c[1] - b[1])
    n1, n2 = math.hypot(*v1), math.hypot(*v2)
    if n1 < 1e-6 or n2 < 1e-6:
        return None
    cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)
    return math.degrees(math.acos(max(-1.0, min(1.0, cos))))


# Recebe os pontos do corpo [(x, y, visibilidade)...] em pixels e devolve {nome: graus}
# só das articulações cujos pontos o MediaPipe enxerga com segurança.
def calcular_angulos(pontos):
    angulos = {}
    for nome, (i, j, k) in ARTICULACOES.items():
        a, b, c = pontos[i], pontos[j], pontos[k]
        if min(a[2], b[2], c[2]) < POSE_VISIBILIDADE:
            continue
        graus = _angulo(a, b, c)
        if graus is not None:
            angulos[nome] = graus
    tronco = [pontos[i] for i in (11, 12, 23, 24)]
    if min(p[2] for p in tronco) >= POSE_VISIBILIDADE:
        dx = (pontos[11][0] + pontos[12][0]) / 2 - (pontos[23][0] + pontos[24][0]) / 2
        dy = (pontos[11][1] + pontos[12][1]) / 2 - (pontos[23][1] + pontos[24][1]) / 2
        if abs(dx) + abs(dy) > 1e-6:
            angulos[NOME_TRONCO] = math.degrees(math.atan2(abs(dx), -dy))
    return angulos


class RastreadorPose:
    """Esqueleto e ângulos de UM aluno, calculados em uma thread própria."""

    def __init__(self):
        self._lock = threading.Lock()
        self._evento = threading.Event()
        self._quadro = None
        self._ocupado = False        # True enquanto há um quadro esperando ou sendo analisado
        self._parar = False
        self._falhou = False
        self._pontos = None          # último esqueleto: [(x, y, visibilidade)...] em pixels
        self._angulos = {}
        self._visto_em = 0.0
        self._conexoes = [(a, b) for a, b in POSE_CONEXOES if a >= 11 and b >= 11]
        self.iniciar_clipe()
        self._thread = threading.Thread(target=self._trabalhar, daemon=True)
        self._thread.start()

    # Zera as estatísticas do clipe (chamado no começo de cada gravação)
    def iniciar_clipe(self):
        with self._lock:
            self._quadros = 0
            self._com_pose = 0
            self._agg = {}  # nome -> [mínimo, máximo, soma, quantidade]

    # Entrega o quadro atual para a análise. Se a thread ainda está ocupada, este quadro é pulado.
    def submeter(self, quadro):
        if self._ocupado or self._parar or self._falhou:
            return
        with self._lock:
            self._quadro = quadro.copy()  # cópia: o desenho na imagem principal não pode atrapalhar
            self._ocupado = True
        self._evento.set()

    # Thread: espera quadros novos e analisa um de cada vez (descarta os que não deu tempo).
    def _trabalhar(self):
        try:
            if POSE_MODO == "solutions":
                pose = _mp_pose.Pose(
                    static_image_mode=False,
                    model_complexity=POSE_COMPLEXIDADE,
                    smooth_landmarks=True,
                    min_detection_confidence=POSE_CONFIANCA,
                    min_tracking_confidence=POSE_CONFIANCA,
                )
            else:
                opcoes = _mp_vision.PoseLandmarkerOptions(
                    base_options=_mp_tasks.BaseOptions(model_asset_path=_caminho_modelo_pose(POSE_COMPLEXIDADE)),
                    running_mode=_mp_vision.RunningMode.VIDEO,
                    num_poses=1,
                    min_pose_detection_confidence=POSE_CONFIANCA,
                    min_pose_presence_confidence=POSE_CONFIANCA,
                    min_tracking_confidence=POSE_CONFIANCA,
                )
                pose = _mp_vision.PoseLandmarker.create_from_options(opcoes)
        except Exception as e:
            self._falhou = True
            print(f"[{agora()}] Pose estimation desligada: não consegui iniciar o MediaPipe ({e}).")
            return
        avisou = False
        try:
            while True:
                self._evento.wait()
                self._evento.clear()
                if self._parar:
                    break
                with self._lock:
                    quadro, self._quadro = self._quadro, None
                if quadro is None:
                    self._ocupado = False
                    continue
                try:
                    self._processar(pose, quadro)
                except Exception as e:
                    if not avisou:
                        avisou = True
                        print(f"[{agora()}] Pose estimation: falha em um quadro ({e}).")
                finally:
                    self._ocupado = False
        finally:
            try:
                pose.close()
            except Exception:
                pass

    # Detecta o corpo no quadro, mede os ângulos e atualiza o esqueleto e as estatísticas do clipe.
    def _processar(self, pose, quadro):
        altura, largura = quadro.shape[:2]
        rgb = cv2.cvtColor(quadro, cv2.COLOR_BGR2RGB)
        if POSE_MODO == "solutions":
            marcos = pose.process(rgb).pose_landmarks
            lista = marcos.landmark if marcos is not None else None
        else:
            self._ts_ms = max(getattr(self, "_ts_ms", 0) + 1, int(time.time() * 1000))  # precisa crescer sempre
            res = pose.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), self._ts_ms)
            lista = res.pose_landmarks[0] if res.pose_landmarks else None
        with self._lock:
            self._quadros += 1
            if lista is None:
                self._pontos = None
                self._angulos = {}
                return
            pontos = [(m.x * largura, m.y * altura, (m.visibility if m.visibility is not None else 1.0)) for m in lista]
            angulos = calcular_angulos(pontos)
            self._pontos, self._angulos, self._visto_em = pontos, angulos, time.time()
            self._com_pose += 1
            for nome, graus in angulos.items():
                a = self._agg.setdefault(nome, [graus, graus, 0.0, 0])
                a[0], a[1], a[2], a[3] = min(a[0], graus), max(a[1], graus), a[2] + graus, a[3] + 1

    # Desenha o esqueleto (linhas verdes, pontos vermelhos e os ângulos dos joelhos/cotovelos) no quadro.
    def desenhar(self, quadro):
        with self._lock:
            pontos, angulos = self._pontos, dict(self._angulos)
            recente = (time.time() - self._visto_em) < 0.7
        if not pontos or not recente:
            return
        ok = lambda i: pontos[i][2] >= POSE_VISIBILIDADE
        xy = lambda i: (int(pontos[i][0]), int(pontos[i][1]))
        for a, b in self._conexoes:
            if ok(a) and ok(b):
                cv2.line(quadro, xy(a), xy(b), COR_LINHA, 2, cv2.LINE_AA)
        for i in range(11, 33):
            if ok(i):
                cv2.circle(quadro, xy(i), 4, COR_PONTO, -1, cv2.LINE_AA)
        for nome in ARTICULACOES_NO_VIDEO:
            if nome in angulos:
                x, y = xy(ARTICULACOES[nome][1])
                texto = str(int(round(angulos[nome])))
                cv2.putText(quadro, texto, (x + 8, y - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 3, cv2.LINE_AA)
                cv2.putText(quadro, texto, (x + 8, y - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, COR_TEXTO, 1, cv2.LINE_AA)

    # Situação atual para o app: se há pessoa detectada e os ângulos medidos agora.
    def estado_atual(self):
        with self._lock:
            recente = self._pontos is not None and (time.time() - self._visto_em) < 0.7
            return {
                "ativa": True,
                "detectada": bool(recente),
                "angulos": {n: int(round(g)) for n, g in self._angulos.items()} if recente else {},
            }

    # Resumo do clipe (uma linha por articulação: mín/máx/média). Vazio se quase não detectou ninguém.
    def resumo_clipe(self):
        with self._lock:
            quadros, com_pose, agg = self._quadros, self._com_pose, dict(self._agg)
        if quadros == 0 or com_pose / quadros < 0.2:
            return []
        linhas = []
        for nome in list(ARTICULACOES) + [NOME_TRONCO]:
            if nome in agg and agg[nome][3] >= 5:
                menor, maior, soma, n = agg[nome]
                linhas.append(f"{nome}: mín {menor:.0f}°, máx {maior:.0f}°, média {soma / n:.0f}°")
        if linhas:
            linhas.append(f"pose detectada em {100 * com_pose / quadros:.0f}% dos quadros analisados")
        return linhas

    def fechar(self):
        self._parar = True
        self._evento.set()
        self._thread.join(timeout=2)


# Cria o rastreador de um aluno (None se a pose estiver desligada ou o MediaPipe indisponível).
def criar_rastreador():
    if not (POSE_ATIVA and POSE_DISPONIVEL):
        return None
    try:
        return RastreadorPose()
    except Exception as e:
        print(f"[{agora()}] Pose estimation desligada: {e}")
        return None


# Texto extra enviado à IA junto com o prompt, com os ângulos medidos no clipe.
def _dica_pose(linhas):
    if not linhas or not POSE_ENVIAR_ANGULOS:
        return ""
    return (
        "\n\nMedições automáticas de pose (MediaPipe) feitas durante este clipe, em graus. "
        "Use como apoio para avaliar amplitude e postura, mas confirme sempre no vídeo:\n- "
        + "\n- ".join(linhas)
    )


# ────────────────────────────────────────────────────────────────────
# PARTE 13 — CAPTURA DE VÍDEO
# - medir_fps: descobre a velocidade real da câmera (quadros por segundo).
# - gravar_clipe: grava o vídeo por alguns segundos e, ao mesmo tempo, atualiza a prévia ao vivo do app.
# - ciclo_captura: repete tudo: grava um clipe, coloca na fila de análise e grava o próximo.
#   O primeiro clipe é mais curto (15 s) para o aluno ver resultado logo.
# ────────────────────────────────────────────────────────────────────
def medir_fps(cap, segundos=2):
    frames = 0
    ultimo = None
    inicio = time.time()
    while time.time() - inicio < segundos:
        ok, frame = cap.read()
        if ok:
            frames += 1
            ultimo = frame
    decorrido = time.time() - inicio
    if frames == 0 or ultimo is None:
        return None, None
    fps = max(5.0, min(60.0, frames / decorrido))
    altura, largura = ultimo.shape[:2]
    return fps, (largura, altura)


# Grava um clipe de vídeo com a duração pedida e envia quadros para a prévia ao vivo.
def gravar_clipe(s, cap, fps, tamanho, caminho, duracao=DURACAO_CLIPE, pose=None):
    """Grava `duracao` segundos. Devolve False se foi interrompido ou a câmera falhou."""
    writer = cv2.VideoWriter(caminho, cv2.VideoWriter_fourcc(*"mp4v"), fps, tamanho)
    inicio = time.time()
    n = 0
    s.estado["gravando"] = True
    if pose is not None:
        pose.iniciar_clipe()
    passo_previa = 2 if pose is not None else 3  # com pose a prévia é mais fluida (a cada 2 quadros)
    while time.time() - inicio < duracao:
        if s.parar.is_set():
            writer.release()
            return False
        ok, frame = cap.read()
        if not ok:
            writer.release()
            return False
        if pose is not None:
            pose.submeter(frame)
            if POSE_GRAVAR_NO_CLIPE:
                pose.desenhar(frame)  # o esqueleto também fica no vídeo gravado
        writer.write(frame)
        n += 1
        if n % passo_previa == 0:  # pré-visualização para o app
            quadro = frame
            if pose is not None and not POSE_GRAVAR_NO_CLIPE:
                quadro = frame.copy()
                pose.desenhar(quadro)  # esqueleto só na prévia, o clipe fica sem desenho
            ok2, buf = cv2.imencode(".jpg", quadro, [cv2.IMWRITE_JPEG_QUALITY, 65])
            if ok2:
                s.ultimo_jpeg = buf.tobytes()
        if pose is not None and n % 6 == 0:  # ângulos ao vivo para o app (status)
            with s.lock:
                s.estado["pose"] = pose.estado_atual()
        s.estado["segundos_restantes"] = int(duracao - (time.time() - inicio)) + 1
    writer.release()
    return True


# Loop principal de cada aluno: grava, coloca na fila e repete até o monitoramento ser desligado. Se a fila estiver cheia, descarta o clipe mais novo.
def ciclo_captura(s, cap, fps, tamanho, sid):
    fila = queue.Queue(maxsize=MAX_FILA)
    threading.Thread(target=trabalhador, args=(s, fila, sid), daemon=True).start()
    pose = criar_rastreador()  # esqueleto e ângulos deste aluno (None se a pose estiver desligada)
    try:
        primeiro = True
        while not s.parar.is_set():
            duracao = DURACAO_PRIMEIRO_CLIPE if primeiro else DURACAO_CLIPE
            carimbo = datetime.now().strftime("%Y%m%d_%H%M%S")
            caminho = os.path.join(PASTA_CLIPES, f"aluno{s.numero}_{carimbo}.mp4")
            completo = gravar_clipe(s, cap, fps, tamanho, caminho, duracao, pose)
            primeiro = False
            if not completo:
                try:
                    os.remove(caminho)
                except OSError:
                    pass
                if not s.parar.is_set():
                    with s.lock:
                        s.estado["erro"] = "A câmera parou de enviar imagem."
                break
            pose_linhas = pose.resumo_clipe() if pose is not None else []
            try:
                fila.put_nowait((caminho, pose_linhas))
            except queue.Full:
                try:
                    os.remove(caminho)
                except OSError:
                    pass
    finally:
        cap.release()
        if pose is not None:
            pose.fechar()
        with s.lock:
            if sid == s.sid:
                s.estado["ligado"] = False
                s.estado["gravando"] = False
                s.estado["segundos_restantes"] = 0
                s.estado["pose"] = {"ativa": False, "detectada": False, "angulos": {}}
        try:
            fila.put_nowait(None)
        except queue.Full:
            pass


# ────────────────────────────────────────────────────────────────────
# PARTE 14 — MAIN (PONTO DE PARTIDA)
# É a primeira função executada. Ela conecta a chave do Gemini, monta a fila de versões,
# mostra no terminal quais câmeras serão usadas e sobe o servidor.
# Depois disso o programa fica esperando os comandos do aplicativo (Ctrl+C para sair).
# ────────────────────────────────────────────────────────────────────
def main():
    global client
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        client = genai.Client(api_key=api_key)
    else:
        print("[AVISO] GEMINI_API_KEY não definida. Preencha camera/.env — o app mostrará o erro ao ligar.")

    if client is not None:
        descobrir_modelos()
        print(f"{len(MODELOS_GEMINI)} versões do Gemini (ordem de tentativa): " + " > ".join(MODELOS_GEMINI))
    print(f"Servidor da câmera em http://localhost:{PORTA}  (status: /status)")
    print(f"Análises salvas em TXT na pasta: {PASTA_ANALISES}")
    if not POSE_ATIVA:
        print("Pose estimation: desligada (POSE_ATIVA = False).")
    elif POSE_DISPONIVEL:
        print(f"Pose estimation: ligada (MediaPipe/{POSE_MODO}, complexidade {POSE_COMPLEXIDADE}).")
    else:
        print(f"[AVISO] Pose estimation indisponível ({_POSE_ERRO or 'mediapipe não instalado'}). "
              "Instale com: python -m pip install mediapipe  (precisa de internet na 1ª vez para baixar o modelo de pose). "
              "O resto funciona normalmente, só sem o esqueleto.")
    for n, s in SESSOES.items():
        print(f"  Aluno {n}: câmera de índice {s.indice_camera}")
    print("Ligue e desligue cada aluno pelo aplicativo (aba Monitorar). Ctrl+C para sair.")

    try:
        iniciar_servidor_api()
    except KeyboardInterrupt:
        pass
    finally:
        for s in SESSOES.values():
            s.parar.set()


if __name__ == "__main__":
    main()
