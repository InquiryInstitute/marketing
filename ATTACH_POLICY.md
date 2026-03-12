# Attach AdministratorAccess Policy

The bedrock-ask-faculty user needs AdministratorAccess for CDK deployments.

## Via AWS CLI (requires admin privileges)

```bash
aws iam attach-user-policy \
  --user-name bedrock-ask-faculty \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

## Via AWS Console

1. Go to: https://console.aws.amazon.com/iam/
2. Navigate to: Users → bedrock-ask-faculty
3. Click: "Add permissions" → "Attach policies directly"
4. Search for and select: "AdministratorAccess"
5. Click: "Add permissions"

## Verify Permissions

After attaching the policy, verify:

```bash
aws iam list-attached-user-policies --user-name bedrock-ask-faculty
```

You should see either `AdministratorAccess` or `InquiryGrowthCDKPolicy` in the list.

## Then Continue Deployment

```bash
# Bootstrap CDK (one-time)
cd cdk
npm run cdk bootstrap -- aws://548217737835/us-east-1

# Deploy network stack
npm run cdk deploy -- -c env=dev inquiry-growth-dev-network
```
