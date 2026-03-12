# Deployment Strategy

This document outlines the deployment strategy for the Inquiry Growth Engine, including environment management, deployment workflows, and rollback procedures.

## Environment Architecture

### Three-Tier Environment Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                         PRODUCTION                          │
│  Branch: main                                               │
│  Purpose: Live system serving real users                    │
│  Deployment: Manual approval required                       │
│  Monitoring: 24/7 alerting, PagerDuty integration          │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ Promote after validation
                              │
┌─────────────────────────────────────────────────────────────┐
│                         STAGING                             │
│  Branch: staging                                            │
│  Purpose: Pre-production validation and QA                  │
│  Deployment: Manual approval required                       │
│  Monitoring: Business hours alerting                        │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ Promote after testing
                              │
┌─────────────────────────────────────────────────────────────┐
│                       DEVELOPMENT                           │
│  Branch: develop                                            │
│  Purpose: Active development and integration testing        │
│  Deployment: Automatic on push                              │
│  Monitoring: Basic alerting                                 │
└─────────────────────────────────────────────────────────────┘
```

### Environment Characteristics

| Aspect | Development | Staging | Production |
|--------|-------------|---------|------------|
| **Branch** | develop | staging | main |
| **Deployment** | Automatic | Manual approval | Manual approval |
| **Data** | Synthetic test data | Anonymized prod data | Real user data |
| **Scale** | Minimal (1-2 instances) | Medium (2-10 instances) | Full (5-50 instances) |
| **Cost** | ~$500/month | ~$2,000/month | ~$10,000/month |
| **Uptime SLA** | None | 99% | 99.9% |
| **Monitoring** | Basic | Enhanced | Full 24/7 |
| **Backups** | None | Daily | Hourly + PITR |

## Deployment Workflows

### Feature Development Workflow

```
1. Developer creates feature branch from develop
   git checkout -b feature/new-recommendation-algorithm

2. Developer makes changes and tests locally
   npm run build
   npm test
   npm run cdk:diff:dev

3. Developer pushes to feature branch
   git push origin feature/new-recommendation-algorithm

4. Create Pull Request to develop branch
   - Automated checks run (linting, tests, build)
   - Code review by team members
   - Approval required before merge

5. Merge to develop branch
   - Pipeline automatically deploys to dev environment
   - Integration tests run
   - Monitor for errors

6. After validation in dev, create PR to staging
   - Merge to staging branch
   - Pipeline requires manual approval
   - Deploy to staging environment

7. QA testing in staging
   - Functional testing
   - Performance testing
   - Security testing

8. After staging validation, create PR to main
   - Merge to main branch
   - Pipeline requires manual approval
   - Deploy to production
   - Monitor closely for 24 hours
```

### Hotfix Workflow

For critical production issues:

```
1. Create hotfix branch from main
   git checkout main
   git pull
   git checkout -b hotfix/critical-bug-fix

2. Make minimal changes to fix the issue
   - Keep changes focused and small
   - Add tests to prevent regression

3. Test locally
   npm run build
   npm test

4. Create PR to main (expedited review)
   - Fast-track code review
   - Approval from senior engineer

5. Merge to main
   - Pipeline deploys to production
   - Monitor closely

6. Backport to staging and develop
   git checkout staging
   git cherry-pick <hotfix-commit>
   git push

   git checkout develop
   git cherry-pick <hotfix-commit>
   git push
