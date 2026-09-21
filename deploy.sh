#!/usr/bin/env bash
set -euo pipefail


echo "Preparing dist/..."
mkdir -p dist
cp index.html synthetic_trial_balance.csv dist/

echo "Deploying to Cloudflare Pages (steaudit-prototype)..."
wrangler pages deploy dist --project-name steaudit-prototype --branch production

echo "Done! Live at:"
echo "- https://prototype.steaudit.com"
echo "- https://steaudit-prototype.pages.dev"
