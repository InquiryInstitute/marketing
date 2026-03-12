/**
 * Shared Types and Validation Schemas
 * Central export for all shared types and validation schemas
 * 
 * Requirements:
 * - Req 1 (Content Publishing System)
 * - Req 2 (Behavioral Event Tracking)
 * - Req 7 (User Profile Management)
 * - Req 16 (Multi-Domain Content)
 * - Req 22 (Canonical Event Schema v2.0)
 */

// Content types
export {
  ContentDomain,
  ContentState,
  BaseContent,
  Article,
  Course,
  Product,
  Event,
  Content,
  CreateContentRequest,
  UpdateContentRequest,
  ContentQueryParams,
} from './content';

// Event types
export {
  EventType,
  DeviceType,
  EventMetadata,
  CanonicalEvent,
  CreateEventRequest,
  UserEventHistory,
  EventQueryParams,
  EventProcessingResult,
} from './events';

// User types
export {
  EmailFrequency,
  ContentTypePreference,
  UserPreferences,
  UserBehavior,
  UserPrivacy,
  UserProfile,
  CreateUserProfileRequest,
  UpdateUserProfileRequest,
  UserProfileQueryResult,
} from './user';

// Validation schemas
export {
  contentDomainSchema,
  contentStateSchema,
  articleSchema,
  courseSchema,
  productSchema,
  eventSchema,
  contentSchema,
  createContentRequestSchema,
  updateContentRequestSchema,
  eventTypeSchema,
  deviceTypeSchema,
  eventMetadataSchema,
  canonicalEventSchema,
  createEventRequestSchema,
  emailFrequencySchema,
  contentTypePreferenceSchema,
  userPreferencesSchema,
  userBehaviorSchema,
  userPrivacySchema,
  userProfileSchema,
  createUserProfileRequestSchema,
  updateUserProfileRequestSchema,
  validate,
  formatValidationErrors,
} from './validation';