```

## Deployment Stages

### 1. Source Stage
- **Trigger**: Push to GitHub branch
- **Duration**: ~10 seconds
- **Actions**: Pull latest code from GitHub

### 2. Build Stage
- **Duration**: ~2-5 minutes
- **Actions**:
  - Install dependencies (npm ci)
  - Lint code
  - Compile TypeScript
  - Run unit tests
  - Generate build artifacts

### 3. Synth Stage
- **Duration**: ~1-2 minutes
- **Actions**:
  - Synthesize CDK templates
  - Validate CloudFormation templates
  - Generate deployment artifacts

### 4. Approval Stage (Staging/Prod Only)
- **Duration**: Variable (manual)
- **Actions**:
  - Send SNS notification
  - Wait for manual approval
  - Timeout after 7 days

### 5. Deploy Stage
- **Duration**: ~10-20 minutes
- **Actions**:
  - Deploy CDK stacks via CloudFormation
  - Update Lambda functions
  - Update API Gateway
  - Update infrastructure

**Total Pipeline Duration:**
- Dev: ~15-30 minutes (automatic)
- Staging: ~15-30 minutes + approval time
- Prod: ~15-30 minutes + approval time

## Rollback Procedures

### Automatic Rollback Triggers

CloudWatch alarms monitor for:
- API Gateway 5XX error rate > 10 errors in 10 minutes
- Lambda error rate > 5% for 5 minutes
- DynamoDB throttling > 100 requests in 5 minutes

When triggered:
1. SNS notification sent to operations team
2. Manual decision to rollback or investigate
3. Rollback initiated if necessary

### Manual Rollback Options

#### Option 1: Code Revert (Recommended)
```bash
# Revert the problematic commit
git revert <bad-commit-sha>
git push origin main

# Pipeline automatically deploys the reverted code
```

**Pros:**
- Clean git history
- Automatic deployment via pipeline
- Auditable

**Cons:**
- Takes 15-30 minutes for full deployment

#### Option 2: CloudFormation Rollback
```bash
# Rollback specific stack to previous version
aws cloudformation rollback-stack --stack-name inquiry-growth-prod-api

# Or rollback all stacks
for stack in network data compute api monitoring; do
  aws cloudformation rollback-stack --stack-name inquiry-growth-prod-$stack
done
```

**Pros:**
- Fast (5-10 minutes)
- Infrastructure-level rollback

**Cons:**
- Doesn't update git history
- May cause drift between code and deployed infrastructure

#### Option 3: Re-deploy Previous Version
```bash
# Find previous successful pipeline execution
aws codepipeline list-pipeline-executions \
  --pipeline-name inquiry-growth-prod-pipeline \
  --max-results 10

# Get commit SHA from previous execution
PREVIOUS_COMMIT="abc123"

# Reset to previous commit
git reset --hard $PREVIOUS_COMMIT
git push --force origin main

# Or trigger pipeline with specific commit
aws codepipeline start-pipeline-execution \
  --pipeline-name inquiry-growth-prod-pipeline
```

**Pros:**
- Complete rollback including code and infrastructure

**Cons:**
- Force push required (dangerous)
- May lose recent commits

### Rollback Decision Matrix

| Scenario | Recommended Action | Time to Recover |
|----------|-------------------|-----------------|
| API errors > 10% | Code revert | 15-30 min |
| Database migration failure | CloudFormation rollback | 5-10 min |
| Lambda function bug | Code revert | 15-30 min |
| Infrastructure misconfiguration | CloudFormation rollback | 5-10 min |
| Complete system failure | Re-deploy previous version | 20-40 min |

## Deployment Best Practices

### Pre-Deployment Checklist

- [ ] All tests passing locally
- [ ] Code reviewed and approved
- [ ] CDK diff reviewed for infrastructure changes
- [ ] Database migrations tested
- [ ] Rollback plan documented
- [ ] Monitoring dashboards ready
- [ ] On-call engineer notified (for prod)

### During Deployment

- [ ] Monitor pipeline progress
- [ ] Watch CloudWatch metrics
- [ ] Check application logs
- [ ] Verify health checks passing
- [ ] Test critical user flows

### Post-Deployment

- [ ] Monitor for 1 hour (dev), 4 hours (staging), 24 hours (prod)
- [ ] Check error rates and latency
- [ ] Verify new features working
- [ ] Update documentation
- [ ] Notify stakeholders

## Blue/Green Deployment (Future Enhancement)

For zero-downtime deployments:

```
┌─────────────┐
│   Route53   │
│   DNS       │
└──────┬──────┘
       │
       ├─────────────┐
       │             │
       ▼             ▼
┌─────────────┐ ┌─────────────┐
│    Blue     │ │    Green    │
│  (Current)  │ │    (New)    │
│   100%      │ │     0%      │
└─────────────┘ └─────────────┘

