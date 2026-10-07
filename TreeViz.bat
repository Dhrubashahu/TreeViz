@echo off
rem TreeViz launcher - opens TreeViz.html in its own app window (no browser tabs/bars).
setlocal
set "F=%~dp0TreeViz.html"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" goto edge
set "CHR=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHR%" set "CHR=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if exist "%CHR%" goto chrome
start "" "%F%"
goto :eof
:edge
start "" "%EDGE%" --app="file:///%F%"
goto :eof
:chrome
start "" "%CHR%" --app="file:///%F%"
