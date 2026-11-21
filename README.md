# Smart-Mirror
Assistente para personal trainers: a câmera analisa a execução dos exercícios em tempo real com IA (Gemini) e pose estimation (MediaPipe), gera alertas de postura e acompanha os alunos pelo app.

Smart Mirror é um protótipo de sistema para monitorar a execução de exercícios físicos. Uma câmera filma o aluno, o MediaPipe identifica 33 pontos do corpo e calcula os ângulos das articulações. Em seguida, a IA do Gemini analisa clipes de vídeo e diz qual exercício está sendo feito, quantas repetições foram feitas e se a técnica está correta, com atenção ou com erro. Quando há erro de postura, o sistema gera um alerta com a correção e o risco de lesão.

Como funciona

O projeto tem três partes:

Parte	Função	Tecnologias
app/	Aplicativo para celular e web	Expo, React Native
api/	Login, alunos, sessões e alertas	Node.js, Express, PostgreSQL
camera/	Análise por câmera e por vídeo	Python, OpenCV, FastAPI, MediaPipe, Gemini

Há também uma versão web do visual, feita só com HTML, CSS e JavaScript.

Principais recursos
Pose estimation em tempo real, com esqueleto desenhado no vídeo e ângulos ao vivo (joelhos, cotovelos, quadris, ombros e inclinação do tronco).
Análise por IA de clipes gravados, com troca automática de versão do Gemini quando uma delas demora ou falha.
Até 3 alunos monitorados ao mesmo tempo, cada um com sessão, alertas e vídeo próprios.
Alertas de postura, que o personal marca como resolvidos.
Três perfis de acesso: Personal (gerencia alunos e alertas), Aluno (auto-monitoramento) e Visitante (sem conta).
Versão de demonstração, com dados de exemplo e envio de vídeos de exercícios para análise.
Relatórios em TXT, com um arquivo por análise (exercício, repetições, status, correção e risco de lesão).
Como rodar (Windows)
Instale Node.js e Python 3.
Crie camera/.env com GEMINI_API_KEY=sua_chave.
Dê dois cliques em 3-ABRIR-TUDO.bat, que abre a API, a câmera e o app.

O login com banco exige PostgreSQL (use 2-CRIAR-BANCO.bat). A versão de demonstração e o modo visitante funcionam sem banco.

Aviso

Este é um protótipo educacional. As análises da IA servem de apoio e não substituem a orientação de um profissional de educação física ou de saúde.
