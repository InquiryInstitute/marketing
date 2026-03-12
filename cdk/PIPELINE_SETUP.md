# CI/CD Pipeline Setup Guide

This guide explains how to set up and use the CI/CD pipeline for the Inquiry Growth Engine.

## Overview

The CI/CD pipeline automates the deployment process from GitHub to AWS environments (dev, staging, prod). It includes:

- **Source Stage**: GitHub integration via AWS CodeStar Connections
- **Build Stage**: TypeScript compilation and testing via CodeBuild
- **Synth Stage**: CDK template synthesis
- **Approval Stage**: Manual approval for staging and prod (automatic for dev)
- **Deploy Stage**: CDK deployment to target environment
- **Monitoring**: CloudWatch alarms for pipeline failures and high error rates
- **Notifications**: SNS notifications for pipeline events

## Architecture

```
GitHub → CodePipeline → CodeBuild (Build & Test) → CodeBuild (CDK Synth) → [Manual Approval] → CodeBuild (CDK Deploy)
                                                                                    ↓
                                                                            CloudWatch Alarms
                                                                                    ↓
                                                                            SNS Notifications
```

## Prerequisites

### 1. GitHub Connection

You need to create an AWS CodeStar Connection to GitHub:

1. Go to AWS Console → Developer Tools → Connections
2. Click "Create connection"
3. Select "GitHub" as the provider
4. Follow the OAuth flow to authorize AWS
5. Copy the Connection ARN (format: `arn:aws:codestar-connections:region:account:connection/xxx`)

### 2. GitHub Repository Structure

Your repository should have the following branches:
- `develop` → deploys to dev environment
- `staging` → deploys to staging environment
- `main` → deploys to prod environment

### 3. Notification Email (Optional)

Provide an email address to receive pipeline notifications (failures, approvals needed).

## Deployment

### Step 1: Set Environment Variables

```bash
export GITHUB_OWNER="your-github-org"
export GITHUB_REPO="inquiry-growth-engine"
export GITHUB_CONNECTION_ARN="arn:aws:codestar-connections:us-east-1:123456789012:connection/xxx"
export NOTIFICATION_EMAIL="devops@example.com"  # Optional
```

Or use CDK context parameters (see Step 2).

### Step 2: Deploy Pipeline Stack

The pipeline stack is deployed separately from the application stacks.

**For Dev Environment:**
```bash
cdk deploy -a "npx ts-node --prefer-ts-exts cdk/bin/pipeline-app.ts" \
  -c env=dev \
  -c githubOwner=your-org \
  -c githubRepo=inquiry-growth-engine \
  -c githubConnectionArn=arn:aws:... \
  -c notificationEmail=devops@example.com
```

**For Staging Environment:**
```bash
cdk deploy -a "npx ts-node --prefer-ts-exts cdk/bin/pipeline-app.ts" \
  -c env=staging \
  -c githubOwner=your-org \
  -c githubRepo=inquiry-growth-engine \
  -c githubConnectionArn=arn:aws:... \
  -c notificationEmail=devops@example.com
```

**For Production Environment:**
```bash
cdk deploy -a "npx ts-node --prefer-ts-exts cdk/bin/pipeline-app.ts" \
  -c env=prod \
  -c githubOwner=your-org \
  -c githubRepo=inquiry-growth-engine \
  -c githubConnectionArn=arn:aws:... \
  -c notificationEmail=devops@example.com
```

### Step 3: Add NPM Scripts (Optional)

Add these scripts to `package.json` for convenience:

```json
{
  "scripts": {
    "pipeline:deploy:dev": "cdk deploy -a 'npx ts-node --prefer-ts-exts cdk/bin/pipeline-app.ts' -c env=dev",
    "pipeline:deploy:staging": "cdk deploy -a 'npx ts-node --prefer-ts-exts cdk/bin/pipeline-app.ts' -c env=staging",
    "pipeline:deploy:prod": "cdk deploy -a 'npx ts-node --prefer-ts-exts cdk/bin/pipeline-app.ts' -c env=prod",
    "pipeline:synth:dev": "cdk synth -a 'npx ts-node --prefer-ts-exts cdk/bin/pipeline-app.ts' -c env=dev",
    "pipeline:synth:staging": "cdk synth -a 'npx ts-node --prefer-ts-exts cdk/bin/pipeline-app.ts' -c env=staging",
    "pipeline:synth:prod": "cdk synth -a 'npx ts-node --prefer-ts-exts cdk/bin/pipeline-app.ts' -c env=prod"
  }
}
```

