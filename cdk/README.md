# CDK Infrastructure

This directory contains the AWS CDK infrastructure code for the Inquiry Growth Engine.

## Stack Organization

### Network Stack (`lib/network-stack.ts`)

**Purpose**: Foundational networking infrastructure

**Resources**:
- VPC with public and private subnets across 2 availability zones
- Security groups for Lambda functions and data layer
- VPC endpoints for S3 and DynamoDB (cost optimization)
- NAT Gateway (staging/prod only)

**Outputs**:
- VPC ID
- VPC CIDR block

### Data Stack (`lib/data-stack.ts`)

**Purpose**: Data storage and streaming infrastructure

**Resources**:
- **DynamoDB Tables**:
  - `content` - Article metadata and content
  - `user-profiles` - User preferences and behavior
  - `user-events` - Behavioral event history (7-day TTL)
- **S3 Buckets**:
  - `content-assets` - Images and media files
  - `event-archive` - Long-term event storage (Glacier after 90 days)
- **Kinesis Stream**: Real-time event streaming
- **ElastiCache Redis**: Caching layer for recommendations and profiles

**Outputs**:
- Table names
- Bucket names
- Kinesis stream name
- Redis endpoint

### Compute Stack (`lib/compute-stack.ts`)

**Purpose**: Serverless compute layer

**Resources**:
- **Lambda Functions**:
  - `content` - Content publishing and retrieval
  - `search` - Full-text search
  - `recommendation` - Personalized recommendations
  - `event` - Behavioral event tracking
  - `profile` - User profile management

**Configuration**:
- Runtime: Node.js 20.x
- Memory: 512 MB
- Timeout: 30 seconds
- X-Ray tracing enabled
- Environment variables for all data layer resources

**Outputs**:
- Function ARNs

### API Stack (`lib/api-stack.ts`)

**Purpose**: API Gateway and authentication

**Resources**:
- **API Gateway REST API**:
  - `/api/content` - Content CRUD operations
  - `/api/search` - Search queries
  - `/api/recommendations` - Personalized recommendations
  - `/api/events` - Event tracking
  - `/api/users/{id}/profile` - User profile management
  - `/api/users/{id}/history` - User event history
- **Cognito User Pool**:
  - Email-based authentication
  - Password policy enforcement
  - Email verification required
  - 24-hour access tokens
  - 30-day refresh tokens

**Security**:
- Cognito authorizer for protected endpoints
- CORS enabled for web applications
- Rate limiting (1000 req/sec, 2000 burst)
- Request/response logging

**Outputs**:
- API Gateway URL
- Cognito User Pool ID
- Cognito User Pool Client ID

### Monitoring Stack (`lib/monitoring-stack.ts`)

**Purpose**: Observability and alerting

**Resources**:
- **CloudWatch Dashboard**: System health metrics
- **CloudWatch Alarms**:
  - API error rate > 1%
  - API latency p95 > 1 second
  - Lambda errors > 10/5min
  - DynamoDB throttles
  - Kinesis iterator age > 1 minute
- **SNS Topic**: Alarm notifications

**Dashboard Widgets**:
- API Gateway requests and latency
- Lambda invocations and errors
- DynamoDB read/write capacity

**Outputs**:
- Dashboard URL
- Alarm topic ARN

## Stack Dependencies

```
NetworkStack
    ↓
DataStack
    ↓
ComputeStack
    ↓
ApiStack
    ↓
MonitoringStack
```

## Environment Configuration

Environment-specific settings are defined in `cdk.json`:

```typescript
interface EnvironmentConfig {
  account: string;           // AWS account ID
  region: string;            // AWS region
  vpcCidr: string;          // VPC CIDR block
  enableNatGateway: boolean; // Enable NAT for private subnets
  minCapacity: number;       // Minimum auto-scaling capacity
  maxCapacity: number;       // Maximum auto-scaling capacity
}
```

## Adding New Stacks

To add a new stack:

1. Create a new file in `lib/` (e.g., `lib/new-stack.ts`)
2. Extend `cdk.Stack` and define resources
3. Import and instantiate in `bin/app.ts`
4. Add dependencies if needed
5. Export resources that other stacks need

Example:

```typescript
// lib/new-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface NewStackProps extends cdk.StackProps {
  envName: string;
  envConfig: any;
}

export class NewStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: NewStackProps) {
    super(scope, id, props);
    
    // Define resources here
  }
}

// bin/app.ts
import { NewStack } from '../lib/new-stack';

const newStack = new NewStack(app, `${stackPrefix}-new`, {
  env,
  stackName: `${stackPrefix}-new`,
  description: 'New stack description',
  envName,
  envConfig,
});
```

## Best Practices

1. **Resource Naming**: Use consistent naming convention: `inquiry-growth-{env}-{resource}`
2. **Tagging**: All resources are automatically tagged with Project, Environment, and ManagedBy
3. **Outputs**: Export important values for cross-stack references and application configuration
4. **Removal Policy**: Production resources use RETAIN, dev resources use DESTROY
5. **Security**: Use security groups, VPC endpoints, and encryption by default
6. **Cost Optimization**: Use on-demand pricing, lifecycle policies, and caching
7. **Monitoring**: Add CloudWatch alarms for all critical resources

## Testing

Before deploying:

1. **Synthesize**: `npm run cdk:synth:dev`
2. **Diff**: `npm run cdk:diff:dev`
3. **Deploy**: `npm run cdk:deploy:dev`

## Troubleshooting

### Stack Update Failures

If a stack update fails, check:
1. CloudFormation console for detailed error messages
2. CloudWatch Logs for Lambda errors
3. IAM permissions for CDK execution role

### Resource Limits

AWS has service limits (e.g., VPCs per region, Lambda concurrent executions). Request limit increases if needed.

### Cost Overruns

Monitor costs using:
- AWS Cost Explorer
- CloudWatch billing alarms
- AWS Budgets

## Phase 2 Additions

Future stacks to be added:

- **EditorialStack**: AI-assisted content creation (Bedrock Claude)
- **EmailStack**: Email campaigns (SES)
- **AnalyticsStack**: Business intelligence (QuickSight)

## Phase 3 Additions

- **OrchestrationStack**: Multi-agent workflows (Step Functions)
- **GraphStack**: Collaborative filtering
- **PersonalizeStack**: Learned ranking (Amazon Personalize)
