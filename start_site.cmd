@echo off
rem Starts the Recurrence Watch site locally. Open http://localhost:3000 once it says "Ready".
rem Close this window to stop it.
cd /d "%~dp0web"
start "" http://localhost:3000
npx next start -p 3000
