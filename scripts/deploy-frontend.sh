#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="relationship-diary"
REGION="eu-central-1"

echo "==> Building frontend..."
cd "$(dirname "$0")/.."
cd frontend && npm run build && cd ..

echo "==> Reading S3 bucket from stack outputs..."
BUCKET=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" \
  --output text)

CF_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" \
  --output text)

echo "==> Uploading hashed assets (immutable, long cache)..."
aws s3 sync frontend/dist/ "s3://$BUCKET/" --delete --region "$REGION" \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html" --exclude "sw.js" --exclude "manifest.json" --exclude "version.json"

echo "==> Uploading entrypoints (no-cache, always revalidate)..."
aws s3 sync frontend/dist/ "s3://$BUCKET/" --region "$REGION" \
  --cache-control "no-cache" \
  --exclude "*" --include "index.html" --include "sw.js" --include "manifest.json" --include "version.json"

echo "==> Invalidating CloudFront cache ($CF_ID)..."
aws cloudfront create-invalidation \
  --distribution-id "$CF_ID" \
  --paths "/*" \
  --region us-east-1 > /dev/null

echo ""
echo "Done! Frontend is live at https://ourdiary.love"
