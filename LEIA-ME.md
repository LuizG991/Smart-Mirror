# Smart Mirror — protótipo completo

Três partes, uma pasta cada:

| Pasta | O que é | Tecnologia | Porta |
|---|---|---|---|
| `app/` | Aplicativo (celular/web) | Expo + React Native | 8081 |
| `api/` | Servidor de login, alunos, sessões e alertas | Node + Express + PostgreSQL | 3000 |
| `camera/` | Câmera que analisa o exercício com o Gemini | Python + OpenCV + FastAPI | 8000 |

## Como abrir (um único .bat)

Dê dois cliques em **`3-ABRIR-TUDO.bat`**. Ele instala o que faltar na primeira vez, descobre o IP do PC, ajusta o `app/.env` e abre a API, o servidor da câmera e o app.

Na tela de login você escolhe:

- **Entrar** (e-mail e senha): usa a API e o banco PostgreSQL. Alunos, alertas e sessões vêm do banco.
- **Entrar como visitante**: não pede e-mail nem senha. O visitante vê as **mesmas abas do Aluno** (Início, Monitorar, Meus alertas e Perfil) e se auto-monitora pela câmera (vaga 0).
- **Versão de demonstração**: botão logo abaixo de *Entrar como visitante*. Entra na **visão do Personal** (mesmas abas: Início, Analisar, Alertas e Perfil) com alunos, alertas e sessões de exemplo guardados na memória (nada vai para o banco) e permite **enviar vídeos de exercícios para a IA analisar** (veja a seção abaixo).

O monitoramento por câmera funciona **nos dois modos**.

## Aba Monitorar: Aluno 1, 2 e 3 (alunos do banco)

**Com login (banco):** os três cartões são as vagas **Aluno 1, 2 e 3**, e cada vaga mostra um aluno que já existe no banco (`alunos_perfil.vaga_monitor`). Os alunos que o personal já tinha entram nas vagas automaticamente na primeira vez que a API abre. Em cada cartão:

- **Trocar aluno** (ou tocar numa vaga livre): abre a lista com **Meus alunos** (troca de lugar com quem estiver na vaga) e **Alunos registrados no app** (contas do tipo Aluno que ainda não têm personal; ao tocar em *Adicionar* o aluno é vinculado a você e já cai na vaga).
- Aluno novo adicionado em **Perfil > Meus Alunos** entra sozinho na primeira vaga livre.

**Sem login:** as vagas continuam genéricas (Aluno 1, 2 e 3), sem banco.

1. Toque numa vaga para abrir a tela do aluno.
2. Toque em um aluno para abrir a tela dele e toque em **Ativar monitoramento**. A webcam do PC liga e, no navegador, a imagem aparece no painel.
3. A IA analisa **um clipe por vez** (15 s o primeiro, 30 s os seguintes): exercício, repetições, status (correto/atenção/erro) e a correção aparecem na tela do aluno. Erros viram alertas e podem ser marcados como resolvidos ali mesmo.
4. **Desativar** desliga a câmera daquele aluno. Tocar de novo em "Monitorar" no menu de baixo volta para a lista.

Cada aluno tem sessão, alertas e vídeo próprios. Por padrão os três usam a **mesma webcam**, então só um aluno fica ligado por vez (ao tentar ligar um segundo, o app avisa qual aluno está usando a câmera). Se você tiver mais câmeras, defina em `camera/.env`:

```
CAMERA_ALUNO_1=0
CAMERA_ALUNO_2=1
CAMERA_ALUNO_3=2
```

**Versões do Gemini:** ao abrir, o servidor da câmera lista **todos** os modelos `gemini-X.Y-flash` (e `-flash-lite`, incluindo prévias) que a sua chave enxerga. Cada clipe começa sempre pelo **Gemini 3.5 flash-lite**; se ele passar de **7 s** sem responder (ou der erro, como o 503 "alta demanda"), o servidor tenta o próximo: primeiro o 3.5 flash, depois as versões mais antigas (3.1, 3, 2.5...) e, por último, as mais novas que a 3.5. Se a fila inteira falhar, ele espera 2 s e percorre tudo de novo (dando mais tempo a cada rodada, até 60 s) até alguma versão responder. **Nenhum erro de IA aparece no app**; só o terminal da câmera registra as trocas. Ajuste em `VERSAO_INICIAL`, `TEMPO_LIMITE_MODELO`, `MAX_MODELOS`, `MAX_RODADAS` etc. no topo de `camera/camera_gemini.py`.

