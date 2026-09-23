#!/usr/bin/env bash
set -euo pipefail


echo "Building bundle and legacy files..."
python3 build.py

echo "Building the React + TypeScript + Vite app..."
npm run build

echo "Preparing dist-vite/..."
mkdir -p dist-vite
cp synthetic_trial_balance.csv dist-vite/
mkdir -p dist-vite/templates
cp -r templates/* dist-vite/templates/
if [ -f dist/_headers ]; then
  cp dist/_headers dist-vite/
fi

echo "Deploying to Cloudflare Pages (steaudit-prototype)..."
wrangler pages deploy dist-vite --project-name steaudit-prototype --branch production

echo "Done! Live at:"
echo "- https://prototype.steaudit.com"
echo "- https://steaudit-prototype.pages.dev"
