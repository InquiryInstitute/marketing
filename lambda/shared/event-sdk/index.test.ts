/**
 * Event SDK Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventSDK } from './index';

// Mock localStorage
const createMockStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

Object.defineProperty(window, 'localStorage', {
  value: createMockStorage(),
});

// Mock fetch
const mockFetch = vi.fn();
Object.defineProperty(window, 'fetch', {
  value: mockFetch,
});

// Mock navigator.onLine
let isOnline = true;
Object.defineProperty(navigator, 'onLine', {
  value: {
    get: () => isOnline,
  },
});

describe('EventSDK', () => {
  let sdk: EventSDK;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    mockFetch.mockClear();
    isOnline = true;

    // Setup mock fetch
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 202,
        json: () => Promise.resolve({ message: 'Events accepted' }),
      })
    );

    sdk = new EventSDK({
      apiKey: 'test-api-key',
      apiEndpoint: 'https://api.example.com/events',
      batchSize: 5,
      maxRetryAttempts: 3,
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('captureEvent', () => {
    it('should capture event and add to buffer', async () => {
      await sdk.captureEvent({
        eventType: 'view',
        contentId: 'article-123',
        sessionId: 'session-456',
        metadata: {
          userAgent: 'Mozilla/5.0',
          deviceType: 'desktop',
        },
      });

      expect(sdk.getPendingCount()).toBe(1);
    });

    it('should generate unique event IDs', async () => {
      await sdk.captureEvent({
        eventType: 'view',
        contentId: 'article-123',
        sessionId: 'session-456',
        metadata: {
          userAgent: 'Mozilla/5.0',
          deviceType: 'desktop',
        },
      });

      await sdk.captureEvent({
        eventType: 'click',
        contentId: 'article-123',
        sessionId: 'session-456',
        metadata: {
          userAgent: 'Mozilla/5.0',
          deviceType: 'desktop',
        },
      });

      const events = JSON.parse(localStorage.getItem('inquiry_events_buffer') || '{}');
      expect(events.events.length).toBe(2);
      expect(events.events[0].id).not.toBe(events.events[1].id);
    });

    it('should include timestamp in buffered event', async () => {
      const startTime = Date.now();
      await sdk.captureEvent({
        eventType: 'view',
        contentId: 'article-123',
        sessionId: 'session-456',
        metadata: {
          userAgent: 'Mozilla/5.0',
          deviceType: 'desktop',
        },
      });

      const events = JSON.parse(localStorage.getItem('inquiry_events_buffer') || '{}');
      expect(events.events[0].timestamp).toBeGreaterThanOrEqual(startTime);
    });
  });

  describe('flush', () => {
    it('should send events to API when online', async () => {
      await sdk.captureEvent({
        eventType: 'view',
        contentId: 'article-123',
        sessionId: 'session-456',
        metadata: {
          userAgent: 'Mozilla/5.0',
          deviceType: 'desktop',
        },
      });

      await sdk.flush();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(sdk.getPendingCount()).toBe(0);
    });

    it('should not send events when offline', async () => {
      isOnline = false;

      await sdk.captureEvent({
        eventType: 'view',
        contentId: 'article-123',
        sessionId: 'session-456',
        metadata: {
          userAgent: 'Mozilla/5.0',
          deviceType: 'desktop',
        },
      });

      await sdk.flush();

      expect(mockFetch).not.toHaveBeenCalled();
      expect(sdk.getPendingCount()).toBe(1);
    });

    it('should batch events according to batchSize', async () => {
      for (let i = 0; i < 12; i++) {
        await sdk.captureEvent({
          eventType: 'view',
          contentId: `article-${i}`,
          sessionId: 'session-456',
          metadata: {
            userAgent: 'Mozilla/5.0',
            deviceType: 'desktop',
          },
        });
      }

      await sdk.flush();

      expect(mockFetch).toHaveBeenCalledTimes(3); // 5 + 5 + 2
    });

    it('should remove events from buffer after successful send', async () => {
      await sdk.captureEvent({
        eventType: 'view',
        contentId: 'article-123',
        sessionId: 'session-456',
        metadata: {
          userAgent: 'Mozilla/5.0',
          deviceType: 'desktop',
        },
      });

      await sdk.flush();

      expect(sdk.getPendingCount()).toBe(0);
      expect(localStorage.getItem('inquiry_events_buffer')).toBeNull();
    });

    it('should retry on rate limit (429)', async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
        })
      );

      await sdk.captureEvent({
        eventType: 'view',
        contentId: 'article-123',
        sessionId: 'session-456',
        metadata: {
          userAgent: 'Mozilla/5.0',
          deviceType: 'desktop',
        },
      });

      await sdk.flush();

      // Event should still be in buffer for retry
      expect(sdk.getPendingCount()).toBe(1);
    });

    it('should discard events on validation error (400)', async () => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
        })
      );

      await sdk.captureEvent({
        eventType: 'view',
        contentId: 'article-123',
        sessionId: 'session-456',
        metadata: {
          userAgent: 'Mozilla/5.0',
          deviceType: 'desktop',
        },
      });

      await sdk.flush();

      // Event should be discarded
      expect(sdk.getPendingCount()).toBe(0);
    });
  });

  describe('clearBuffer', () => {
    it('should clear all pending events', async () => {
      await sdk.captureEvent({
        eventType: 'view',
        contentId: 'article-123',
        sessionId: 'session-456',
        metadata: {
          userAgent: 'Mozilla/5.0',
          deviceType: 'desktop',
        },
      });

      sdk.clearBuffer();

      expect(sdk.getPendingCount()).toBe(0);
    });
  });

  describe('cleanupExpiredEvents', () => {
    it('should remove events older than TTL', () => {
      // Create an event with old timestamp
      const oldEvent = {
        id: 'old-event',
        event: {
          eventType: 'view',
          sessionId: 'session-456',
          metadata: {
            userAgent: 'Mozilla/5.0',
            deviceType: 'desktop',
          },
        },
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
        retryCount: 0,
      };

      const newEvent = {
        id: 'new-event',
        event: {
          eventType: 'view',
          sessionId: 'session-456',
          metadata: {
            userAgent: 'Mozilla/5.0',
            deviceType: 'desktop',
          },
        },
        timestamp: Date.now(),
        retryCount: 0,
      };

      localStorage.setItem(
        'inquiry_events_buffer',
        JSON.stringify({
          version: '1.0',
          events: [oldEvent, newEvent],
        })
      );

      sdk['cleanupExpiredEvents']();

      const events = JSON.parse(localStorage.getItem('inquiry_events_buffer') || '{}');
      expect(events.events.length).toBe(1);
      expect(events.events[0].id).toBe('new-event');
    });
  });
});
