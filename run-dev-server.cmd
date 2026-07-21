@echo off
cd /d "%~dp0moj-agent"
"C:\Program Files\nodejs\node.exe" "%~dp0node_modules\next\dist\bin\next" dev --hostname 127.0.0.1
