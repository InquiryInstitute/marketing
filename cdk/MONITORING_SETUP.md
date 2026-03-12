# Monitoring and Alerting Setup Guide

This guide explains the comprehensive monitoring and alerting infrastructure for the Inquiry Growth Engine.

## Overview

The monitoring stack provides:
- **CloudWatch Dashboard** - Real-time system health visualization
- **X-Ray Tracing** - Distributed tracing across all services
- **CloudWatch Alarms** - Automated alerting for critical issues
- **PagerDuty Integration** - Critical alert routing to on-call engineers

## Architecture

### Monitoring Components

1. **CloudWatch Dashboard** (`inquiry-growth-{env}-system-health`)
   - API Gateway metrics (requests, errors, latency)
   - Lambda function metrics (invocations, errors, duration, throttles)
   - DynamoDB metrics (capacity, throttles, errors)
   - Kinesis stream metrics (throughput, lag)
   - System health status indicators

2. **X-Ray Distributed Tracing**
   - Enabled on all Lambda functions
   - Enabled on API Gateway
   - Provides end-to-end request tracing
   - Service dependency visualization

3. **CloudWatch Alarms**
   - **Critical Alarms** → PagerDuty (immediate response required)
   - **Warning Alarms** → Email notifications (monitoring required)

## Alarm Configuration

### Critical Alarms (PagerDuty)

These alarms trigger immediate PagerDuty alerts:

| Alarm | Threshold | Description |
|-------|-----------|-------------|
| API Error Rate | >1% | API 5xx error rate exceeds 1% |
| Lambda Errors | >10 errors/5min | Any Lambda function error count exceeds 10 |
| Lambda Throttles | >1 throttle/5min | Lambda function is being throttled |
| DynamoDB System Errors | >5 errors/5min | DynamoDB system errors detected |
| Kinesis Write Throttle | >1 throttle/5min | Kinesis stream write throughput exceeded |

### Warning Alarms (Email)

These alarms send email notifications:

| Alarm | Threshold | Description |
|-------|-----------|-------------|
| API Latency | p95 >1s | API latency exceeds 1 second at p95 |
| Lambda Duration | p95 >5s | Lambda duration exceeds 5 seconds at p95 |
| DynamoDB Throttles | >1 throttle/5min | DynamoDB table is being throttled |
| Kinesis Iterator Age | >60s | Kinesis processing is lagging behind |
| S3 4xx Errors | >50 errors/5min | S3 content bucket has high 4xx error rate |

## PagerDuty Integration

### Setup Instructions

1. **Create PagerDuty Integration**
   - Log in to PagerDuty
   - Go to **Services** → Select your service
   - Click **Integrations** tab
   - Add integration: **Amazon CloudWatch**
   - Copy the **Integration URL** (format: `https://events.pagerduty.com/integration/{key}/enqueue`)

2. **Configure CDK Context**
   
   Add the PagerDuty integration URL to `cdk.json`:

   ```json
   {
     "context": {
       "environments": {
         "dev": {
           "account": "548217737835",
           "region": "us-east-1",
           "pagerDutyIntegrationUrl": "https://events.pagerduty.com/integration/YOUR_DEV_KEY/enqueue"
         },
         "staging": {
           "account": "548217737835",
           "region": "us-east-1",
           "pagerDutyIntegrationUrl": "https://events.pagerduty.com/integration/YOUR_STAGING_KEY/enqueue"
         },
         "prod": {
           "account": "548217737835",
           "region": "us-east-1",
           "pagerDutyIntegrationUrl": "https://events.pagerduty.com/integration/YOUR_PROD_KEY/enqueue"
         }
       }
     }
   }
   ```

3. **Deploy Monitoring Stack**
   
   ```bash
   cd cdk
   npm run build
   cdk deploy inquiry-growth-{env}-monitoring --context env={env}
   ```

4. **Test PagerDuty Integration**
   
   After deployment, test the integration:
   - Go to CloudWatch Console → Alarms
   - Select a critical alarm
   - Click **Actions** → **Set alarm state to ALARM**
   - Verify PagerDuty incident is created

### Email Notifications

To receive warning alarm emails:

1. **Subscribe to Warning Topic**
   
   ```bash
   aws sns subscribe \
     --topic-arn arn:aws:sns:us-east-1:548217737835:inquiry-growth-{env}-warning-alarms \
     --protocol email \
     --notification-endpoint your-email@example.com
   ```

2. **Confirm Subscription**
   - Check your email for confirmation message
   - Click the confirmation link

## Dashboard Access

### CloudWatch Dashboard

Access the system health dashboard:

```
https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=inquiry-growth-{env}-system-health
```

The dashboard includes:
- **Row 1**: API Gateway overview (requests, errors, latency)
- **Row 2**: Lambda functions (invocations, errors, duration)
- **Row 3**: Lambda throttles and concurrent executions
- **Row 4**: DynamoDB metrics (read/write capacity, throttles)
- **Row 5**: Kinesis stream metrics (throughput, lag)
- **Row 6**: System health status (single-value widgets)

