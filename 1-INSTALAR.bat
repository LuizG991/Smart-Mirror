@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==============================================
echo   Smart Mirror - instalacao (rode so 1 vez)
echo ==============================================
echo.

where node >nul 2>nul || (echo [ERRO] Node.js nao encontrado. Instale em https://nodejs.org ^(versao LTS^) e rode de novo. & pause & exit /b 1)
where python >nul 2>nul || (echo [ERRO] Python nao encontrado. Instale em https://python.org ^(marque "Add to PATH"^) e rode de novo. & pause & exit /b 1)

echo [1/3] Instalando a API...
pushd api && call npm install && popd
echo.
echo [2/3] Instalando o aplicativo...
pushd app
call npm install
rem Seletor de videos do celular (versao de demonstracao); no navegador nao e necessario
call npx expo install expo-document-picker
popd
echo.
echo [3/3] Instalando a camera ^(Python^)...
python -m pip install -r camera\requirements.txt
echo.
echo Instalando a estimativa de pose ^(MediaPipe^) - opcional...
python -m pip install mediapipe || echo [AVISO] Nao consegui instalar o MediaPipe ^(precisa de Python 3.9 a 3.12^). O app funciona normalmente, so sem o esqueleto na camera.
echo.
echo Pronto! Agora:
echo   - Se ainda nao tem o banco, rode 2-CRIAR-BANCO.bat
echo   - Depois rode 3-ABRIR-TUDO.bat
pause
