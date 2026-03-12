/**
 * Usage Examples
 * Demonstrates how to use the shared types and validation schemas
 */

import {
  // Content types
  Article,
  Course,
  CreateContentRequest,
  // Event types
  CanonicalEvent,
  CreateEventRequest,
  // User types
  UserProfile,
  CreateUserProfileRequest,
  // Validation
  createContentRequestSchema,
  canonicalEventSchema,
  userProfileSchema,
  validate,
  formatValidationErrors,
} from './index';

// ============================================================================
// Content Examples
// ============================================================================

/**
 * Example: Creating an article
 */
export function createArticleExample(): CreateContentRequest {
  return {
    domain: 'article',
    title: 'Introduction to Stoic Philosophy',
    description: 'Learn the fundamentals of Stoic philosophy and how to apply them in modern life',
    body: `# Introduction to Stoic Philosophy

Stoicism is an ancient Greek philosophy that teaches the development of self-control and fortitude as a means of overcoming destructive emotions.

## Key Principles

1. **Virtue is the highest good**
2. **Focus on what you can control**
3. **Accept what you cannot change**

## Modern Applications

Stoic principles remain relevant today...`,
    author: '550e8400-e29b-41d4-a716-446655440000',
    topics: ['philosophy', 'stoicism', 'self-improvement'],
    tags: ['beginner', 'featured'],
    state: 'draft',
    readTime: 8,
  };
}

/**
 * Example: Creating a course
 */
export function createCourseExample(): CreateContentRequest {
  return {
    domain: 'course',
    title: 'Philosophy 101: Ancient Wisdom',
    description: 'A comprehensive introduction to ancient philosophical traditions',
    body: 'Course overview and syllabus...',
    author: '550e8400-e29b-41d4-a716-446655440000',
    topics: ['philosophy', 'education'],
    tags: ['course', 'beginner'],
    state: 'published',
    lessons: [
      { title: 'Introduction to Philosophy', duration: 45 },
      { title: 'Pre-Socratic Philosophers', duration: 60 },
      { title: 'Socrates and Plato', duration: 75 },
      { title: 'Aristotle and Logic', duration: 60 },
    ],
    totalDuration: 240,
    difficulty: 'beginner',
    price: 4999, // $49.99
  };
}

/**
 * Example: Validating content creation request
 */
export function validateContentExample(data: unknown) {
  const result = validate(createContentRequestSchema, data);

  if (!result.success) {
    const errors = formatValidationErrors(result.errors);
    console.error('Validation failed:', errors);
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Validation Error',
        details: errors,
      }),
    };
  }

  console.log('Validation succeeded:', result.data);
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Content validated successfully' }),
  };
}

// ============================================================================
// Event Examples
// ============================================================================

/**
 * Example: Creating a view event
 */
export function createViewEventExample(): CreateEventRequest {
  return {
    eventType: 'view',
    userId: '550e8400-e29b-41d4-a716-446655440000',
    sessionId: '660e8400-e29b-41d4-a716-446655440001',
    contentId: '770e8400-e29b-41d4-a716-446655440002',
    metadata: {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      deviceType: 'desktop',
      referrer: 'https://inquiry.institute/home',
    },
  };
}

/**
 * Example: Creating a search event (anonymous user)
 */
export function createSearchEventExample(): CreateEventRequest {
  return {
    eventType: 'search',
    sessionId: '660e8400-e29b-41d4-a716-446655440001',
    metadata: {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X)',
      deviceType: 'mobile',
    },
  };
}

/**
 * Example: Creating a complete canonical event
 */
export function createCanonicalEventExample(): CanonicalEvent {
  return {
    version: '2.0',
    eventId: '880e8400-e29b-41d4-a716-446655440003',
    eventType: 'click',
    timestamp: new Date().toISOString(),
    userId: '550e8400-e29b-41d4-a716-446655440000',
    sessionId: '660e8400-e29b-41d4-a716-446655440001',
    contentId: '770e8400-e29b-41d4-a716-446655440002',
    metadata: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      deviceType: 'desktop',
      referrer: 'https://inquiry.institute/recommendations',
      ipHash: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
    },
  };
}

/**
 * Example: Validating canonical event
 */
export function validateEventExample(data: unknown) {
  const result = validate(canonicalEventSchema, data);

  if (!result.success) {
    const errors = formatValidationErrors(result.errors);
    console.error('Event validation failed:', errors);
    return { valid: false, errors };
  }

  console.log('Event validated successfully');
  return { valid: true, event: result.data };
}

// ============================================================================
// User Profile Examples
// ============================================================================

/**
 * Example: Creating a user profile
 */
export function createUserProfileExample(): CreateUserProfileRequest {
  return {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    email: 'john.doe@example.com',
    name: 'John Doe',
    preferences: {
      topics: ['philosophy', 'science', 'history'],
      contentTypes: ['article', 'course'],
      emailFrequency: 'weekly',
    },
    privacy: {
      trackingConsent: true,
      emailConsent: true,
    },
  };
}

/**
 * Example: Complete user profile with behavior
 */
export function completeUserProfileExample(): UserProfile {
  return {
    userId: '550e8400-e29b-41d4-a716-446655440000',
    email: 'john.doe@example.com',
    name: 'John Doe',
    preferences: {
      topics: ['philosophy', 'science', 'history'],
      contentTypes: ['article', 'course'],
      emailFrequency: 'weekly',
    },
    behavior: {
      lastActive: Date.now(),
      totalViews: 127,
      totalPurchases: 3,
    },
    privacy: {
      trackingConsent: true,
      emailConsent: true,
    },
    createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
    updatedAt: Date.now(),
  };
}

/**
 * Example: Validating user profile
 */
export function validateUserProfileExample(data: unknown) {
  const result = validate(userProfileSchema, data);

  if (!result.success) {
    const errors = formatValidationErrors(result.errors);
    console.error('Profile validation failed:', errors);
    return { valid: false, errors };
  }

  console.log('Profile validated successfully');
  return { valid: true, profile: result.data };
}

// ============================================================================
// Lambda Handler Example
// ============================================================================

/**
 * Example: Lambda handler with validation
 */
export async function exampleLambdaHandler(event: any) {
  try {
    // Parse request body
    const body = JSON.parse(event.body);

    // Validate request
    const validationResult = validate(createContentRequestSchema, body);

    if (!validationResult.success) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Validation Error',
          details: formatValidationErrors(validationResult.errors),
        }),
      };
    }

    // Use validated data
    const contentRequest = validationResult.data;

    // Process the request...
    // (Save to DynamoDB, generate embeddings, etc.)

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Content created successfully',
        contentId: '770e8400-e29b-41d4-a716-446655440002',
      }),
    };
  } catch (error) {
    console.error('Error processing request:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      }),
    };
  }
}
