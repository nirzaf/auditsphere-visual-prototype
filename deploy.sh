#!/usr/bin/env bash
set -euo pipefail


echo "Building the React + TypeScript + Vite app..."
npm run build

echo "Preparing Cloudflare Pages assets in dist/..."
cp synthetic_trial_balance.csv dist/
mkdir -p dist/templates
cp -r templates/* dist/templates/

echo "Deploying to Cloudflare Pages (steaudit-prototype)..."
wrangler pages deploy dist --project-name steaudit-prototype --branch production

echo "Done! Live at:"
echo "- https://prototype.steaudit.com"
echo "- https://steaudit-prototype.pages.dev"
