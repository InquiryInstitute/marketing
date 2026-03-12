# Event Service

Event tracking service for the Inquiry Growth Engine. Consists of two Lambda functions:

1. **Event Ingestion Lambda** (`ingest.ts`) - Receives events from clients and writes to Kinesis
2. **Event Processing Lambda** (`process.ts`) - Consumes events from Kinesis and updates user metrics

## Architecture

```
Client → API Gateway → Event Ingestion Lambda → Kinesis Data Stream → Event Processing Lambda → DynamoDB (user-profiles)
                                ↓
                         DynamoDB (user-events)
```

## Event Ingestion Lambda

Receives behavioral events from client applications, validates them, applies rate limiting, and writes them to Kinesis Data Stream for processing.

### Features

- **Event Validation**: Validates incoming events against CanonicalEvent v2.0 schema
- **Rate Limiting**: Enforces 100 events per minute per user
- **Batch Support**: Supports both single event and batch event ingestion (up to 100 events)
- **Kinesis Integration**: Writes events to Kinesis Data Stream for downstream processing
- **DynamoDB Storage**: Stores event metadata in DynamoDB for user history queries
- **CloudWatch Metrics**: Publishes metrics for monitoring (ingestion rate, validation errors, rate limit hits)

## API Endpoints

### POST /api/events

Ingest a single event or batch of events.

**Single Event Request:**
```json
{
  "eventType": "view",
  "userId": "user-123",
  "sessionId": "session-456",
  "contentId": "content-789",
  "metadata": {
    "userAgent": "Mozilla/5.0...",
    "deviceType": "desktop",
    "referrer": "https://example.com"
  }
}
```

**Batch Event Request:**
```json
[
  {
    "eventType": "view",
    "userId": "user-123",
    "sessionId": "session-456",
    "contentId": "content-789",
    "metadata": {
      "userAgent": "Mozilla/5.0...",
      "deviceType": "desktop"
    }
  },
  {
    "eventType": "click",
    "userId": "user-123",
    "sessionId": "session-456",
    "contentId": "content-790",
    "metadata": {
      "userAgent": "Mozilla/5.0...",
      "deviceType": "desktop"
    }
  }
]
```

**Response (202 Accepted):**
```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Event accepted for processing"
}
```

**Batch Response (202 Accepted):**
```json
{
  "message": "Events accepted for processing",
  "count": 2,
  "eventIds": [
    "550e8400-e29b-41d4-a716-446655440000",
    "550e8400-e29b-41d4-a716-446655440001"
  ]
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": "ValidationError",
  "message": "Invalid event request",
  "errors": [
    "eventType is required",
    "metadata.userAgent is required"
  ]
}
```

**Error Response (429 Too Many Requests):**
```json
{
  "error": "RateLimitExceeded",
  "message": "Rate limit exceeded. Maximum 100 events per minute. Try again in 45 seconds."
}
```

## Event Types

Supported event types:
- `view` - User viewed content (requires contentId)
- `click` - User clicked on content/recommendation (requires contentId)
- `search` - User performed a search
- `share` - User shared content
- `bookmark` - User bookmarked content
- `complete` - User completed content (e.g., finished course)
- `purchase` - User purchased content

## Device Types

Supported device types:
- `mobile` - Mobile phone
- `tablet` - Tablet device
- `desktop` - Desktop/laptop computer

## Rate Limiting

- **Limit**: 100 events per minute per authenticated user
- **Window**: Rolling 1-minute window
- **Anonymous Users**: Not rate limited (handled at API Gateway level)
- **Response**: HTTP 429 with retry-after information

## Validation Rules

1. **Required Fields**:
   - `eventType` - Must be one of the supported event types
   - `sessionId` - UUID v4 session identifier
   - `metadata.userAgent` - User agent string
   - `metadata.deviceType` - Must be mobile, tablet, or desktop

2. **Conditional Fields**:
   - `contentId` - Required for view and click events
   - `userId` - Optional (null for anonymous users)

3. **Batch Constraints**:
   - Maximum 100 events per batch
   - All events must pass validation

## CloudWatch Metrics

Published to namespace `InquiryGrowth/{env}`:

- `EventsIngested` - Total number of events ingested
- `EventType_{type}` - Count by event type (e.g., EventType_view)
- `ValidationErrors` - Number of validation errors
- `RateLimitHits` - Number of rate limit violations
- `IngestionErrors` - Number of ingestion failures

## DynamoDB Storage

