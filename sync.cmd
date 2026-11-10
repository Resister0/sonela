@echo off
rem Sonela site (Windows) - get the newest version from GitHub and save your changes there (like Echo's / Aimdot's sync.cmd).
rem THIS REPO IS PUBLIC (github.com/Resister0/sonela). "git add -A" is OK here only because nothing private lives in this
rem folder: no notes, no keys, no CLAUDE.md. Never put private files here. As a safety net the script stops if a change
rem contains a word from ..\private-words.txt (private master repo) or a home path. Not while Claude sessions are working in this folder: it saves EVERYTHING.
cd /d "%~dp0"
rem Sonela master (..\CLAUDE.md, its own private repo Resister0/sonela-dev): save + get it first, whichever repo is synced
if exist "%~dp0..\.git" (
  git -C "%~dp0.." add -A
  git -C "%~dp0.." diff --cached --quiet || git -C "%~dp0.." commit -q -m "Sync (Windows)"
  git -C "%~dp0.." pull -q --rebase --autostash
  git -C "%~dp0.." push -q
)
git remote get-url origin >nul 2>nul || (echo No GitHub repo set up yet - nothing to sync. & exit /b 1)
git switch -q main 2>nul
git pull -q --rebase --autostash origin main || exit /b 1
git add -A
rem safety net: home paths, plus the private word list (..\private-words.txt, in the private master repo - never here)
git diff --cached -U0 -- . ":!sync.sh" ":!sync.cmd" | findstr /B "+" | findstr /I /C:"/home/" /C:"C:\\Users" >nul && goto stop
if exist "%~dp0..\private-words.txt" (
  git diff --cached -U0 -- . ":!sync.sh" ":!sync.cmd" | findstr /B "+" | findstr /I /L /G:"%~dp0..\private-words.txt" >nul && goto stop
)
git commit -q -m "Sync (Windows)" || echo (nothing new to save)
git push -q origin HEAD:main || exit /b 1
echo Saved to GitHub. On Linux: bash sync.sh. Website: npx.cmd wrangler deploy
exit /b 0
:stop
echo STOP: a change contains a private word or a home path - this repo is public. Nothing was saved.
git restore --staged .
exit /b 1
