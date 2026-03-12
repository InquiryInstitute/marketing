#!/bin/bash

# Configure Authentication Lambda Functions
# This script updates Lambda environment variables with Cognito User Pool information
# after CDK deployment to avoid circular dependencies.

set -e

# Configuration
ENV=${1:-dev}
REGION=${2:-us-east-1}

echo "Configuring authentication Lambda functions for environment: $ENV"
echo "Region: $REGION"
echo ""

# Get User Pool ID and Client ID from CloudFormation outputs
echo "Fetching Cognito User Pool information..."
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name inquiry-growth-${ENV}-api \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text)

USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name inquiry-growth-${ENV}-api \
  --region $REGION \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue' \
  --output text)

if [ -z "$USER_POOL_ID" ] || [ -z "$USER_POOL_CLIENT_ID" ]; then
  echo "Error: Could not retrieve User Pool information from CloudFormation"
  echo "Make sure the API stack is deployed successfully"
  exit 1
fi

echo "User Pool ID: $USER_POOL_ID"
echo "User Pool Client ID: $USER_POOL_CLIENT_ID"
echo ""

# Update Register function
echo "Updating Register function..."
aws lambda update-function-configuration \
  --function-name inquiry-growth-${ENV}-register \
  --region $REGION \
  --environment "Variables={USER_POOL_ID=$USER_POOL_ID,USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID,RATE_LIMIT_TABLE=inquiry-growth-${ENV}-rate-limits,AWS_REGION=$REGION}" \
  --output text \
  --query 'FunctionArn'

# Update Login function
echo "Updating Login function..."
aws lambda update-function-configuration \
  --function-name inquiry-growth-${ENV}-login \
  --region $REGION \
  --environment "Variables={USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID,RATE_LIMIT_TABLE=inquiry-growth-${ENV}-rate-limits,AWS_REGION=$REGION}" \
  --output text \
  --query 'FunctionArn'

# Update Refresh function
echo "Updating Refresh function..."
aws lambda update-function-configuration \
  --function-name inquiry-growth-${ENV}-refresh \
  --region $REGION \
  --environment "Variables={USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID,AWS_REGION=$REGION}" \
  --output text \
  --query 'FunctionArn'

echo ""
echo "✅ Authentication Lambda functions configured successfully!"
echo ""
echo "Next steps:"
echo "1. Deploy actual Lambda code (currently using placeholders)"
echo "2. Test authentication endpoints"
echo "3. Monitor CloudWatch logs for any issues"
