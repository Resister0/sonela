#!/bin/bash
# Sonela site (Linux) - get the newest version from GitHub and save your changes there (like Echo's / Aimdot's sync.sh).
# THIS REPO IS PUBLIC (github.com/Resister0/sonela). `git add -A` is OK here only because nothing private lives in this
# folder: no notes, no keys, no CLAUDE.md (private notes about the site are kept outside this repo).
# Never put private files here. As a safety net the script stops if a change contains a word from ../private-words.txt
# (private master repo) or a home path.
# Not while Claude sessions are working in this folder: it saves EVERYTHING, also their half-done edits.
set -e
cd "$(dirname "$0")"
# Sonela master (../CLAUDE.md, its own private repo Resister0/sonela-dev): save + get it first, whichever repo is synced
if [ -d ../.git ]; then
  { git -C .. add -A && { git -C .. diff --cached --quiet || git -C .. commit -q -m "Sync (Linux)"; } &&
    git -C .. pull -q --rebase --autostash && git -C .. push -q && echo "Sonela master: synced"; } ||
    echo "(Sonela master: sync failed - the site sync goes on)"
fi
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "No GitHub repo set up yet (no 'origin') - nothing to sync."
  exit 1
fi
git switch -q main 2>/dev/null || true
git pull -q --rebase --autostash origin main
git add -A
# safety net: home paths, plus the private word list (../private-words.txt, in the private master repo - never here)
hits=$(git diff --cached -U0 -- . ':!sync.sh' ':!sync.cmd' | grep -E '^\+' | grep -i -E '/home/|C:\\Users\\' || true)
if [ -f ../private-words.txt ]; then
  hits+=$(git diff --cached -U0 -- . ':!sync.sh' ':!sync.cmd' | grep -E '^\+' | grep -i -F -f <(grep -v '^#' ../private-words.txt) || true)
fi
if [ -n "$hits" ]; then
  echo "STOP: a change contains a private word or a home path - this repo is public. Nothing was saved:"
  echo "$hits" | head
  git restore --staged .
  exit 1
fi
git commit -q -m "Sync (Linux)" || echo "(nothing new to save)"
git push -q origin HEAD:main
echo "Saved to GitHub. On Windows: sync.cmd. Website: npx wrangler deploy"
