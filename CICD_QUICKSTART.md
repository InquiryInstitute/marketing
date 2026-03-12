# CI/CD Pipeline Quick Start

This guide helps you quickly set up and use the CI/CD pipeline for the Inquiry Growth Engine.

## Prerequisites

1. **AWS Account**: Access to AWS account with appropriate permissions
2. **GitHub Repository**: Code hosted on GitHub
3. **AWS CLI**: Installed and configured
4. **Node.js**: Version 20.x or later
5. **AWS CDK**: Installed globally (`npm install -g aws-cdk`)

## Quick Setup (5 Minutes)

### Step 1: Create GitHub Connection

```bash
# Go to AWS Console
# Navigate to: Developer Tools → Settings → Connections
# Click "Create connection"
# Select "GitHub" and authorize
# Copy the Connection ARN
```

### Step 2: Set Environment Variables

```bash
export GITHUB_OWNER="your-github-username-or-org"
export GITHUB_REPO="inquiry-growth-engine"
export GITHUB_CONNECTION_ARN="arn:aws:codestar-connections:us-east-1:123456789012:connection/xxx"
export NOTIFICATION_EMAIL="your-email@example.com"  # Optional
```

### Step 3: Deploy Pipeline

**For Development Environment:**
```bash
npm run pipeline:deploy:dev -- \
  -c githubOwner=$GITHUB_OWNER \
  -c githubRepo=$GITHUB_REPO \
  -c githubConnectionArn=$GITHUB_CONNECTION_ARN \
  -c notificationEmail=$NOTIFICATION_EMAIL
```

**For Staging Environment:**
```bash
npm run pipeline:deploy:staging -- \
  -c githubOwner=$GITHUB_OWNER \
  -c githubRepo=$GITHUB_REPO \
  -c githubConnectionArn=$GITHUB_CONNECTION_ARN \
  -c notificationEmail=$NOTIFICATION_EMAIL
```

**For Production Environment:**
```bash
npm run pipeline:deploy:prod -- \
  -c githubOwner=$GITHUB_OWNER \
  -c githubRepo=$GITHUB_REPO \
  -c githubConnectionArn=$GITHUB_CONNECTION_ARN \
  -c notificationEmail=$NOTIFICATION_EMAIL
```

### Step 4: Verify Pipeline

After deployment, the pipeline will automatically trigger on the next push to the configured branch:
- `develop` branch → dev environment
- `staging` branch → staging environment
- `main` branch → prod environment

View your pipeline:
```bash
# Open in browser
echo "https://console.aws.amazon.com/codesuite/codepipeline/pipelines/inquiry-growth-dev-pipeline/view"
```

## Pipeline Workflow

```
┌─────────────┐
│   GitHub    │
│   Push      │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Source    │  ← Pull code from GitHub
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Build     │  ← Compile TypeScript, run tests
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Synth     │  ← Generate CDK templates
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Approval   │  ← Manual approval (staging/prod only)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Deploy    │  ← Deploy to AWS
└─────────────┘
```

## Daily Usage

### Deploying Changes

1. **Make code changes** in your local branch
2. **Commit and push** to GitHub:
   ```bash
   git add .
   git commit -m "Add new feature"
   git push origin develop  # or staging/main
   ```
3. **Pipeline automatically triggers** and deploys
4. **Monitor progress** in AWS Console

### Approving Deployments (Staging/Prod)

1. **Receive email notification** when approval is needed
2. **Review changes** in the pipeline console
3. **Click "Review"** and then "Approve" or "Reject"
4. **Deployment continues** after approval

### Monitoring Pipeline

**Check Pipeline Status:**
```bash
aws codepipeline get-pipeline-state --name inquiry-growth-dev-pipeline
```

**View Build Logs:**
```bash
# Go to AWS Console → CodeBuild → Build history
# Click on the build to see detailed logs
```

**Check Deployment Status:**
```bash
aws cloudformation describe-stacks --stack-name inquiry-growth-dev-network
```

## Troubleshooting

### Pipeline Fails at Build Stage

