@echo off
rem Starts Recurance locally: Postgres (in WSL Ubuntu) and the web app.
rem Open http://localhost:3000 once the second window says "Ready". Close both windows to stop.
start "Recurance database" /min wsl -d Ubuntu-24.04 -u root -- bash -c "service postgresql start; echo Postgres running. Keep this window open.; exec sleep infinity"
timeout /t 5 /nobreak >nul
cd /d "%~dp0web"
if not exist ".next\BUILD_ID" call npm run build
start "" http://localhost:3000
npx next start -p 3000