### X-Ray Service Map

View distributed tracing:

```
https://console.aws.amazon.com/xray/home?region=us-east-1#/service-map
```

Features:
- Service dependency visualization
- Request flow analysis
- Performance bottleneck identification
- Error and fault analysis

### X-Ray Traces

View individual request traces:

```
https://console.aws.amazon.com/xray/home?region=us-east-1#/traces
```

## Monitoring Best Practices

### 1. Regular Dashboard Review

- Review dashboard daily during business hours
- Check for anomalies in traffic patterns
- Monitor error rates and latency trends
- Verify all services are healthy (green status)

### 2. Alarm Response

**Critical Alarms (PagerDuty):**
- Respond within 15 minutes
- Investigate root cause immediately
- Escalate if not resolved within 1 hour
- Document incident in runbook

**Warning Alarms (Email):**
- Review within 1 hour
- Investigate if pattern persists
- Create ticket for non-urgent issues
- Monitor for escalation to critical

### 3. X-Ray Tracing

Use X-Ray for:
- Debugging production issues
- Performance optimization
- Understanding service dependencies
- Identifying bottlenecks

### 4. Alarm Tuning

Review alarm thresholds quarterly:
- Adjust based on actual traffic patterns
- Reduce false positives
- Ensure critical issues are caught
- Update documentation

## Metrics Reference

### API Gateway Metrics

| Metric | Description | Unit |
|--------|-------------|------|
| Count | Total API requests | Count |
| 4XXError | Client errors | Count |
| 5XXError | Server errors | Count |
| Latency | Request latency | Milliseconds |

### Lambda Metrics

| Metric | Description | Unit |
|--------|-------------|------|
| Invocations | Function invocations | Count |
| Errors | Function errors | Count |
| Duration | Execution duration | Milliseconds |
| Throttles | Throttled invocations | Count |
| ConcurrentExecutions | Concurrent executions | Count |

### DynamoDB Metrics

| Metric | Description | Unit |
|--------|-------------|------|
| ConsumedReadCapacityUnits | Read capacity consumed | Count |
| ConsumedWriteCapacityUnits | Write capacity consumed | Count |
| UserErrors | Throttled requests | Count |
| SystemErrors | DynamoDB system errors | Count |

### Kinesis Metrics

| Metric | Description | Unit |
|--------|-------------|------|
| IncomingRecords | Records written to stream | Count |
| GetRecords.IteratorAgeMilliseconds | Processing lag | Milliseconds |
| WriteProvisionedThroughputExceeded | Write throttles | Count |

## Troubleshooting

### High API Error Rate

1. Check X-Ray traces for failing requests
2. Review Lambda function logs in CloudWatch Logs
3. Check DynamoDB for throttling
4. Verify external service availability (Bedrock, OpenSearch)

### High API Latency

1. Check Lambda duration metrics
2. Review DynamoDB query performance
3. Check cache hit rates (Redis)
4. Analyze X-Ray service map for bottlenecks

### Lambda Throttles

1. Check concurrent execution limits
2. Review Lambda reserved concurrency settings
3. Analyze traffic patterns for spikes
4. Consider increasing concurrency limits

### DynamoDB Throttles

1. Check consumed capacity vs. provisioned capacity
2. Review query patterns for hot partitions
3. Consider enabling auto-scaling
4. Optimize queries to reduce RCU/WCU consumption

### Kinesis Processing Lag

1. Check Lambda consumer function errors
2. Review Lambda concurrency for consumer
3. Verify Kinesis shard count is sufficient
4. Check for downstream bottlenecks (DynamoDB, OpenSearch)

## Cost Optimization

### CloudWatch Costs

- **Metrics**: ~$0.30 per metric per month
- **Alarms**: ~$0.10 per alarm per month
- **Dashboard**: Free (up to 3 dashboards)
- **Logs**: ~$0.50 per GB ingested

**Estimated Monthly Cost**: ~$300-400 for Phase 1

### X-Ray Costs

- **Traces**: $5 per 1 million traces recorded
- **Traces Retrieved**: $0.50 per 1 million traces retrieved
- **First 100,000 traces per month**: Free

**Estimated Monthly Cost**: ~$100 for Phase 1

### Total Monitoring Cost

**Phase 1**: ~$400-500/month (within budget)

## Support

For monitoring issues or questions:
- **Critical Issues**: Page on-call engineer via PagerDuty
- **Non-Critical**: Create ticket in issue tracker
- **Documentation**: See [Design Document](../.kiro/specs/inquiry-growth-engine/design.md)

## References

- [AWS CloudWatch Documentation](https://docs.aws.amazon.com/cloudwatch/)
- [AWS X-Ray Documentation](https://docs.aws.amazon.com/xray/)
- [PagerDuty CloudWatch Integration](https://support.pagerduty.com/docs/aws-cloudwatch-integration-guide)
- [Requirement 14: Monitoring and Alerting](../.kiro/specs/inquiry-growth-engine/requirements.md#requirement-14-monitoring-and-alerting-p0---phase-1)
