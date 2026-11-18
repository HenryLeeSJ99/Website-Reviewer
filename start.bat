@echo off
REM Usage: start.bat [path-to-site-folder]   (default: PLYTEC website folder)
set SITE=%~1
if "%SITE%"=="" set SITE=D:\Coding\PLYTEC_FormworkWebsite\dist
start "" http://localhost:8800/__review/
node "%~dp0server.js" "%SITE%" --name PLYTEC_FormworkWebsite
