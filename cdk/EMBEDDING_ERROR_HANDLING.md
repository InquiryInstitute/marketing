# Embedding Pipeline Error Handling and Monitoring

## Overview

This document describes the error handling and monitoring implementation for the embedding generation and OpenSearch indexing pipeline (Task 5.3).

## Architecture

The embedding pipeline consists of two Lambda functions:
1. **Embedding Lambda** (`inquiry-growth-{env}-embedding`) - Generates embeddings using Bedrock Titan V2
2. **Indexing Lambda** (`inquiry-growth-{env}-indexing`) - Indexes content with embeddings into OpenSearch

## Error Handling

### Dead Letter Queues (DLQs)

Both Lambda functions are configured with Dead Letter Queues to capture permanent failures after retries:

#### Embedding DLQ
- **Queue Name**: `inquiry-growth-{env}-embedding-dlq`
- **Retention Period**: 14 days
- **Encryption**: KMS managed
- **Purpose**: Captures failed embedding generation operations after 2 retry attempts

#### Indexing DLQ
- **Queue Name**: `inquiry-growth-{env}-indexing-dlq`
- **Retention Period**: 14 days
- **Encryption**: KMS managed
- **Purpose**: Captures failed OpenSearch indexing operations after 2 retry attempts

### Retry Logic

#### Lambda-Level Retries
- **Retry Attempts**: 2 (configured in Lambda function)
- **Behavior**: Lambda automatically retries failed invocations before sending to DLQ

#### Application-Level Retries
Both Lambda functions implement exponential backoff for API calls:

**Embedding Generation**:
- Max retries: 3
- Initial backoff: 1 second
- Backoff multiplier: 2x (1s, 2s, 4s)
- Applies to: Bedrock Titan API calls

**OpenSearch Indexing**:
- Max retries: 3
- Initial backoff: 1 second
- Backoff multiplier: 2x (1s, 2s, 4s)
- Applies to: OpenSearch indexing operations

### Error Recovery

When messages appear in DLQs, they indicate permanent failures that require investigation:

1. **Check DLQ Messages**: Use AWS Console or CLI to inspect failed messages
2. **Identify Root Cause**: Review CloudWatch Logs for error details
3. **Fix Issue**: Address the underlying problem (e.g., API limits, data issues)
4. **Reprocess**: Manually reprocess failed content using direct Lambda invocation

Example reprocessing command:
```bash
aws lambda invoke \
  --function-name inquiry-growth-dev-embedding \
  --payload '{"contentId": "failed-content-id"}' \
  response.json
```

## Monitoring and Alerting

### CloudWatch Alarms

#### Critical Alarms (PagerDuty)

1. **Embedding Failure Rate Alarm**
   - **Metric**: (Errors / Invocations) * 100
   - **Threshold**: > 5%
   - **Evaluation**: 2 periods of 5 minutes
   - **Action**: SNS → PagerDuty

2. **Indexing Failure Rate Alarm**
   - **Metric**: (Errors / Invocations) * 100
   - **Threshold**: > 5%
   - **Evaluation**: 2 periods of 5 minutes
   - **Action**: SNS → PagerDuty

3. **Embedding DLQ Messages Alarm**
   - **Metric**: ApproximateNumberOfMessagesVisible
   - **Threshold**: > 0
   - **Evaluation**: 1 period of 5 minutes
   - **Action**: SNS → PagerDuty

4. **Indexing DLQ Messages Alarm**
   - **Metric**: ApproximateNumberOfMessagesVisible
   - **Threshold**: > 0
   - **Evaluation**: 1 period of 5 minutes
   - **Action**: SNS → PagerDuty

#### Warning Alarms (Email)

1. **Embedding Latency Alarm**
   - **Metric**: Duration p95
   - **Threshold**: > 15 seconds
   - **Evaluation**: 2 periods of 5 minutes
   - **Action**: SNS → Email

2. **Indexing Latency Alarm**
   - **Metric**: Duration p95
   - **Threshold**: > 10 seconds
   - **Evaluation**: 2 periods of 5 minutes
   - **Action**: SNS → Email

### CloudWatch Dashboard

The monitoring dashboard includes dedicated widgets for the embedding pipeline:

#### Row 6: Embedding Pipeline Metrics
- **Invocations**: Tracks embedding and indexing Lambda invocations
- **Errors**: Tracks error counts for both functions
- **Duration (p95)**: Tracks latency at 95th percentile

#### Row 7: Embedding Pipeline DLQ and Custom Metrics
- **DLQ Messages**: Shows message count in both DLQs
- **Success Rate**: Custom metric tracking successful embedding generations
- **Retry Count**: Custom metric tracking retry attempts

