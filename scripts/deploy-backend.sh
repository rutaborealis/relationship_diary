#!/usr/bin/env bash
set -euo pipefail

echo "==> Building Lambda functions..."
sam build

echo "==> Deploying Lambda + infrastructure..."
sam deploy

echo ""
echo "Done! Backend deployed."
