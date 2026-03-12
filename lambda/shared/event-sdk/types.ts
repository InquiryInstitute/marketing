/**
 * Event SDK Types
 */

export type EventType = 'view' | 'click' | 'search' | 'share' | 'bookmark' | 'complete';

export interface EventMetadata {
  userAgent: string;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  referrer?: string;
  ipHash?: string;
}

export interface Event {
  eventId: string;
  eventType: EventType;
  timestamp: string;
  sessionId: string;
  userId?: string;
  contentId?: string;
  metadata: EventMetadata;
}

export interface EventRequest {
  eventType: EventType;
  contentId?: string;
  sessionId: string;
  userId?: string;
  metadata: EventMetadata;
}

export interface BufferedEvent {
  id: string;
  event: EventRequest;
  timestamp: number;
  retryCount: number;
  lastAttempt?: number;
}

export interface SDKOptions {
  apiKey: string;
  apiEndpoint: string;
  batchSize?: number;
  maxRetryAttempts?: number;
  retryBaseDelay?: number;
  maxDelay?: number;
  bufferTTL?: number;
}

export interface APIResponse {
  statusCode: number;
  body: string;
}

export interface EventResponse {
  eventId: string;
  message: string;
}

export interface BatchResponse {
  message: string;
  count?: number;
  eventIds?: string[];
}