### Custom CloudWatch Metrics

The embedding Lambda publishes custom metrics to `InquiryGrowth/{env}` namespace:

1. **EmbeddingGenerationTime**
   - Unit: Milliseconds
   - Tracks time to generate embeddings

2. **EmbeddingGenerationSuccess**
   - Unit: Count
   - Value: 1 (success) or 0 (failure)

3. **EmbeddingRetryCount**
   - Unit: Count
   - Tracks number of retries per operation

4. **OpenSearchIndexingTime**
   - Unit: Milliseconds
   - Tracks time to index in OpenSearch

5. **OpenSearchIndexingSuccess**
   - Unit: Count
   - Value: 1 (success) or 0 (failure)

6. **OpenSearchIndexingRetryCount**
   - Unit: Count
   - Tracks number of retries per indexing operation

## Detailed Error Logging

Both Lambda functions implement comprehensive error logging:

### Log Structure
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "ERROR",
  "contentId": "uuid",
  "operation": "embedding_generation",
  "error": "Error message",
  "retryCount": 2,
  "duration": 5000
}
```

### Log Groups
- Embedding: `/aws/lambda/inquiry-growth-{env}-embedding`
- Indexing: `/aws/lambda/inquiry-growth-{env}-indexing`

### X-Ray Tracing

Both Lambda functions have X-Ray tracing enabled for distributed tracing:
- View service map: [X-Ray Console](https://console.aws.amazon.com/xray/home#/service-map)
- Trace individual requests to identify bottlenecks
- Analyze error patterns across the pipeline

## Operational Procedures

### Responding to Alarms

#### High Failure Rate (> 5%)
1. Check CloudWatch Logs for error patterns
2. Verify Bedrock/OpenSearch service health
3. Check for API throttling or quota issues
4. Review recent code deployments
5. Scale Lambda concurrency if needed

#### DLQ Messages Present
1. Inspect DLQ messages in AWS Console
2. Review CloudWatch Logs for failed content IDs
3. Identify common failure patterns
4. Fix underlying issue
5. Reprocess failed messages manually
6. Purge DLQ after successful reprocessing

#### High Latency
1. Check Bedrock API response times
2. Check OpenSearch cluster performance
3. Review Lambda memory allocation
4. Check for cold starts
5. Consider increasing Lambda memory/timeout

### Manual Reprocessing

To reprocess content that failed:

```bash
# Single content item
aws lambda invoke \
  --function-name inquiry-growth-dev-embedding \
  --payload '{"contentId": "content-uuid"}' \
  response.json

# Batch reprocessing
aws lambda invoke \
  --function-name inquiry-growth-dev-embedding \
  --payload '{"contentIds": ["uuid1", "uuid2", "uuid3"]}' \
  response.json
```

### Monitoring Best Practices

1. **Daily Review**: Check dashboard for anomalies
2. **Weekly Analysis**: Review error trends and optimize
3. **Monthly Reports**: Generate cost and performance reports
4. **Quarterly Tuning**: Adjust alarm thresholds based on patterns

## Cost Monitoring

Monitor costs for the embedding pipeline:

1. **Bedrock API Costs**: Track in AWS Cost Explorer
   - Filter by service: Bedrock
   - Track token usage and costs

2. **Lambda Costs**: Track invocations and duration
   - Optimize memory allocation
   - Reduce cold starts

3. **OpenSearch Costs**: Monitor index size and query costs
   - Right-size collection capacity
   - Optimize index mappings

## Troubleshooting

### Common Issues

#### Issue: High Bedrock API Throttling
**Symptoms**: Errors with "ThrottlingException"
**Solution**: 
- Implement request batching
- Add jitter to retry logic
- Request quota increase from AWS

#### Issue: OpenSearch Indexing Timeouts
**Symptoms**: Timeouts after 60 seconds
**Solution**:
- Check OpenSearch cluster health
- Optimize index mappings
- Increase Lambda timeout if needed

#### Issue: DLQ Messages Not Processing
**Symptoms**: Messages stuck in DLQ
**Solution**:
- Check Lambda execution role permissions
- Verify DLQ configuration
- Review CloudWatch Logs for errors

## References

- [AWS Lambda Error Handling](https://docs.aws.amazon.com/lambda/latest/dg/invocation-retries.html)
- [AWS SQS Dead Letter Queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html)
- [CloudWatch Alarms](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html)
- [X-Ray Tracing](https://docs.aws.amazon.com/xray/latest/devguide/xray-concepts.html)
