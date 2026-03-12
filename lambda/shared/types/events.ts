/**
 * Canonical Event Types
 * Standardized event format for tracking user interactions
 * Requirements: Req 2 (Behavioral Event Tracking), Req 22 (Canonical Event Schema v2.0)
 */

/**
 * Event types supported by the system
 */
export type EventType = 'view' | 'click' | 'search' | 'share' | 'bookmark' | 'complete' | 'purchase';

/**
 * Device types
 */
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

/**
 * Event metadata containing device and context information
 */
export interface EventMetadata {
  userAgent: string;
  deviceType: DeviceType;
  referrer?: string;
  ipHash?: string;               // SHA-256 hash for privacy
}

/**
 * Canonical Event Schema v2.0
 * Standardized format for all user behavioral events
 */
export interface CanonicalEvent {
  version: '2.0';
  eventId: string;               // UUID v4
  eventType: EventType;
  timestamp: string;             // ISO 8601 UTC
  userId?: string;               // Null for anonymous users
  sessionId: string;             // UUID v4
  contentId?: string;            // Required for view/click events
  metadata: EventMetadata;
}

/**
 * Event creation request (without system-generated fields)
 */
export interface CreateEventRequest {
  eventType: EventType;
  userId?: string;
  sessionId: string;
  contentId?: string;
  metadata: EventMetadata;
}

/**
 * User event history entry (stored in DynamoDB)
 */
export interface UserEventHistory {
  userId: string;                // Partition key
  timestamp: number;             // Sort key (Unix timestamp)
  eventId: string;
  eventType: EventType;
  sessionId: string;
  contentId?: string;
  metadata: EventMetadata;
}

/**
 * Event query parameters
 */
export interface EventQueryParams {
  userId: string;
  eventType?: EventType;
  limit?: number;
  startTime?: number;            // Unix timestamp
  endTime?: number;              // Unix timestamp
}

/**
 * Event processing result
 */
export interface EventProcessingResult {
  success: boolean;
  eventId: string;
  error?: string;
}
