@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==============================================
echo   Smart Mirror - MODO DEMO (sem banco, sem API)
echo ==============================================
echo.
where node >nul 2>nul || (echo [ERRO] Node.js nao encontrado. Instale em https://nodejs.org ^(versao LTS^). & pause & exit /b 1)

if not exist "app\node_modules" (
  echo Primeira vez: instalando o aplicativo, aguarde...
  pushd app & call npm install & popd
)

> app\.env echo EXPO_PUBLIC_MODO_DEMO=true

echo.
echo Entre com QUALQUER e-mail e senha ^(ex.: teste@teste.com / 123456^).
echo O app abre no navegador: aperte "w" na janela do Expo.
echo Para o celular: Expo Go + QR code ^(mesmo Wi-Fi do PC^).
echo.
cd app
call npx expo start --clear
