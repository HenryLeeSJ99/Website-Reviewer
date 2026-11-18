@echo off
setlocal
REM Usage: start.bat [path-to-site-folder] [port]
REM If no folder is given, tries ..\PLYTEC_FormworkWebsite\dist next to this folder,
REM then asks you to type or drag in the site folder.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)

set "SITE=%~1"
set "PORT=%~2"
if "%PORT%"=="" set "PORT=8800"

if "%SITE%"=="" if exist "%~dp0..\PLYTEC_FormworkWebsite\dist\" set "SITE=%~dp0..\PLYTEC_FormworkWebsite\dist" & set "NAME=--name PLYTEC_FormworkWebsite"
if "%SITE%"=="" set /p "SITE=Site folder to review (drag the folder here): "
set "SITE=%SITE:"=%"

if not exist "%SITE%\" (
  echo Folder not found: %SITE%
  pause
  exit /b 1
)

REM Open the browser after a short delay so the server is up first
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:%PORT%/__review/"
node "%~dp0server.js" "%SITE%" --port %PORT% %NAME%
pause