Events are stored in the `user-events` table with:
- **Partition Key**: userId
- **Sort Key**: timestamp (Unix milliseconds)
- **TTL**: 7 days (hot storage)
- **Attributes**: eventId, eventType, sessionId, contentId, metadata

Rate limit tracking uses special entries:
- **Partition Key**: `event-rate-limit:{userId}`
- **Sort Key**: 0
- **TTL**: 2 minutes

## Kinesis Integration

Events are written to Kinesis Data Stream:
- **Stream Name**: `inquiry-growth-{env}-events`
- **Partition Key**: userId (or sessionId for anonymous)
- **Data Format**: JSON-encoded CanonicalEvent v2.0

## Error Handling

- **Validation Errors**: Return 400 with detailed error messages
- **Rate Limit Exceeded**: Return 429 with retry information
- **Kinesis Failures**: Return 500 (events are lost, client should retry)
- **DynamoDB Failures**: Best effort (logged but not blocking)
- **Metrics Failures**: Best effort (logged but not blocking)

## Environment Variables

- `KINESIS_STREAM` - Kinesis stream name for event ingestion
- `USER_EVENTS_TABLE` - DynamoDB table for event storage and rate limiting
- `ENV_NAME` - Environment name (dev, staging, prod)
- `AWS_REGION` - AWS region (default: us-east-1)

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint
```

## Deployment

The Lambda is deployed via AWS CDK in the compute stack:

```typescript
// cdk/lib/compute-stack.ts
this.eventFunction = new lambda.Function(this, 'EventFunction', {
  functionName: `inquiry-growth-${envName}-event`,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda/events'),
  // ... configuration
});
```

## Client SDK Example

```typescript
// Client-side event tracking
async function trackEvent(event: CreateEventRequest) {
  try {
    const response = await fetch('/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      // Buffer event in localStorage for retry
      bufferEvent(event);
    }
  } catch (error) {
    // Network error - buffer for retry
    bufferEvent(event);
  }
}

// Batch event tracking
async function trackBatchEvents(events: CreateEventRequest[]) {
  try {
    const response = await fetch('/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(events),
    });

    if (!response.ok) {
      // Buffer events for retry
      events.forEach(bufferEvent);
    }
  } catch (error) {
    // Network error - buffer for retry
    events.forEach(bufferEvent);
  }
}
```

## Requirements

- **Req 2**: Behavioral Event Tracking
- **Req 22**: Canonical Event Schema v2.0
- **Task 6.1**: Implement event ingestion Lambda

## Performance Targets

- **Latency**: < 500ms (p95)
- **Throughput**: 1,000 events/second (Phase 1)
- **Availability**: 99.9%
- **Event Loss Rate**: < 0.1%


---

## Event Processing Lambda

Consumes events from Kinesis Data Stream and updates user behavior metrics in the user-profiles table.

### Features

- **Kinesis Consumer**: Processes events from Kinesis Data Stream in batches
- **Metric Aggregation**: Aggregates metrics by user for efficient batch updates
- **User Profile Updates**: Updates totalViews, totalClicks, totalSearches, lastActive
- **Batch Processing**: Processes up to 100 records per batch with 5-second batching window
- **Error Handling**: Partial batch failure support with DLQ for failed records
- **CloudWatch Metrics**: Publishes processing metrics (events processed, profiles updated, errors)

### Kinesis Event Source Configuration

```typescript
// Event source mapping configuration
{
  batchSize: 100,                          // Process up to 100 records per batch
  maxBatchingWindow: Duration.seconds(5),  // Wait up to 5 seconds to fill batch
  startingPosition: LATEST,                // Start from latest records
  bisectBatchOnError: true,                // Split batch on error to isolate failures
  retryAttempts: 3,                        // Retry failed batches 3 times
  maxRecordAge: Duration.hours(24),        // Match Kinesis retention
  parallelizationFactor: 1,                // Process one batch at a time per shard
  reportBatchItemFailures: true,           // Enable partial batch failure reporting
  onFailure: SqsDlq(eventProcessingDLQ)    // Send failed records to DLQ
}
```

### User Metrics Updated

The Lambda updates the following metrics in the `user-profiles` table:

- **totalViews**: Incremented for each `view` event
- **totalClicks**: Incremented for each `click` event
- **totalSearches**: Incremented for each `search` event
- **totalShares**: Incremented for each `share` event
- **totalBookmarks**: Incremented for each `bookmark` event
- **totalCompletes**: Incremented for each `complete` event
- **lastActive**: Updated to the most recent event timestamp

### Batch Processing Logic

1. **Parse Records**: Extract CanonicalEvent from each Kinesis record
2. **Aggregate Metrics**: Group events by userId and sum metrics
3. **Update Profiles**: Execute DynamoDB UpdateItem for each user
4. **Handle Failures**: Mark failed records for retry via partial batch failure
5. **Publish Metrics**: Send CloudWatch metrics for monitoring

### Example Metric Update

For a batch containing:
- 3 view events for user-123
- 2 click events for user-123
- 1 search event for user-456

The Lambda will execute:
- 1 DynamoDB update for user-123 (totalViews +3, totalClicks +2, lastActive updated)
- 1 DynamoDB update for user-456 (totalSearches +1, lastActive updated)

### CloudWatch Metrics

Published to namespace `InquiryGrowth/{env}/EventProcessing`:

- `EventsProcessed` - Total number of events processed
- `EventsSkipped` - Number of invalid/anonymous events skipped
- `ProfilesUpdated` - Number of user profiles updated
- `ProcessingErrors` - Number of processing errors
- `ViewEventsProcessed` - Count of view events processed
- `ClickEventsProcessed` - Count of click events processed
- `SearchEventsProcessed` - Count of search events processed

### Error Handling

The Lambda implements comprehensive error handling:

1. **Invalid JSON**: Records with invalid JSON are marked as failed and sent to DLQ
2. **Missing Fields**: Events with missing required fields are skipped (not failed)
3. **DynamoDB Errors**: Failed updates mark all related records as failed for retry
4. **Partial Batch Failures**: Only failed records are retried, successful records are not reprocessed
5. **Dead Letter Queue**: After 3 retry attempts, failed records are sent to DLQ for manual investigation

### DLQ Monitoring

Failed records in the DLQ should be monitored and investigated:

```bash
# Check DLQ message count
aws sqs get-queue-attributes \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789012/inquiry-growth-dev-event-processing-dlq \
  --attribute-names ApproximateNumberOfMessages