Limites: o "tempo real" tem atraso de cerca de 25 a 50 s (gravação do clipe + envio + resposta do Gemini). A imagem da câmera (com o esqueleto) dentro do app só aparece no navegador; no celular você vê a análise e os ângulos ao vivo, não o vídeo. Cada análise da IA é gravada como um arquivo `.txt` na pasta `camera/analises/` (veja a seção "Análises em TXT"). Os alertas e o estado mostrado no app continuam só na memória do servidor da câmera (se fechar a janela, a tela perde o histórico, mas os `.txt` ficam), e no modo com banco a análise **não é gravada no PostgreSQL**.

## Pose estimation (esqueleto em tempo real)

Ao ativar o monitoramento de um aluno, a câmera usa o **MediaPipe Pose** para encontrar 33 pontos do corpo (ombros, cotovelos, quadril, joelhos, tornozelos...) em tempo real:

- **Vídeo ao vivo no app (navegador):** esqueleto desenhado sobre a imagem (linhas verdes, pontos vermelhos) com o ângulo dos joelhos e cotovelos escrito no vídeo.
- **Painel do aluno (navegador e celular):** aparece "Pose detectada" e os ângulos ao vivo (joelhos, cotovelos, quadris, ombros e inclinação do tronco).
- **Clipe gravado:** já sai com o esqueleto desenhado (`POSE_GRAVAR_NO_CLIPE`).
- **IA:** junto com o vídeo, o Gemini recebe um resumo dos ângulos do clipe (mínimo, máximo e média de cada articulação) como apoio para avaliar amplitude e postura (`POSE_ENVIAR_ANGULOS`). O mesmo resumo é salvo no `.txt` da análise.

A pose roda em uma thread própria: se o PC ficar lento, o esqueleto atualiza menos vezes por segundo, mas a gravação continua fluida.

**Instalação:** `1-INSTALAR.bat` e `3-ABRIR-TUDO.bat` instalam o `mediapipe` à parte (é opcional e precisa de Python 3.9 a 3.12). Sem ele o terminal da câmera avisa e tudo funciona normalmente, só sem o esqueleto. Se aparecer erro de `mp.solutions`, rode `python -m pip install mediapipe==0.10.14`.

**Ajustes** (no topo de `camera/camera_gemini.py`): `POSE_ATIVA`, `POSE_COMPLEXIDADE` (0 = leve e rápido, 1 = padrão, 2 = mais preciso), `POSE_CONFIANCA`, `POSE_GRAVAR_NO_CLIPE`, `POSE_ENVIAR_ANGULOS`.

**Limites:** a pose acompanha **uma pessoa por câmera**; funciona melhor com o corpo inteiro no enquadramento e boa iluminação; usa CPU (com 3 alunos ligados ao mesmo tempo, use `POSE_COMPLEXIDADE = 0` se o PC pesar). Os vídeos enviados na versão de demonstração **não** passam pela pose (só a câmera ao vivo).

## Análises em TXT

Toda análise da IA (câmera ao vivo **ou** vídeo enviado na demonstração) vira um arquivo de texto na pasta **`camera/analises/`**, com o nome no formato `AAAA-MM-DD_HH-MM-SS_aluno_exercicio.txt` (ex.: `2026-11-12_14-03-22_ana-souza_agachamento.txt`). Dentro vão data/hora, origem, aluno, vídeo (quando enviado), modelo de IA usado, exercício, status (Correto/Atenção/Erro), repetições, série, correção, problema e risco de lesão. Para guardar em outra pasta, defina `ANALISES_DIR` em `camera/.env`. Na câmera ao vivo o aluno aparece como "Aluno 1/2/3" (o servidor só conhece o número da vaga).

## Versão de demonstração (enviar vídeos para análise)

