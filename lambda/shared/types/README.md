# Shared TypeScript Types and Validation Schemas

This package contains shared TypeScript types and Zod validation schemas used across all Lambda functions in the Inquiry Growth Engine.

## Overview

The shared types package provides:

1. **Content Types**: Interfaces for all content domains (article, course, product, event)
2. **Event Types**: Canonical Event Schema v2.0 for behavioral tracking
3. **User Types**: User profile and preference interfaces
4. **Validation Schemas**: Zod schemas for runtime validation

## Requirements Coverage

- **Req 1**: Content Publishing System - Content interfaces and validation
- **Req 2**: Behavioral Event Tracking - Event interfaces
- **Req 7**: User Profile Management - User profile interfaces
- **Req 16**: Multi-Domain Content - Support for article, course, product, event
- **Req 22**: Canonical Event Schema v2.0 - Standardized event format

## Installation

```bash
cd lambda/shared/types
npm install
```

## Usage

### Importing Types

```typescript
import {
  Content,
  Article,
  Course,
  CanonicalEvent,
  UserProfile,
} from '@inquiry-growth/shared-types';
```

### Using Validation Schemas

```typescript
import {
  createContentRequestSchema,
  canonicalEventSchema,
  validate,
  formatValidationErrors,
} from '@inquiry-growth/shared-types';

// Validate content creation request
const result = validate(createContentRequestSchema, requestBody);

if (!result.success) {
  const errors = formatValidationErrors(result.errors);
  return {
    statusCode: 400,
    body: JSON.stringify({ errors }),
  };
}

// Use validated data
const validatedData = result.data;
```

## Content Types

### Domains

The system supports four content domains:

1. **Article** (Phase 1): Blog posts, essays, articles
2. **Course** (Phase 2): Educational courses with lessons
3. **Product** (Phase 2): Physical or digital products
4. **Event** (Phase 2): Webinars, workshops, conferences

### Content States

- `draft`: Content is being created/edited
- `published`: Content is live and visible to users
- `archived`: Content is no longer active

### Example: Creating Article Content

```typescript
import { CreateContentRequest, Article } from '@inquiry-growth/shared-types';

const articleRequest: CreateContentRequest = {
  domain: 'article',
  title: 'Introduction to Philosophy',
  description: 'A beginner-friendly guide to philosophical thinking',
  body: '# Introduction\n\nPhilosophy is...',
  author: 'user-uuid',
  topics: ['philosophy', 'education'],
  tags: ['beginner', 'featured'],
  state: 'draft',
  readTime: 5,
};
```

## Event Types

### Canonical Event Schema v2.0

The Canonical Event Schema provides a standardized format for all user behavioral events.

### Event Types

- `view`: User viewed content
- `click`: User clicked on a recommendation or link
- `search`: User performed a search
- `purchase`: User purchased content

### Example: Creating an Event

```typescript
import { CanonicalEvent, CreateEventRequest } from '@inquiry-growth/shared-types';

const eventRequest: CreateEventRequest = {
  eventType: 'view',
  userId: 'user-uuid',
  sessionId: 'session-uuid',
  contentId: 'content-uuid',
  metadata: {
    userAgent: 'Mozilla/5.0...',
    deviceType: 'desktop',
    referrer: 'https://example.com',
  },
};
```

### Validation Rules

- `eventId`: Must be UUID v4 (auto-generated)
- `timestamp`: Must be ISO 8601 UTC, cannot be in future
- `contentId`: Required for `view` and `click` events
- `userId`: Optional (null for anonymous users)

## User Profile Types

### User Preferences

Users can customize their experience through preferences:

- **Topics**: Array of interested topics (max 20)
- **Content Types**: Preferred content domains
- **Email Frequency**: `daily`, `weekly`, or `never`

### Privacy Controls

- **Tracking Consent**: Whether to track behavioral data
- **Email Consent**: Whether to send marketing emails

### Example: Creating User Profile

```typescript
import { CreateUserProfileRequest } from '@inquiry-growth/shared-types';

const profileRequest: CreateUserProfileRequest = {
  userId: 'cognito-user-id',
  email: 'user@example.com',
  name: 'John Doe',
  preferences: {
    topics: ['philosophy', 'science'],
    contentTypes: ['article', 'course'],
    emailFrequency: 'weekly',
  },
  privacy: {
    trackingConsent: true,
    emailConsent: true,
  },
};
```

## Validation

All schemas include comprehensive validation rules:

### Content Validation

- Title: 1-500 characters
- Description: 1-2000 characters
- Body: Minimum 1 character (Markdown)
- Topics: 1-10 topics required
- Tags: Maximum 20 tags
- Domain-specific fields validated based on content type

### Event Validation

- Event ID: Must be valid UUID v4
- Timestamp: Must be valid ISO 8601, not in future
- Content ID: Required for view/click events
- User Agent: Required, non-empty string

### User Profile Validation

- Email: Must be valid email format
- Name: 1-200 characters
- Topics: Maximum 20 topics
- Preferences: Must match defined enums

## Error Handling

The validation module provides helper functions for error handling:

```typescript
import { validate, formatValidationErrors } from '@inquiry-growth/shared-types';

const result = validate(schema, data);

if (!result.success) {
  const formattedErrors = formatValidationErrors(result.errors);
  // Returns: [{ field: 'title', message: 'String must contain at least 1 character(s)' }]
}
```

## Type Safety

All types are fully typed with TypeScript, providing:

- Compile-time type checking
- IntelliSense support in IDEs
- Discriminated unions for content types
- Strict null checking

## DynamoDB Schema Alignment

The types align with DynamoDB table schemas:

### Content Table

- Partition Key: `id` (String)
- GSI: `domain-publishedAt-index`

### User Profiles Table

- Partition Key: `userId` (String)

### User Events Table

- Partition Key: `userId` (String)
- Sort Key: `timestamp` (Number)
- TTL: 7 days

## Future Extensions

### Phase 2 Additions

- Course domain with lessons and difficulty
- Product domain with pricing and inventory
- Event domain with dates and registration

### Phase 3 Additions

- Additional event types (share, complete)
- Advanced user segmentation
- Content versioning metadata

## Testing

To run type checking:

```bash
npm run build
```

## Contributing

When adding new types:

1. Add TypeScript interface in appropriate file
2. Add Zod validation schema in `validation.ts`
3. Export from `index.ts`
4. Update this README with examples
5. Ensure alignment with DynamoDB schemas

## References

- [Requirements Document](.kiro/specs/inquiry-growth-engine/requirements.md)
- [Design Document](.kiro/specs/inquiry-growth-engine/design.md)
- [Zod Documentation](https://zod.dev/)
