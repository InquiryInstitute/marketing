/**
 * Input Validation and Sanitization Module
 * Provides validation schemas and sanitization utilities
 * Requirements: Req 25.4 (Sanitize inputs to prevent XSS), Task 13.1
 */

import { z } from 'zod';

/**
 * Sanitize HTML content to prevent XSS attacks
 */
export function sanitizeHtml(input: string): string {
  // Remove HTML tags
  let sanitized = input.replace(/<[^>]*>/g, '');

  // Remove event handlers
  sanitized = sanitized.replace(/\s(on\w+)="[^"]*"/gi, '');

  // Remove javascript: URLs
  sanitized = sanitized.replace(/javascript:/gi, '');

  // Remove vbscript: URLs
  sanitized = sanitized.replace(/vbscript:/gi, '');

  // Remove data: URLs (except safe data URLs)
  sanitized = sanitized.replace(/data:(?!image\/|text\/)/gi, '');

  // Limit length
  const MAX_LENGTH = 10000;
  if (sanitized.length > MAX_LENGTH) {
    sanitized = sanitized.substring(0, MAX_LENGTH);
  }

  return sanitized.trim();
}

/**
 * Sanitize user input text
 */
export function sanitizeText(input: string): string {
  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');

  // Remove control characters (except newline, tab)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Limit length
  const MAX_LENGTH = 10000;
  if (sanitized.length > MAX_LENGTH) {
    sanitized = sanitized.substring(0, MAX_LENGTH);
  }

  return sanitized.trim();
}

/**
 * Validate content input
 */
export const ContentSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  body: z.string().min(1).max(50000),
  domain: z.enum(['article', 'course', 'product', 'event']),
  topics: z.array(z.string()).max(10),
  tags: z.array(z.string()).max(20),
  state: z.enum(['draft', 'published', 'archived']).optional(),
});

/**
 * Validate event input
 */
export const EventSchema = z.object({
  eventType: z.enum(['view', 'click', 'search', 'share', 'bookmark', 'complete']),
  contentId: z.string().optional(),
  sessionId: z.string().uuid(),
  userId: z.string().optional(),
  metadata: z.object({
    userAgent: z.string().min(1),
    deviceType: z.enum(['mobile', 'tablet', 'desktop']),
    referrer: z.string().optional(),
  }),
});

/**
 * Validate profile input
 */
export const ProfileSchema = z.object({
  preferences: z
    .object({
      topics: z.array(z.string()).max(10),
      contentTypes: z.array(z.string()).max(10),
      emailFrequency: z.enum(['daily', 'weekly', 'never']).optional(),
    })
    .optional(),
  privacy: z
    .object({
      trackingConsent: z.boolean().optional(),
      emailConsent: z.boolean().optional(),
    })
    .optional(),
});

/**
 * Validate search input
 */
export const SearchSchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  domain: z.string().optional(),
  state: z.enum(['draft', 'published', 'archived']).optional(),
  topics: z.string().optional(),
});

/**
 * Validate recommendation input
 */
export const RecommendationSchema = z.object({
  userId: z.string().min(1),
  count: z.number().int().min(1).max(50).optional(),
});

/**
 * Validate user input
 */
export function validateUserInput(input: string, maxLength: number = 1000): { valid: boolean; error?: string } {
  if (!input || input.length === 0) {
    return { valid: false, error: 'Input is required' };
  }

  if (input.length > maxLength) {
    return { valid: false, error: `Input exceeds maximum length of ${maxLength}` };
  }

  // Check for potentially dangerous patterns
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /data\s*:/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(input)) {
      return { valid: false, error: 'Input contains potentially dangerous content' };
    }
  }

  return { valid: true };
}

/**
 * Validate content length
 */
export function validateContentLength(
  title: string,
  description: string,
  body: string
): { valid: boolean; errors?: string[] } {
  const errors: string[] = [];

  if (!title || title.length === 0) {
    errors.push('Title is required');
  } else if (title.length > 200) {
    errors.push('Title exceeds maximum length of 200 characters');
  }

  if (!description || description.length === 0) {
    errors.push('Description is required');
  } else if (description.length > 500) {
    errors.push('Description exceeds maximum length of 500 characters');
  }

  if (!body || body.length === 0) {
    errors.push('Body is required');
  } else if (body.length > 50000) {
    errors.push('Body exceeds maximum length of 50000 characters');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
