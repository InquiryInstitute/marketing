/**
 * Validation Schemas
 * Zod schemas for runtime validation of types
 * Requirements: Req 1, Req 2, Req 7, Req 22
 */

import { z } from 'zod';

// ============================================================================
// Content Validation Schemas
// ============================================================================

/**
 * UUID v4 validation
 */
const uuidSchema = z.string().uuid();

/**
 * Content domain schema
 */
export const contentDomainSchema = z.enum(['article', 'course', 'product', 'event']);

/**
 * Content state schema
 */
export const contentStateSchema = z.enum(['draft', 'published', 'archived']);

/**
 * Base content schema (common fields)
 */
const baseContentSchema = z.object({
  id: uuidSchema,
  domain: contentDomainSchema,
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(2000),
  body: z.string().min(1),
  author: uuidSchema,
  topics: z.array(z.string()).min(1).max(10),
  tags: z.array(z.string()).max(20),
  state: contentStateSchema,
  publishedAt: z.number().optional(),
  version: z.number().int().positive(),
  embedding: z.array(z.number()).length(1536).optional(),
  aiAssisted: z.boolean().optional(),
  aiModel: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

/**
 * Article schema
 */
export const articleSchema = baseContentSchema.extend({
  domain: z.literal('article'),
  readTime: z.number().int().positive().optional(),
});

/**
 * Course schema
 */
export const courseSchema = baseContentSchema.extend({
  domain: z.literal('course'),
  lessons: z.array(z.object({
    title: z.string().min(1).max(200),
    duration: z.number().int().positive(),
  })).min(1),
  totalDuration: z.number().int().positive(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  price: z.number().int().nonnegative().optional(),
});

/**
 * Product schema
 */
export const productSchema = baseContentSchema.extend({
  domain: z.literal('product'),
  price: z.number().int().positive(),
  inventory: z.number().int().nonnegative(),
  shippingRequired: z.boolean(),
});

/**
 * Event schema
 */
export const eventSchema = baseContentSchema.extend({
  domain: z.literal('event'),
  eventDate: z.number(),
  location: z.string().min(1).max(500),
  capacity: z.number().int().positive(),
  registrationUrl: z.string().url(),
});

/**
 * Content schema (discriminated union)
 */
export const contentSchema = z.discriminatedUnion('domain', [
  articleSchema,
  courseSchema,
  productSchema,
  eventSchema,
]);

/**
 * Create content request schema
 */
export const createContentRequestSchema = z.object({
  domain: contentDomainSchema,
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(2000),
  body: z.string().min(1),
  author: uuidSchema,
  topics: z.array(z.string()).min(1).max(10),
  tags: z.array(z.string()).max(20).optional(),
  state: contentStateSchema.optional(),
  // Domain-specific fields
  readTime: z.number().int().positive().optional(),
  lessons: z.array(z.object({
    title: z.string().min(1).max(200),
    duration: z.number().int().positive(),
  })).optional(),
  totalDuration: z.number().int().positive().optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  price: z.number().int().nonnegative().optional(),
  inventory: z.number().int().nonnegative().optional(),
  shippingRequired: z.boolean().optional(),
  eventDate: z.number().optional(),
  location: z.string().min(1).max(500).optional(),
  capacity: z.number().int().positive().optional(),
  registrationUrl: z.string().url().optional(),
}).refine((data) => {
  // Domain-specific validation
  if (data.domain === 'course') {
    return data.lessons && data.totalDuration && data.difficulty;
  }
  if (data.domain === 'product') {
    return data.price !== undefined && data.inventory !== undefined && data.shippingRequired !== undefined;
  }
  if (data.domain === 'event') {
    return data.eventDate && data.location && data.capacity && data.registrationUrl;
  }
  return true;
}, {
  message: 'Missing required domain-specific fields',
});

/**
 * Update content request schema
 */
export const updateContentRequestSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().min(1).max(2000).optional(),
  body: z.string().min(1).optional(),
  topics: z.array(z.string()).min(1).max(10).optional(),
  tags: z.array(z.string()).max(20).optional(),
  state: contentStateSchema.optional(),
  // Domain-specific fields
  readTime: z.number().int().positive().optional(),
  lessons: z.array(z.object({
    title: z.string().min(1).max(200),
    duration: z.number().int().positive(),
  })).optional(),
  totalDuration: z.number().int().positive().optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  price: z.number().int().nonnegative().optional(),
  inventory: z.number().int().nonnegative().optional(),
  shippingRequired: z.boolean().optional(),
  eventDate: z.number().optional(),
  location: z.string().min(1).max(500).optional(),
  capacity: z.number().int().positive().optional(),
  registrationUrl: z.string().url().optional(),
});

// ============================================================================
// Event Validation Schemas
// ============================================================================

/**
 * Event type schema
 */
export const eventTypeSchema = z.enum(['view', 'click', 'search', 'purchase']);

/**
 * Device type schema
 */
export const deviceTypeSchema = z.enum(['mobile', 'tablet', 'desktop']);

/**
 * Event metadata schema
 */
export const eventMetadataSchema = z.object({
  userAgent: z.string().min(1),
  deviceType: deviceTypeSchema,
  referrer: z.string().optional(),
  ipHash: z.string().optional(),
});

/**
 * Canonical Event schema v2.0
 */
export const canonicalEventSchema = z.object({
  version: z.literal('2.0'),
  eventId: uuidSchema,
  eventType: eventTypeSchema,
  timestamp: z.string().datetime(),
  userId: uuidSchema.optional(),
  sessionId: uuidSchema,
  contentId: uuidSchema.optional(),
  metadata: eventMetadataSchema,
}).refine((data) => {
  // contentId is required for view and click events
  if (data.eventType === 'view' || data.eventType === 'click') {
    return data.contentId !== undefined;
  }
  return true;
}, {
  message: 'contentId is required for view and click events',
  path: ['contentId'],
}).refine((data) => {
  // Timestamp must not be in the future
  const eventTime = new Date(data.timestamp).getTime();
  const now = Date.now();
  return eventTime <= now;
}, {
  message: 'Event timestamp cannot be in the future',
  path: ['timestamp'],
});

/**
 * Create event request schema
 */
export const createEventRequestSchema = z.object({
  eventType: eventTypeSchema,
  userId: uuidSchema.optional(),
  sessionId: uuidSchema,
  contentId: uuidSchema.optional(),
  metadata: eventMetadataSchema,
}).refine((data) => {
  // contentId is required for view and click events
  if (data.eventType === 'view' || data.eventType === 'click') {
    return data.contentId !== undefined;
  }
  return true;
}, {
  message: 'contentId is required for view and click events',
  path: ['contentId'],
});

// ============================================================================
// User Profile Validation Schemas
// ============================================================================

/**
 * Email frequency schema
 */
export const emailFrequencySchema = z.enum(['daily', 'weekly', 'never']);

/**
 * Content type preference schema
 */
export const contentTypePreferenceSchema = z.enum(['article', 'course', 'product', 'event']);

/**
 * User preferences schema
 */
export const userPreferencesSchema = z.object({
  topics: z.array(z.string()).max(20),
  contentTypes: z.array(contentTypePreferenceSchema),
  emailFrequency: emailFrequencySchema,
});

/**
 * User behavior schema
 */
export const userBehaviorSchema = z.object({
  lastActive: z.number(),
  totalViews: z.number().int().nonnegative(),
  totalPurchases: z.number().int().nonnegative(),
});

/**
 * User privacy schema
 */
export const userPrivacySchema = z.object({
  trackingConsent: z.boolean(),
  emailConsent: z.boolean(),
});

/**
 * User profile schema
 */
export const userProfileSchema = z.object({
  userId: uuidSchema,
  email: z.string().email(),
  name: z.string().min(1).max(200),
  preferences: userPreferencesSchema,
  behavior: userBehaviorSchema,
  privacy: userPrivacySchema,
  createdAt: z.number(),
  updatedAt: z.number(),
});

/**
 * Create user profile request schema
 */
export const createUserProfileRequestSchema = z.object({
  userId: uuidSchema,
  email: z.string().email(),
  name: z.string().min(1).max(200),
  preferences: userPreferencesSchema.partial().optional(),
  privacy: userPrivacySchema.partial().optional(),
});

/**
 * Update user profile request schema
 */
export const updateUserProfileRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  preferences: userPreferencesSchema.partial().optional(),
  privacy: userPrivacySchema.partial().optional(),
});

// ============================================================================
// Validation Helper Functions
// ============================================================================

/**
 * Validate data against a schema and return typed result
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

/**
 * Format Zod errors for API responses
 */
export function formatValidationErrors(error: z.ZodError): Array<{ field: string; message: string }> {
  return error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));
}
