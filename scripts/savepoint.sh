#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/srv/nordexo-hub"

cd "$REPO_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git repository: $REPO_DIR" >&2
  exit 1
fi

current_branch=$(git symbolic-ref --short HEAD)
if [ "$current_branch" != "main" ]; then
  echo "Refusing to run: current branch is '$current_branch' (expected 'main')." >&2
  exit 1
fi

git add -A

if git diff --cached --quiet; then
  echo "No changes to savepoint."
  exit 0
fi

echo "git status -sb:"
git status -sb

echo "diffstat (staged):"
git diff --cached --stat --compact-summary

if [ "$#" -gt 0 ]; then
  commit_msg="$*"
else
  commit_msg="savepoint: $(date '+%Y-%m-%d %H:%M') server"
fi

git commit -m "$commit_msg"
git push origin main
