/**
 * Rate Limiter for Authentication Endpoints
 * Implements rate limiting (5 attempts per 15 min) and account lockout (5 failed attempts)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { RateLimitEntry } from './types';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const RATE_LIMIT_TABLE = process.env.RATE_LIMIT_TABLE || 'inquiry-growth-dev-rate-limits';
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export class RateLimiter {
  /**
   * Check if the request should be rate limited
   * @param identifier - Email or IP address
   * @returns true if rate limited, false otherwise
   */
  static async isRateLimited(identifier: string): Promise<{ limited: boolean; reason?: string }> {
    const now = Date.now();
    
    try {
      // Get current rate limit entry
      const result = await docClient.send(
        new GetCommand({
          TableName: RATE_LIMIT_TABLE,
          Key: { identifier },
        })
      );

      const entry = result.Item as RateLimitEntry | undefined;

      // No previous attempts
      if (!entry) {
        return { limited: false };
      }

      // Check if account is locked
      if (entry.lockedUntil && entry.lockedUntil > now) {
        const remainingSeconds = Math.ceil((entry.lockedUntil - now) / 1000);
        return {
          limited: true,
          reason: `Account locked. Try again in ${remainingSeconds} seconds.`,
        };
      }

      // Check if window has expired
      if (now - entry.firstAttempt > WINDOW_MS) {
        // Window expired, reset
        return { limited: false };
      }

      // Check if max attempts exceeded
      if (entry.attempts >= MAX_ATTEMPTS) {
        return {
          limited: true,
          reason: `Too many attempts. Try again in ${Math.ceil((entry.firstAttempt + WINDOW_MS - now) / 1000)} seconds.`,
        };
      }

      return { limited: false };
    } catch (error) {
      console.error('Error checking rate limit:', error);
      // Fail open - don't block on rate limiter errors
      return { limited: false };
    }
  }

  /**
   * Record a failed authentication attempt
   * @param identifier - Email or IP address
   */
  static async recordFailedAttempt(identifier: string): Promise<void> {
    const now = Date.now();

    try {
      // Get current entry
      const result = await docClient.send(
        new GetCommand({
          TableName: RATE_LIMIT_TABLE,
          Key: { identifier },
        })
      );

      const entry = result.Item as RateLimitEntry | undefined;

      let newEntry: RateLimitEntry;

      if (!entry || now - entry.firstAttempt > WINDOW_MS) {
        // New window
        newEntry = {
          attempts: 1,
          firstAttempt: now,
        };
      } else {
        // Increment attempts
        newEntry = {
          attempts: entry.attempts + 1,
          firstAttempt: entry.firstAttempt,
        };

        // Lock account if max attempts reached
        if (newEntry.attempts >= MAX_ATTEMPTS) {
          newEntry.lockedUntil = now + LOCKOUT_MS;
        }
      }

      // Save updated entry with TTL (expire after 1 hour)
      await docClient.send(
        new PutCommand({
          TableName: RATE_LIMIT_TABLE,
          Item: {
            identifier,
            ...newEntry,
            ttl: Math.floor((now + 60 * 60 * 1000) / 1000), // 1 hour from now
          },
        })
      );
    } catch (error) {
      console.error('Error recording failed attempt:', error);
      // Don't throw - rate limiting is best effort
    }
  }

  /**
   * Clear rate limit entry on successful authentication
   * @param identifier - Email or IP address
   */
  static async clearRateLimit(identifier: string): Promise<void> {
    try {
      await docClient.send(
        new PutCommand({
          TableName: RATE_LIMIT_TABLE,
          Item: {
            identifier,
            attempts: 0,
            firstAttempt: Date.now(),
            ttl: Math.floor((Date.now() + 60 * 60 * 1000) / 1000),
          },
        })
      );
    } catch (error) {
      console.error('Error clearing rate limit:', error);
      // Don't throw - rate limiting is best effort
    }
  }
}
