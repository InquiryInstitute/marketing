# Setup Guide

## Initial Configuration

Before deploying the CDK stacks, you need to configure your AWS account settings.

### 1. Update AWS Account ID

Edit `cdk.json` and replace `123456789012` with your actual AWS account ID in all three environments (dev, staging, prod):

```json
"environments": {
  "dev": {
    "account": "YOUR-AWS-ACCOUNT-ID",
    "region": "us-east-1",
    ...
  },
  "staging": {
    "account": "YOUR-AWS-ACCOUNT-ID",
    "region": "us-east-1",
    ...
  },
  "prod": {
    "account": "YOUR-AWS-ACCOUNT-ID",
    "region": "us-east-1",
    ...
  }
}
```

To find your AWS account ID:
```bash
aws sts get-caller-identity --query Account --output text
```

### 2. Configure AWS Region (Optional)

The default region is `us-east-1`. If you want to use a different region, update the `region` field in `cdk.json` for each environment.

### 3. Bootstrap CDK

Before deploying for the first time, bootstrap your AWS environment:

```bash
cdk bootstrap aws://YOUR-ACCOUNT-ID/YOUR-REGION
```

This creates the necessary S3 buckets and IAM roles for CDK deployments.

### 4. Verify Configuration

Test your configuration by synthesizing the CloudFormation templates:

```bash
npm run cdk:synth:dev
```

If successful, you should see CloudFormation templates generated in the `cdk.out` directory.

## Environment-Specific Configuration

### Development Environment

- **Purpose**: Local development and testing
- **Cost**: ~$500/month (minimal resources)
- **Features**:
  - No NAT Gateway (cost savings)
  - Single availability zone
  - Minimal capacity settings
  - No point-in-time recovery for DynamoDB

### Staging Environment

- **Purpose**: Pre-production testing
- **Cost**: ~$1,500/month
- **Features**:
  - NAT Gateway enabled
  - Multi-AZ deployment
  - Production-like configuration
  - Point-in-time recovery enabled

### Production Environment

- **Purpose**: Live production workload
- **Cost**: ~$4,055/month (Phase 1, 10K users)
- **Features**:
  - NAT Gateway enabled
  - Multi-AZ deployment
  - Higher capacity limits
  - Point-in-time recovery enabled
  - Deletion protection enabled
  - Requires manual approval for deployments

## Deployment Order

The stacks are deployed in the following order (automatically handled by CDK):

1. **NetworkStack** - VPC and networking infrastructure
2. **DataStack** - DynamoDB tables, S3 buckets, Kinesis, Redis
3. **ComputeStack** - Lambda functions
4. **ApiStack** - API Gateway and Cognito
5. **MonitoringStack** - CloudWatch dashboards and alarms

## First Deployment

Deploy all stacks to the development environment:

```bash
npm run cdk:deploy:dev
```

This will:
1. Create all infrastructure resources
2. Deploy Lambda functions with placeholder code
3. Set up API Gateway endpoints
4. Create Cognito user pool
5. Configure monitoring and alarms

## Post-Deployment

After deployment, you'll see CloudFormation outputs including:

- API Gateway URL
- Cognito User Pool ID
- Cognito User Pool Client ID
- CloudWatch Dashboard URL
- DynamoDB table names
- S3 bucket names

Save these values for application configuration.

## Troubleshooting

### Error: "Could not assume role in target account"

This means the account ID in `cdk.json` doesn't match your AWS credentials. Update the account ID and try again.

### Error: "Stack already exists"

If a previous deployment failed, you may need to delete the stack manually:

```bash
aws cloudformation delete-stack --stack-name inquiry-growth-dev-network
```

### Error: "Insufficient permissions"

Ensure your AWS credentials have the necessary permissions to create:
- VPCs and networking resources
- DynamoDB tables
- S3 buckets
- Lambda functions
- API Gateway
- Cognito user pools
- CloudWatch resources

## Next Steps

After successful deployment:

1. Implement Lambda function code (currently placeholders)
2. Configure OpenSearch Serverless (not included in initial setup)
3. Set up CI/CD pipeline
4. Configure custom domain for API Gateway
5. Set up email notifications for CloudWatch alarms
6. Implement frontend application

## Cost Monitoring

Monitor your AWS costs:

```bash
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=SERVICE
```

Set up AWS Budgets to receive alerts when costs exceed thresholds.