1. Abra tudo com `3-ABRIR-TUDO.bat` (precisa do servidor da câmera e da `GEMINI_API_KEY` em `camera/.env`; **não precisa de banco**).
2. Na tela de login toque em **Versão de demonstração**.
3. Vá na aba **Analisar**, escolha o **aluno**, toque em **Escolher vídeo** (formatos mp4, mov, m4v, webm, avi, mkv e 3gp, até 300 MB) e depois em **Analisar vídeo**.
4. O servidor envia o vídeo ao Gemini (com a mesma troca automática de versões: começa no 3.5 lite e troca após 7 s) e o app mostra o resultado em cerca de 20 s a alguns minutos: exercício, repetições, status, correção, problema e risco de lesão.
5. O resultado **atualiza o aluno** escolhido (exercício e status), a sessão de hoje e, se houve erro de execução (Atenção/Erro), **cria um alerta** na aba Alertas. A análise também é salva em `.txt` (veja acima).

Observações: no **navegador** (tecla `w` no Expo) o seletor de arquivos funciona direto. No **celular** é preciso o pacote `expo-document-picker`, que o `1-INSTALAR.bat` e o `3-ABRIR-TUDO.bat` já instalam (ou rode `npx expo install expo-document-picker` na pasta `app`). Os dados de exemplo (alunos, alertas, sessões) e o histórico de análises da tela voltam ao padrão ao recarregar o app; só os `.txt` permanecem. Se um erro de IA acontecer (muita demanda), a tela mostra uma mensagem simples e você pode enviar de novo.

## Entrando como Aluno

Ao entrar (ou cadastrar-se) com o tipo **Aluno**, o app mostra as abas do aluno:

- **Início**: meus treinos de hoje, meu personal, meus alertas e atalho para o auto-monitoramento.
- **Monitorar**: o aluno liga/desliga o **próprio monitoramento** pela câmera. Se o personal já colocou o aluno numa vaga (Aluno 1, 2 ou 3), é essa vaga que liga, e o personal vê a análise ao vivo na aba dele. Sem vaga (ou sem personal), usa a vaga 0 de auto-monitoramento do servidor da câmera.
- **Meus alertas**: só consulta (quem marca como resolvido no banco é o personal).
- **Perfil**: dados da conta, personal responsável, suporte e sair.

## Primeira vez (Windows)

**Programas necessários (instale uma vez):** Node.js LTS e Python 3 (marque "Add to PATH"). O PostgreSQL só é necessário para o login com banco.

1. `1-INSTALAR.bat` (opcional: o `3-ABRIR-TUDO.bat` também instala o que faltar).
2. Para o login com banco: se ainda não tem o banco, dê dois cliques em `2-CRIAR-BANCO.bat`. O `banco/schema.sql` foi reconstruído a partir das consultas da API. Se você já tem o banco `smartmirrordb`, pule este passo.
3. Crie `camera/.env` com `GEMINI_API_KEY=sua_chave` (veja `camera/.env.example`).
4. `3-ABRIR-TUDO.bat`. No celular, use o **Expo Go** e leia o QR code (mesmo Wi-Fi do PC). No navegador, aperte `w` na janela do Expo.

## Só quero ver o app com dados de exemplo (sem banco, sem API, sem câmera)

Dê dois cliques em `ABRIR-SEM-BANCO.bat`. Precisa apenas do Node.js. É o **modo demonstração**: 4 alunos de exemplo, alertas e sessões do dia guardados na memória; entre com qualquer e-mail e senha. Nada é salvo. Para voltar ao normal, use o `3-ABRIR-TUDO.bat` (ele reescreve o `app/.env` sem o modo demo).

## Configurações

- `api/.env`: dados do banco e `JWT_SECRET`.
- `camera/.env`: `GEMINI_API_KEY` e, opcionalmente, `CAMERA_ALUNO_1/2/3` e `ANALISES_DIR` (pasta dos `.txt`).
- `app/.env`: gerado automaticamente pelo `3-ABRIR-TUDO.bat`.

## Problemas comuns

