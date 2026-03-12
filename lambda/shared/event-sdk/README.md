# Event SDK

Client-side TypeScript SDK for event capture with localStorage buffering and retry logic.

## Features

- **Event Capture**: Simple API for capturing user events (view, click, search, etc.)
- **Offline Support**: Events are buffered in localStorage when offline
- **Automatic Retry**: Exponential backoff retry logic for failed events
- **Batching**: Events are batched to reduce API calls
- **Privacy**: No PII stored in localStorage

## Installation

```bash
npm install @inquiry/event-sdk
```

## Usage

```typescript
import { EventSDK } from '@inquiry/event-sdk';

// Initialize the SDK
const eventSDK = new EventSDK({
  apiKey: 'your-api-key',
  apiEndpoint: 'https://api.inquiry.institute/events',
  batchSize: 10,
  maxRetryAttempts: 5,
});

// Initialize with auto-flush and network handling
eventSDK.initialize();

// Capture a view event
await eventSDK.captureEvent({
  eventType: 'view',
  contentId: 'article-123',
  sessionId: 'session-456',
  metadata: {
    userAgent: navigator.userAgent,
    deviceType: 'desktop',
  },
});

// Capture a click event
await eventSDK.captureEvent({
  eventType: 'click',
  contentId: 'article-123',
  sessionId: 'session-456',
  metadata: {
    userAgent: navigator.userAgent,
    deviceType: 'desktop',
  },
});

// Flush pending events
await eventSDK.flush();

// Get pending event count
const pendingCount = eventSDK.getPendingCount();
```

## API Reference

### EventSDK

#### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| apiKey | string | - | API key for authentication |
| apiEndpoint | string | - | API endpoint for event ingestion |
| batchSize | number | 10 | Maximum events per batch |
| maxRetryAttempts | number | 5 | Maximum retry attempts |
| retryBaseDelay | number | 1000 | Base delay for exponential backoff (ms) |
| maxDelay | number | 30000 | Maximum delay between retries (ms) |
| bufferTTL | number | 604800000 | Event buffer TTL in ms (7 days) |

#### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `captureEvent(event)` | `Promise<void>` | Capture an event |
| `flush()` | `Promise<void>` | Flush pending events to server |
| `getPendingCount()` | `number` | Get number of pending events |
| `clearBuffer()` | `void` | Clear all pending events from buffer |
| `isOnline()` | `boolean` | Check if browser is online |
| `initialize()` | `void` | Initialize with auto-flush and network handling |

### Event Types

```typescript
interface Event {
  eventId: string;
  eventType: 'view' | 'click' | 'search' | 'share' | 'bookmark' | 'complete';
  timestamp: string;
  sessionId: string;
  userId?: string;
  contentId?: string;
  metadata: EventMetadata;
}

interface EventMetadata {
  userAgent: string;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  referrer?: string;
  ipHash?: string;
}
```

## Error Handling

The SDK handles errors gracefully:

- **Network errors**: Events are buffered for retry
- **Rate limit errors (429)**: Retry with exponential backoff
- **Validation errors (400)**: Events are discarded
- **Server errors (5xx)**: Retry with exponential backoff

## Privacy

- No PII is stored in localStorage
- User IDs are optional and only stored when provided
- Events are automatically purged after 7 days

## Requirements

- TypeScript 5.0+
- ES2020+ runtime
- localStorage support
