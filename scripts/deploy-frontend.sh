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

echo "==> Uploading frontend to s3://$BUCKET ..."
aws s3 sync frontend/dist/ "s3://$BUCKET/" --delete --region "$REGION"

echo "==> Invalidating CloudFront cache ($CF_ID)..."
aws cloudfront create-invalidation \
  --distribution-id "$CF_ID" \
  --paths "/*" \
  --region us-east-1 > /dev/null

echo ""
echo "Done! Frontend is live at https://ourdiary.love"