- **"Não foi possível conectar à API"** ao entrar com e-mail e senha: o PostgreSQL/a API não está de pé, ou PC e celular estão em redes diferentes, ou o Firewall do Windows bloqueia as portas 3000/8000 (permita o Node e o Python). Enquanto isso, "Entrar sem login" continua funcionando.
- **"Servidor da câmera desligado ou inacessível"**: a janela da câmera fechou ou o Firewall bloqueia a porta 8000.
- **"Não consegui abrir a webcam"**: feche Teams/Zoom/OBS que usem a câmera.
- **"A câmera já está sendo usada pelo Aluno N"**: desative o outro aluno antes, ou configure câmeras diferentes em `camera/.env`.
- **Câmera errada**: troque `CAMERA_INDEX` no topo de `camera/camera_gemini.py` (0, 1, 2) ou use `CAMERA_ALUNO_N`.
- **Emulador Android no mesmo PC**: no `app/.env` use `10.0.2.2` no lugar do IP.

## O que mudou nesta versão

- **Pose estimation**: `camera/camera_gemini.py` ganhou o `RastreadorPose` (MediaPipe). Esqueleto e ângulos ao vivo no vídeo e no painel do aluno (`components/PainelAoVivo.tsx`, `services/aovivo.ts`), esqueleto no clipe gravado, ângulos enviados à IA e salvos no `.txt`. O `/status` de cada aluno agora traz `pose` (`ativa`, `detectada`, `angulos`). Os `.bat` instalam o `mediapipe` como opcional. **Reinicie a janela da câmera.**
- **Análises em TXT**: `camera/camera_gemini.py` grava cada análise (ao vivo ou de vídeo enviado) em `camera/analises/*.txt`.
- **Versão de demonstração**: novo botão no login (`LoginScreen.tsx`/`services/api.ts`: `entrarDemonstracao`). Mesmas abas do Personal com dados de exemplo; a aba **Analisar** (`screens/MonitorDemo.tsx`, `services/analiseVideo.ts`) envia vídeos para a nova rota `POST /analisar-video` da câmera (andamento em `GET /analisar-video/{id}`) e o resultado atualiza aluno, sessão e alertas (`services/demo.ts`: `registrarAnaliseDemo`). Novos arquivos: `app/metro.config.js` (aceita o seletor de vídeos como pacote opcional). **Reinicie a janela da câmera.**
- **Vagas ligadas ao banco**: nova coluna `alunos_perfil.vaga_monitor` (criada sozinha ao abrir a API; opcionalmente `banco/migracao_vagas.sql`). Novas rotas: `GET /alunos/disponiveis`, `PUT /alunos/:id/vaga`, `GET /perfil/aluno`. `GET /alunos` agora devolve `vaga`.
- **Visão do aluno**: `home.tsx` escolhe entre as abas do personal e `screens/HomeAluno.tsx`; menu de baixo extraído para `components/BottomNav.tsx`.
- `camera/camera_gemini.py`: nova vaga 0 (auto-monitoramento do aluno), além das vagas 1 a 3. **Reinicie a janela da câmera.**
- `services/api.ts`: corrigido o `apagarToken` do celular, que chamava a si mesmo (travava o "Sair" fora do navegador).

- `ABRIR-AO-VIVO.bat` foi **fundido** no `3-ABRIR-TUDO.bat` (que continua abrindo API + câmera + app) e removido.
- `LoginScreen.tsx` e `services/api.ts`: botão **Entrar sem login (sem banco de dados)**; o modo (com/sem banco) agora é escolhido no login, não mais por variável de ambiente.
- `Monitor.tsx`: lista **Aluno 1, 2, 3**; nova `MonitorAluno.tsx` com o botão de ativar/desativar; `PainelAoVivo.tsx` e `hooks/useCamera.ts` passaram a trabalhar por aluno.
- `camera/camera_gemini.py`: 3 sessões independentes (`/alunos/{n}/iniciar`, `/alunos/{n}/parar`, `/alunos/{n}/video`, `/status` com os 3 alunos). A câmera não liga mais sozinha ao abrir (`AUTO_INICIAR` foi removido).
- A aba Monitorar não mostra mais a lista de alunos do banco nem sobrescreve o status deles com o da câmera; os alunos do banco continuam em Início e Perfil. `StudentDetail.tsx` ficou no projeto, mas não é mais aberto por nenhuma tela.
