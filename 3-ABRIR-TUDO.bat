@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==============================================
echo   Smart Mirror - ABRIR TUDO
echo   API + banco ^| camera + IA ^| aplicativo
echo ==============================================
echo.
where node >nul 2>nul || (echo [ERRO] Node.js nao encontrado. Instale em https://nodejs.org ^(versao LTS^). & pause & exit /b 1)
where python >nul 2>nul || (echo [ERRO] Python nao encontrado. Instale em https://python.org ^(marque "Add to PATH"^). & pause & exit /b 1)

if not exist "camera\.env" (
  echo [AVISO] Falta o arquivo camera\.env com a linha GEMINI_API_KEY=sua_chave ^(veja camera\.env.example^).
  echo         Sem ele o login funciona, mas o monitoramento por camera nao liga.
  echo.
)

if not exist "app\node_modules" (
  echo Primeira vez: instalando o aplicativo, aguarde...
  pushd app & call npm install & popd
)
if not exist "app\node_modules\expo-document-picker" (
  echo Instalando o seletor de videos da versao de demonstracao, aguarde...
  pushd app & call npx expo install expo-document-picker & popd
)
if not exist "api\node_modules" (
  echo Primeira vez: instalando a API, aguarde...
  pushd api & call npm install & popd
)
python -c "import cv2, fastapi, uvicorn, google.genai" >nul 2>nul || (
  echo Primeira vez: instalando a camera ^(Python^), aguarde...
  python -m pip install -r camera\requirements.txt
)

python -c "import mediapipe" >nul 2>nul || (
  echo Instalando a estimativa de pose ^(MediaPipe^), aguarde...
  python -m pip install mediapipe || echo [AVISO] Sem MediaPipe o esqueleto na camera fica desligado ^(precisa de Python 3.9 a 3.12^).
)

rem Descobre o IP do PC na rede Wi-Fi (o celular precisa dele)
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "(Get-NetIPConfiguration | Where-Object {$_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up'} | Select-Object -First 1).IPv4Address.IPAddress"`) do set MEUIP=%%I
if not defined MEUIP (
  echo [AVISO] Nao consegui descobrir o IP. Usando localhost ^(so funciona no navegador do proprio PC^).
  set MEUIP=localhost
)
echo IP deste PC: %MEUIP%

> app\.env echo EXPO_PUBLIC_API_URL=http://%MEUIP%:3000
>> app\.env echo EXPO_PUBLIC_CAMERA_URL=http://%MEUIP%:8000

start "API + banco (porta 3000)" cmd /k "cd /d %~dp0api && npm start"
rem A camera so liga quando voce ativar o monitoramento de um aluno no app
start "Servidor da camera (porta 8000)" cmd /k "cd /d %~dp0camera && rodar_camera.bat"

echo.
echo Duas janelas foram abertas ^(API e camera^). O app abre nesta janela.
echo.
echo 1. Aperte "w" aqui para abrir no navegador ^(ou leia o QR code no Expo Go; mesmo Wi-Fi do PC^).
echo 2. Na tela de login escolha:
echo      - Entrar com e-mail e senha  -^> usa o banco de dados ^(PostgreSQL precisa estar ligado^)
echo      - Entrar sem login           -^> sem banco, so a camera
echo      - Versao de demonstracao     -^> personal com dados de exemplo; a aba Analisar envia videos para a IA
echo 3. Aba Monitorar -^> escolha Aluno 1, 2 ou 3 -^> "Ativar monitoramento".
echo    As analises ficam salvas em TXT na pasta camera\analises.
echo.
cd app
call npx expo start --clear
