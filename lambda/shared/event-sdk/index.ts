/**
 * Event SDK - Client-side event capture with localStorage buffering
 */

import { Event, EventRequest, BufferedEvent, SDKOptions, EventResponse, BatchResponse } from './types';

const STORAGE_KEY = 'inquiry_events_buffer';
const STORAGE_VERSION = '1.0';

/**
 * Event SDK for client-side event capture
 */
export class EventSDK {
  private apiKey: string;
  private apiEndpoint: string;
  private batchSize: number;
  private maxRetryAttempts: number;
  private retryBaseDelay: number;
  private maxDelay: number;
  private bufferTTL: number;

  /**
   * Initialize the Event SDK
   */
  constructor(options: SDKOptions) {
    this.apiKey = options.apiKey;
    this.apiEndpoint = options.apiEndpoint;
    this.batchSize = options.batchSize || 10;
    this.maxRetryAttempts = options.maxRetryAttempts || 5;
    this.retryBaseDelay = options.retryBaseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.bufferTTL = options.bufferTTL || 7 * 24 * 60 * 60 * 1000; // 7 days

    // Clean up expired events on startup
    this.cleanupExpiredEvents();
  }

  /**
   * Get buffered events from localStorage
   */
  private getBufferedEvents(): BufferedEvent[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return [];
      }
      const parsed = JSON.parse(stored);
      if (parsed.version !== STORAGE_VERSION) {
        return [];
      }
      return parsed.events || [];
    } catch (error) {
      console.error('Error reading event buffer:', error);
      return [];
    }
  }

  /**
   * Save buffered events to localStorage
   */
  private saveBufferedEvents(events: BufferedEvent[]): void {
    try {
      const data = {
        version: STORAGE_VERSION,
        events,
        lastUpdated: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving event buffer:', error);
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Check if browser is online
   */
  isOnline(): boolean {
    return navigator.onLine;
  }

  /**
   * Cleanup expired events from buffer
   */
  private cleanupExpiredEvents(): void {
    const now = Date.now();
    const events = this.getBufferedEvents();
    const validEvents = events.filter(
      (e) => now - e.timestamp < this.bufferTTL
    );

    if (validEvents.length !== events.length) {
      this.saveBufferedEvents(validEvents);
    }
  }

  /**
   * Get pending event count
   */
  getPendingCount(): number {
    return this.getBufferedEvents().length;
  }

  /**
   * Clear all pending events from buffer
   */
  clearBuffer(): void {
    this.saveBufferedEvents([]);
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoffDelay(retryCount: number): number {
    const delay = this.retryBaseDelay * Math.pow(2, retryCount);
    return Math.min(delay, this.maxDelay);
  }

  /**
   * Capture an event
   */
  async captureEvent(event: EventRequest): Promise<void> {
    // Generate event ID and timestamp
    const eventId = this.generateEventId();
    const timestamp = new Date().toISOString();

    // Create buffered event
    const bufferedEvent: BufferedEvent = {
      id: eventId,
      event,
      timestamp: Date.now(),
      retryCount: 0,
    };

    // Add to buffer
    const events = this.getBufferedEvents();
    events.push(bufferedEvent);
    this.saveBufferedEvents(events);

    // Try to send immediately if online
    if (this.isOnline()) {
      this.flush().catch((err) =>
        console.error('Failed to flush events:', err)
      );
    }
  }

  /**
   * Send events to API
   */
  private async sendEvents(events: BufferedEvent[]): Promise<void> {
    const eventsToSend = events.map((e) => e.event);

    try {
      const response = await fetch(`${this.apiEndpoint}/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(eventsToSend),
      });

      if (response.ok) {
        // Remove sent events from buffer
        const sentIds = new Set(events.map((e) => e.id));
        const remainingEvents = this.getBufferedEvents().filter(
          (e) => !sentIds.has(e.id)
        );
        this.saveBufferedEvents(remainingEvents);
      } else if (response.status === 429) {
        // Rate limited - keep events in buffer for retry
        throw new Error('Rate limit exceeded');
      } else if (response.status >= 400 && response.status < 500) {
        // Validation error - discard events
        const sentIds = new Set(events.map((e) => e.id));
        const remainingEvents = this.getBufferedEvents().filter(
          (e) => !sentIds.has(e.id)
        );
        this.saveBufferedEvents(remainingEvents);
        console.warn('Events discarded due to validation error');
      } else {
        throw new Error(`API error: ${response.status}`);
      }
    } catch (error) {
      // Update retry counts for failed events
      const events = this.getBufferedEvents();
      const failedEventIds = new Set(events.filter((e) => events.includes(e)).map((e) => e.id));

      const updatedEvents = events.map((e) => {
        if (failedEventIds.has(e.id)) {
          return {
            ...e,
            retryCount: e.retryCount + 1,
            lastAttempt: Date.now(),
          };
        }
        return e;
      });

      this.saveBufferedEvents(updatedEvents);
      throw error;
    }
  }

  /**
   * Flush pending events to server
   */
  async flush(): Promise<void> {
    if (!this.isOnline()) {
      console.log('Browser is offline, events will be sent when online');
      return;
    }

    const events = this.getBufferedEvents();
    if (events.length === 0) {
      return;
    }

    // Process events in batches
    for (let i = 0; i < events.length; i += this.batchSize) {
      const batch = events.slice(i, i + this.batchSize);

      try {
        await this.sendEvents(batch);
      } catch (error) {
        console.error('Error sending batch:', error);

        // Apply exponential backoff before next batch
        const delay = this.calculateBackoffDelay(
          Math.max(...batch.map((e) => e.retryCount))
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Auto-flush on page unload
   */
  setupAutoFlush(): void {
    window.addEventListener('beforeunload', () => {
      this.flush().catch((err) =>
        console.error('Failed to flush on unload:', err)
      );
    });

    // Also flush periodically
    setInterval(() => {
      this.flush().catch((err) =>
        console.error('Failed to flush periodically:', err)
      );
    }, 30000); // Flush every 30 seconds
  }

  /**
   * Setup online/offline event handling
   */
  setupNetworkHandling(): void {
    window.addEventListener('online', () => {
      console.log('Browser is online, flushing events');
      this.flush().catch((err) =>
        console.error('Failed to flush on online:', err)
      );
    });

    window.addEventListener('offline', () => {
      console.log('Browser is offline, events will be buffered');
    });
  }

  /**
   * Initialize SDK with auto-flush and network handling
   */
  initialize(): void {
    this.setupAutoFlush();
    this.setupNetworkHandling();
  }
}
