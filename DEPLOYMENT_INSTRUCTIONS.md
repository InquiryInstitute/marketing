# CDK Deployment Instructions

## AWS IAM Policy Setup

To deploy the Inquiry Growth Engine infrastructure, the IAM user needs CDK deployment permissions.

### Recommended: Use AWS Managed Policies (Simplest)

Attach the `PowerUserAccess` managed policy which provides full access to AWS services except IAM:

```bash
aws iam attach-user-policy \
  --user-name bedrock-ask-faculty \
  --policy-arn arn:aws:iam::aws:policy/PowerUserAccess
```

Then add minimal IAM permissions for CDK role creation:

```bash
aws iam put-user-policy \
  --user-name bedrock-ask-faculty \
  --policy-name CDKIAMPermissions \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:GetRole",
          "iam:PassRole",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:GetRolePolicy",
          "iam:TagRole",
          "iam:UntagRole"
        ],
        "Resource": "arn:aws:iam::548217737835:role/cdk-*"
      }
    ]
  }'
```

### Alternative: Use AdministratorAccess (Full Access)

If this is a development/test account:

```bash
aws iam attach-user-policy \
  --user-name bedrock-ask-faculty \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
```

**Note:** The current IAM user (`bedrock-ask-faculty`) doesn't have permission to modify IAM policies. You'll need to:
1. Ask an administrator to attach the `PowerUserAccess` policy, OR
2. Use the AWS Console to attach policies manually, OR  
3. Continue with limited permissions (some deployments may fail)

## Deployment Steps

Once permissions are configured (or to test with current permissions):

### 1. Bootstrap CDK (one-time setup)

```bash
AWS_PROFILE=custodian npm run cdk bootstrap -- aws://548217737835/us-east-1
```

### 2. Deploy Network Stack

```bash
AWS_PROFILE=custodian npm run cdk deploy -- -c env=dev inquiry-growth-dev-network
```

### 3. Verify Deployment

After deployment, verify the outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name inquiry-growth-dev-network \
  --query 'Stacks[0].Outputs' \
  --profile custodian
```

Expected outputs:
- VPC ID
- VPC CIDR (10.0.0.0/16)
- Lambda Security Group ID
- OpenSearch Security Group ID
- Redis Security Group ID
- Private Subnet IDs (3 subnets across 3 AZs)
- Public Subnet IDs (3 subnets across 3 AZs)
- Availability Zones (us-east-1a, us-east-1b, us-east-1c)

## Network Stack Features

The deployed network infrastructure includes:

✅ **VPC Configuration**
- CIDR: 10.0.0.0/16
- 3 Availability Zones (us-east-1a, us-east-1b, us-east-1c)
- DNS hostnames and DNS support enabled

✅ **Subnets**
- 3 Public subnets (one per AZ) - /24 CIDR
- 3 Private subnets (one per AZ) - /24 CIDR

✅ **NAT Gateways**
- 3 NAT Gateways (one per AZ) for high availability
- Enables Lambda functions in private subnets to access internet

✅ **Security Groups**
- Lambda Security Group: Allows outbound traffic for Lambda functions
- OpenSearch Security Group: Allows HTTPS (443) from Lambda
- Redis Security Group: Allows port 6379 from Lambda
- Data Security Group: General data layer access from Lambda

✅ **VPC Endpoints**
- S3 Gateway Endpoint (no additional cost)
- DynamoDB Gateway Endpoint (no additional cost)
- Reduces NAT Gateway data transfer costs for AWS service access

## Cost Estimate (Dev Environment)

- VPC: Free
- Subnets: Free
- Security Groups: Free
- VPC Endpoints (Gateway): Free
- NAT Gateways: ~$97.20/month (3 × $0.045/hour × 720 hours)
- NAT Gateway data transfer: ~$0.045/GB

**Total Network Infrastructure Cost: ~$100-150/month**

Note: For dev environment, you can disable NAT Gateways by setting `enableNatGateway: false` in `cdk.json` to save costs during development.

## Troubleshooting

### Permission Errors

If you see "not authorized to perform" errors:
1. Verify the IAM policy is attached to the admin user
2. Wait 1-2 minutes for IAM changes to propagate
3. Try the deployment command again

### CDK Bootstrap Errors

If bootstrap fails:
1. Ensure you have CloudFormation permissions
2. Check that the AWS account ID (548217737835) is correct
3. Verify the region (us-east-1) is correct

### Stack Already Exists

If the stack already exists and you want to update it:

```bash
AWS_PROFILE=custodian npm run cdk deploy -- -c env=dev inquiry-growth-dev-network
```

CDK will show you a diff of changes and ask for confirmation before updating.

## Next Steps

After network stack deployment:
1. Deploy Data Stack (Task 2.1-2.5)
2. Deploy Compute Stack (Lambda functions)
3. Deploy API Stack (API Gateway + Cognito)
4. Deploy Monitoring Stack (CloudWatch + X-Ray)
