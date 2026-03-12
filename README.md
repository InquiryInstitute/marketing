# Inquiry Growth Engine (Asterion)

AWS-native, AI-driven marketing and recommendation platform for Inquiry Institute.

## Architecture

The system is built using AWS CDK with TypeScript and follows a microservices architecture:

- **Network Layer**: VPC, subnets, security groups
- **Data Layer**: DynamoDB, S3, OpenSearch, Redis, Kinesis
- **Compute Layer**: Lambda functions for all services
- **API Layer**: API Gateway with Cognito authentication
- **Monitoring Layer**: CloudWatch, X-Ray, alarms

## Project Structure

```
.
├── cdk/
│   ├── bin/
│   │   └── app.ts              # CDK app entry point
│   └── lib/
│       ├── network-stack.ts    # VPC, subnets, security groups
│       ├── data-stack.ts       # DynamoDB, S3, OpenSearch, Redis, Kinesis
│       ├── compute-stack.ts    # Lambda functions
│       ├── api-stack.ts        # API Gateway, Cognito
│       └── monitoring-stack.ts # CloudWatch, X-Ray, alarms
├── cdk.json                    # CDK configuration
├── tsconfig.json               # TypeScript configuration
└── package.json                # Dependencies and scripts
```

## Prerequisites

- Node.js 20.x or later
- AWS CLI configured with appropriate credentials
- AWS CDK CLI: `npm install -g aws-cdk`

## Environment Configuration

The project supports three environments: `dev`, `staging`, and `prod`. Environment-specific configuration is defined in `cdk.json` under the `environments` context.

### Configuration Parameters

- `account`: AWS account ID
- `region`: AWS region
- `vpcCidr`: VPC CIDR block
- `enableNatGateway`: Enable NAT Gateway for private subnets
- `minCapacity`: Minimum capacity for auto-scaling
- `maxCapacity`: Maximum capacity for auto-scaling

**Note**: Update the `account` field in `cdk.json` with your AWS account ID before deploying.

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Build TypeScript

```bash
npm run build
```

### 3. Bootstrap CDK (First Time Only)

```bash
cdk bootstrap aws://ACCOUNT-ID/REGION
```

### 4. Synthesize CloudFormation Templates

```bash
# Development environment
npm run cdk:synth:dev

# Staging environment
npm run cdk:synth:staging

# Production environment
npm run cdk:synth:prod
```

### 5. Deploy Stacks

```bash
# Deploy to development
npm run cdk:deploy:dev

# Deploy to staging
npm run cdk:deploy:staging

# Deploy to production (requires approval)
npm run cdk:deploy:prod
```

## Available Scripts

- `npm run build` - Compile TypeScript
- `npm run watch` - Watch mode for TypeScript compilation
- `npm run cdk:synth:dev` - Synthesize dev environment
- `npm run cdk:deploy:dev` - Deploy to dev environment
- `npm run cdk:diff:dev` - Show diff for dev environment
- `npm run cdk:destroy:dev` - Destroy dev environment stacks

Replace `dev` with `staging` or `prod` for other environments.

## Stack Dependencies

The stacks have the following dependencies:

1. **NetworkStack** - No dependencies
2. **DataStack** - Depends on NetworkStack (VPC)
3. **ComputeStack** - Depends on NetworkStack and DataStack
4. **ApiStack** - Depends on ComputeStack
5. **MonitoringStack** - Depends on ApiStack, ComputeStack, and DataStack

## Services

### Phase 1 Services (Core Content & Recommendations)

- **Content Service**: Article publishing and retrieval
- **Search Service**: Full-text search using OpenSearch
- **Recommendation Service**: Two-layer personalized recommendations (rules + vector similarity)
- **Event Service**: Behavioral event tracking
- **Profile Service**: User profile management

### Phase 2 Services (AI Assistance & Multi-Domain)

- Editorial Assistant Service (AI content generation)
- Email Service (SES integration)
- Analytics Service (QuickSight dashboards)

### Phase 3 Services (Scale & Intelligence)

- Agent Orchestrator (Step Functions)
- Graph Service (collaborative filtering)
- Personalize Service (learned ranking)

## Monitoring

CloudWatch dashboards and alarms are automatically created for:

- API Gateway metrics (requests, latency, errors)
- Lambda metrics (invocations, duration, errors)
- DynamoDB metrics (read/write capacity, throttles)
- Kinesis metrics (iterator age)

Access the dashboard URL from the CloudFormation outputs after deployment.

## Cost Estimates

- **Phase 1 (Dev)**: ~$500/month (minimal resources)
- **Phase 1 (Prod)**: ~$4,055/month (10K users)
- **Phase 2 (Prod)**: ~$6,065/month (50K users)
- **Phase 3 (Prod)**: ~$11,565/month (100K users)

## Security

- All data encrypted at rest (AWS managed keys)
- All data encrypted in transit (TLS 1.3)
- VPC endpoints for AWS services (no internet traffic)
- Cognito for user authentication
- API Gateway authorizer for protected endpoints
- Security groups restrict network access

## Cleanup

To destroy all stacks in an environment:

```bash
npm run cdk:destroy:dev
```

**Warning**: This will delete all resources. Production stacks have deletion protection enabled.

## Documentation

- [Requirements Document](.kiro/specs/inquiry-growth-engine/requirements.md)
- [Design Document](.kiro/specs/inquiry-growth-engine/design.md)
- [Tasks](.kiro/specs/inquiry-growth-engine/tasks.md)

## License

ISC