**Symptom:** Build stage shows red/failed status

**Solution:**
1. Click on "Details" in the failed stage
2. Review CodeBuild logs
3. Fix compilation or test errors locally
4. Push fix to GitHub
5. Pipeline will automatically retry

### Pipeline Fails at Deploy Stage

**Symptom:** Deploy stage shows red/failed status

**Solution:**
1. Check CloudFormation stack events in AWS Console
2. Look for resource creation failures
3. Fix infrastructure code in CDK
4. Push fix to GitHub

### Manual Approval Not Received

**Symptom:** No email received for approval

**Solution:**
1. Check SNS topic subscriptions in AWS Console
2. Confirm email subscription (check spam folder)
3. Manually approve in AWS Console if needed

### Pipeline Not Triggering

**Symptom:** Push to GitHub doesn't trigger pipeline

**Solution:**
1. Verify GitHub connection status in AWS Console
2. Check branch name matches configuration
3. Manually trigger pipeline:
   ```bash
   aws codepipeline start-pipeline-execution --name inquiry-growth-dev-pipeline
   ```

## Rollback Procedure

If a deployment causes issues:

### Option 1: Revert Code
```bash
git revert HEAD
git push origin develop
# Pipeline will automatically deploy the reverted code
```

### Option 2: Manual Rollback
```bash
# Find previous successful commit
git log --oneline

# Reset to previous commit
git reset --hard <previous-commit-sha>
git push --force origin develop

# Or create a new commit that reverts changes
git revert <bad-commit-sha>
git push origin develop
```

### Option 3: CloudFormation Rollback
```bash
# Rollback specific stack
aws cloudformation rollback-stack --stack-name inquiry-growth-dev-api
```

## Best Practices

1. **Test Locally First**: Run `npm run build` and `npm test` before pushing
2. **Small Commits**: Make small, incremental changes for easier rollback
3. **Feature Branches**: Use feature branches and merge to develop/staging/main
4. **Review Changes**: Always review CDK diff before approving production deployments
5. **Monitor Alarms**: Set up CloudWatch alarms for critical metrics

## Cost Monitoring

**Estimated Monthly Costs:**
- Dev pipeline: ~$20-30/month
- Staging pipeline: ~$30-50/month
- Prod pipeline: ~$50-100/month

**Cost Breakdown:**
- CodePipeline: $1/active pipeline/month
- CodeBuild: $0.005/build minute (SMALL instance)
- S3 artifacts: ~$1-5/month
- CloudWatch logs: ~$5-10/month

**View Costs:**
```bash
# AWS Console → Cost Explorer → Filter by service: CodePipeline, CodeBuild
```

## Advanced Configuration

### Custom Build Commands

Edit `cdk/lib/pipeline-stack.ts` and modify the `buildSpec`:

```typescript
buildSpec: codebuild.BuildSpec.fromObject({
  version: '0.2',
  phases: {
    build: {
      commands: [
        'npm run build',
        'npm run test',
        'npm run lint',  // Add custom commands
      ],
    },
  },
}),
```

### Add Integration Tests

Add a new stage after Build:

```typescript
this.pipeline.addStage({
  stageName: 'IntegrationTest',
  actions: [
    new codepipeline_actions.CodeBuildAction({
      actionName: 'Integration_Tests',
      project: integrationTestProject,
      input: buildOutput,
    }),
  ],
});
```

### Multiple Environments in One Pipeline

For more complex workflows, consider using AWS CDK Pipelines:
- [CDK Pipelines Documentation](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.pipelines-readme.html)

## Support

For issues or questions:
1. Check [PIPELINE_SETUP.md](cdk/PIPELINE_SETUP.md) for detailed documentation
2. Review AWS CodePipeline logs in AWS Console
3. Contact DevOps team

## Next Steps

- [ ] Set up branch protection rules in GitHub
- [ ] Configure automated testing
- [ ] Add code coverage reporting
- [ ] Set up deployment notifications in Slack
- [ ] Configure automated rollback on high error rates
- [ ] Add canary deployments for production