Then deploy with:
```bash
npm run pipeline:deploy:dev
```

## Pipeline Stages

### 1. Source Stage
- Triggers on push to the configured branch
- Pulls latest code from GitHub
- Uses CodeStar Connection for authentication

### 2. Build Stage
- Installs dependencies (`npm ci`)
- Runs linting (if configured)
- Compiles TypeScript (`npm run build`)
- Runs tests (`npm test`)
- Caches dependencies for faster builds

### 3. Synth Stage
- Synthesizes CDK templates
- Validates CloudFormation templates
- Produces deployment artifacts

### 4. Approval Stage (Staging & Prod Only)
- Sends SNS notification to approval email
- Waits for manual approval in AWS Console
- Skipped for dev environment

### 5. Deploy Stage
- Deploys all CDK stacks to target environment
- Uses CloudFormation change sets
- Automatically rolls back on failure

## Monitoring and Alerts

### Pipeline Failure Alarm
- **Metric**: Pipeline execution failures
- **Threshold**: ≥ 1 failure in 5 minutes
- **Action**: SNS notification

### High Error Rate Alarm
- **Metric**: API Gateway 5XX errors
- **Threshold**: ≥ 10 errors in 10 minutes (2 evaluation periods)
- **Action**: SNS notification (triggers rollback consideration)

### Viewing Pipeline Status

**AWS Console:**
```
https://console.aws.amazon.com/codesuite/codepipeline/pipelines/inquiry-growth-{env}-pipeline/view
```

**AWS CLI:**
```bash
aws codepipeline get-pipeline-state --name inquiry-growth-dev-pipeline
```

## Automatic Rollback

The pipeline includes CloudWatch alarms for high error rates. When triggered:

1. SNS notification is sent to the operations team
2. Manual rollback can be initiated via AWS Console or CLI
3. For automatic rollback, consider integrating with AWS CodeDeploy

**Manual Rollback:**
```bash
# List recent executions
aws codepipeline list-pipeline-executions --pipeline-name inquiry-growth-dev-pipeline

# Get previous successful execution ID
PREVIOUS_EXECUTION_ID="xxx"

# Rollback by re-running previous execution
aws codepipeline start-pipeline-execution \
  --name inquiry-growth-dev-pipeline \
  --source-revisions actionName=GitHub_Source,revisionType=COMMIT_ID,revisionValue=<previous-commit-sha>
```

## Troubleshooting

### Pipeline Fails at Source Stage
- **Issue**: GitHub connection not authorized
- **Solution**: Go to AWS Console → Connections → Update pending connection

### Pipeline Fails at Build Stage
- **Issue**: Compilation or test failures
- **Solution**: Check CodeBuild logs in AWS Console, fix code, push again

### Pipeline Fails at Deploy Stage
- **Issue**: CloudFormation deployment errors
- **Solution**: Check CloudFormation stack events, verify IAM permissions

### Manual Approval Not Received
- **Issue**: Email not configured or SNS subscription not confirmed
- **Solution**: Check SNS topic subscriptions, confirm email subscription

## Cost Optimization

- **Artifact Retention**: Artifacts are automatically deleted after 30 days
- **Build Caching**: Source code is cached to speed up builds
- **Compute Size**: Uses SMALL compute type (3 GB RAM, 2 vCPUs)
- **Estimated Cost**: ~$50-100/month depending on pipeline execution frequency

## Security Best Practices

1. **Least Privilege IAM**: CodeBuild projects have minimal required permissions
2. **Encrypted Artifacts**: S3 bucket uses SSE-S3 encryption
3. **Private Artifacts**: S3 bucket blocks all public access
4. **Audit Trail**: CloudTrail logs all pipeline actions
5. **Manual Approval**: Staging and prod require manual approval

## Next Steps

1. **Add Tests**: Implement unit and integration tests in `npm test`
2. **Add Linting**: Configure ESLint and add to `npm run lint`
3. **Add CodeDeploy**: Integrate with CodeDeploy for blue/green deployments
4. **Add Canary Deployments**: Gradually roll out changes with traffic shifting
5. **Add Automated Rollback**: Integrate CloudWatch alarms with CodeDeploy rollback

## References

- [AWS CodePipeline Documentation](https://docs.aws.amazon.com/codepipeline/)
- [AWS CodeBuild Documentation](https://docs.aws.amazon.com/codebuild/)
- [AWS CDK Pipelines](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.pipelines-readme.html)
- [CodeStar Connections](https://docs.aws.amazon.com/dtconsole/latest/userguide/welcome-connections.html)
