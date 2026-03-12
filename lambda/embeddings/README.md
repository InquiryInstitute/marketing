# Embedding Generation Service

## Overview

This Lambda function generates vector embeddings for content using AWS Bedrock Titan Embeddings V2 model. Embeddings are used for semantic similarity search and personalized recommendations.

**Requirements**: Req 5 (Content Embedding Generation)

## Features

- **Automatic Embedding Generation**: Triggered when content is published (state = 'published')
- **AWS Bedrock Titan V2**: Uses `amazon.titan-embed-text-v2:0` model for 1536-dimensional embeddings
- **Text Preprocessing**: Concatenates title + description + first 500 words of body
- **Retry Logic**: Implements exponential backoff (1s, 2s, 4s) for up to 3 retries
- **CloudWatch Metrics**: Logs generation time, success rate, and retry count
- **Error Handling**: Graceful failure with detailed error logging

## Architecture

```
Content Published → DynamoDB Stream → Embedding Lambda → Bedrock Titan V2 → Update DynamoDB
                                                                           ↓
                                                                    CloudWatch Metrics
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `CONTENT_TABLE` | DynamoDB table name for content | `inquiry-growth-dev-content` |
| `BEDROCK_REGION` | AWS region for Bedrock service | `us-east-1` |
| `ENV_NAME` | Environment name for metrics | `dev` |

## Invocation Methods

### 1. DynamoDB Stream (Automatic)

Triggered automatically when content is inserted or modified with `state = 'published'`.

```json
{
  "Records": [
    {
      "eventName": "INSERT",
      "dynamodb": {
        "NewImage": {
          "id": { "S": "content-123" },
          "state": { "S": "published" }
        }
      }
    }
  ]
}
```

### 2. Direct Invocation (Single Content)

```json
{
  "contentId": "content-123"
}
```

### 3. Batch Processing (Multiple Content)

```json
{
  "contentIds": ["content-123", "content-456", "content-789"]
}
```

## Response Format

### Success Response

```json
{
  "statusCode": 200,
  "body": {
    "success": true,
    "contentId": "content-123",
    "embedding": [0.123, -0.456, ...],
    "retryCount": 0
  }
}
```

### Error Response

```json
{
  "statusCode": 500,
  "body": {
    "success": false,
    "contentId": "content-123",
    "error": "Failed to generate embedding after 3 retries: Rate limit exceeded",
    "retryCount": 3
  }
}
```

## CloudWatch Metrics

The function logs the following custom metrics to CloudWatch:

| Metric | Description | Unit |
|--------|-------------|------|
| `EmbeddingGenerationTime` | Time taken to generate embedding | Milliseconds |
| `EmbeddingGenerationSuccess` | Success/failure indicator (1/0) | Count |
| `EmbeddingRetryCount` | Number of retries needed | Count |

**Namespace**: `InquiryGrowth/{ENV_NAME}`

**Dimensions**:
- `Environment`: dev/staging/prod
- `Service`: Embeddings

## Performance Targets

- **Generation Latency**: < 10 seconds per article (p95)
- **Success Rate**: > 99%
- **Cost**: < $0.001 per article

## Cost Calculation

**Bedrock Titan Embeddings V2 Pricing**: $0.0001 per 1K tokens

Example for 1,000-word article:
- Input tokens: ~1,500 (title + description + 500 words)
- Cost: 1.5 × $0.0001 = $0.00015 per article

For 50,000 articles: 50,000 × $0.00015 = **$7.50 one-time cost**

## Error Handling

### Retry Strategy

The function implements exponential backoff for transient errors:

1. **Attempt 1**: Immediate
2. **Attempt 2**: Wait 1 second
3. **Attempt 3**: Wait 2 seconds
4. **Attempt 4**: Wait 4 seconds

After 3 retries, the function fails and logs the error.

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `ThrottlingException` | Rate limit exceeded | Automatic retry with backoff |
| `ValidationException` | Invalid input text | Check content format |
| `ModelNotReadyException` | Model not available | Retry later |
| `Content not found` | Invalid content ID | Verify content exists |
| `Content not published` | Content state != 'published' | Only published content gets embeddings |

## Monitoring

### CloudWatch Alarms

Recommended alarms:

1. **High Failure Rate**: Alert if `EmbeddingGenerationSuccess` < 95% over 5 minutes
2. **High Latency**: Alert if `EmbeddingGenerationTime` p95 > 15 seconds
3. **High Retry Rate**: Alert if `EmbeddingRetryCount` avg > 1 over 5 minutes

### CloudWatch Logs

The function logs detailed information:

```
Processing content content-123 for embedding generation
Extracted 2500 characters for embedding
Generated embedding with 1536 dimensions
Updated content content-123 with embedding
Successfully generated embedding for content-123 in 3245ms
```

## Testing

### Manual Test (AWS CLI)

```bash
# Test single content
aws lambda invoke \
  --function-name inquiry-growth-dev-embedding \
  --payload '{"contentId":"content-123"}' \
  response.json

# Test batch processing
aws lambda invoke \
  --function-name inquiry-growth-dev-embedding \
  --payload '{"contentIds":["content-123","content-456"]}' \
  response.json
```

### Integration Test

1. Create content with state='draft'
2. Update content to state='published'
3. Verify embedding is generated within 10 seconds
4. Check CloudWatch metrics for success

## Deployment

The Lambda is deployed via AWS CDK in `cdk/lib/compute-stack.ts`:

```typescript
this.embeddingFunction = new lambda.Function(this, 'EmbeddingFunction', {
  functionName: `inquiry-growth-${envName}-embedding`,
  handler: 'index.handler',
  runtime: lambda.Runtime.NODEJS_20_X,
  timeout: cdk.Duration.seconds(60),
  memorySize: 1024,
  // ... permissions and environment variables
});
```

## IAM Permissions

Required permissions:

- `bedrock:InvokeModel` - Call Bedrock Titan Embeddings V2
- `dynamodb:GetItem` - Read content from DynamoDB
- `dynamodb:UpdateItem` - Update content with embedding
- `cloudwatch:PutMetricData` - Log custom metrics

## Future Enhancements (Phase 2+)

- **Batch Processing**: Process up to 25 embeddings per Bedrock API call
- **Fine-tuned Embeddings**: Train custom embeddings on institutional content
- **Multi-modal Embeddings**: Include image embeddings for visual content
- **Embedding Versioning**: Support multiple embedding models and migration

## Related Services

- **Content Service**: Publishes content that triggers embedding generation
- **Search Service**: Uses embeddings for semantic search
- **Recommendation Service**: Uses embeddings for vector similarity recommendations
- **OpenSearch**: Stores embeddings in k-NN index (task 5.2)
