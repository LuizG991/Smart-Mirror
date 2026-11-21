@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist ".env" (
  echo [ERRO] Crie o arquivo camera\.env com a linha GEMINI_API_KEY=sua_chave ^(veja .env.example^)
  pause & exit /b 1
)
for /f "usebackq tokens=1,* delims==" %%A in (".env") do set %%A=%%B
python camera_gemini.py
pause