# Receive messages from DLQ
aws sqs receive-message \
  --queue-url https://sqs.us-east-1.amazonaws.com/123456789012/inquiry-growth-dev-event-processing-dlq \
  --max-number-of-messages 10
```

### Anonymous Events

Events without a `userId` are skipped by the processing Lambda since there's no user profile to update. These events are still stored in the `user-events` table by the ingestion Lambda for analytics purposes.

### Performance Characteristics

- **Batch Size**: Up to 100 records per invocation
- **Batching Window**: 5 seconds maximum wait time
- **Concurrency**: Limited to 10 concurrent executions to control DynamoDB write throughput
- **Timeout**: 60 seconds per invocation
- **Memory**: 512 MB

### Environment Variables

- `USER_PROFILES_TABLE` - DynamoDB table for user profiles
- `ENV_NAME` - Environment name (dev, staging, prod)
- `AWS_REGION` - AWS region (default: us-east-1)

### Testing

```bash
# Run unit tests
npm test -- process.test.ts

# Run with coverage
npm test -- --coverage process.test.ts
```

### Deployment

The Lambda is deployed via AWS CDK in the compute stack:

```typescript
// cdk/lib/compute-stack.ts
this.eventProcessingFunction = new lambda.Function(this, 'EventProcessingFunction', {
  functionName: `inquiry-growth-${envName}-event-processing`,
  handler: 'process.handler',
  code: lambda.Code.fromAsset('lambda/events'),
  timeout: Duration.seconds(60),
  memorySize: 512,
  reservedConcurrentExecutions: 10,
  retryAttempts: 2,
});

// Add Kinesis event source
this.eventProcessingFunction.addEventSource(
  new KinesisEventSource(kinesisStream, {
    batchSize: 100,
    maxBatchingWindow: Duration.seconds(5),
    startingPosition: StartingPosition.LATEST,
    bisectBatchOnError: true,
    retryAttempts: 3,
    onFailure: new SqsDlq(eventProcessingDLQ),
    reportBatchItemFailures: true,
  })
);
```

---

## Requirements

- **Req 2**: Behavioral Event Tracking
- **Req 2.6**: Event processing and storage
- **Req 2.7**: User behavior metrics tracking
- **Req 22**: Canonical Event Schema v2.0
- **Task 6.1**: Implement event ingestion Lambda
- **Task 6.2**: Implement event processing Lambda

## Performance Targets

- **Ingestion Latency**: < 500ms (p95)
- **Processing Latency**: < 5 seconds (p95)
- **Throughput**: 1,000 events/second (Phase 1)
- **Availability**: 99.9%
- **Event Loss Rate**: < 0.1%