After validation:

┌─────────────┐
│   Route53   │
│   DNS       │
└──────┬──────┘
       │
       ├─────────────┐
       │             │
       ▼             ▼
┌─────────────┐ ┌─────────────┐
│    Blue     │ │    Green    │
│  (Old)      │ │  (Current)  │
│     0%      │ │    100%     │
└─────────────┘ └─────────────┘
```

**Implementation:**
- Use AWS CodeDeploy with Lambda
- Gradual traffic shifting (10% → 50% → 100%)
- Automatic rollback on CloudWatch alarms
- Zero downtime for users

## Canary Deployment (Future Enhancement)

For gradual rollout:

```
Phase 1: Deploy to 10% of users
  - Monitor for 1 hour
  - Check error rates and latency
  - Rollback if issues detected

Phase 2: Deploy to 50% of users
  - Monitor for 2 hours
  - Compare metrics between canary and baseline
  - Rollback if degradation detected

Phase 3: Deploy to 100% of users
  - Monitor for 24 hours
  - Full production deployment
```

## Disaster Recovery

### Backup Strategy

| Resource | Backup Frequency | Retention | Recovery Time |
|----------|-----------------|-----------|---------------|
| DynamoDB | Continuous (PITR) | 35 days | < 5 minutes |
| S3 | Versioning enabled | Indefinite | < 1 minute |
| Lambda | Code in Git | Indefinite | < 15 minutes |
| Infrastructure | CDK code in Git | Indefinite | < 30 minutes |

### Recovery Procedures

**Scenario 1: Complete Region Failure**
1. Deploy to backup region using CDK
2. Update Route53 to point to new region
3. Restore DynamoDB from backup
4. Restore S3 from cross-region replication
5. **RTO**: 2 hours, **RPO**: 5 minutes

**Scenario 2: Data Corruption**
1. Identify corruption time
2. Restore DynamoDB from PITR
3. Restore S3 from versioning
4. **RTO**: 30 minutes, **RPO**: 1 minute

**Scenario 3: Accidental Stack Deletion**
1. Re-deploy from CDK code
2. Restore data from backups
3. **RTO**: 1 hour, **RPO**: 5 minutes

## Monitoring and Alerting

### Key Metrics to Monitor

**Application Metrics:**
- API Gateway request rate and latency
- Lambda invocation count and errors
- DynamoDB read/write capacity
- Cache hit rate

**Business Metrics:**
- User registrations
- Content views
- Recommendation CTR
- Conversion rate

**Infrastructure Metrics:**
- CPU and memory utilization
- Network throughput
- Disk I/O
- Cost per user

### Alert Severity Levels

| Level | Response Time | Examples |
|-------|--------------|----------|
| **Critical** | Immediate (page on-call) | API down, data loss, security breach |
| **High** | 15 minutes | Error rate > 5%, latency > 2s |
| **Medium** | 1 hour | Error rate > 1%, cache miss rate > 50% |
| **Low** | Next business day | Cost increase, slow queries |

## Cost Management

### Cost Monitoring

- Daily cost reports via AWS Cost Explorer
- Budget alerts at 80% and 100% of monthly budget
- Cost allocation tags for all resources
- Monthly cost review meetings

### Cost Optimization

- Right-size Lambda memory allocations
- Use DynamoDB on-demand for variable workloads
- Implement S3 lifecycle policies
- Use CloudFront caching to reduce origin requests
- Monitor and optimize Bedrock API usage

## Compliance and Security

### Deployment Security

- All deployments require authentication
- Staging and prod require manual approval
- All changes logged in CloudTrail
- Secrets stored in AWS Secrets Manager
- IAM roles follow least privilege principle

### Audit Trail

Every deployment is tracked:
- Git commit SHA
- Pipeline execution ID
- Deployment timestamp
- Approver identity (for staging/prod)
- CloudFormation change sets

## References

- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
- [AWS Deployment Best Practices](https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/deployment.html)
- [CDK Best Practices](https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html)
