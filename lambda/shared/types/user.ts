/**
 * User Profile Types
 * Shared types for user profiles and preferences
 * Requirements: Req 7 (User Profile Management)
 */

/**
 * Email frequency preferences
 */
export type EmailFrequency = 'daily' | 'weekly' | 'never';

/**
 * Content type preferences
 */
export type ContentTypePreference = 'article' | 'course' | 'product' | 'event';

/**
 * User preferences
 */
export interface UserPreferences {
  topics: string[];              // e.g., ["philosophy", "science"]
  contentTypes: ContentTypePreference[];
  emailFrequency: EmailFrequency;
}

/**
 * User behavioral metrics
 */
export interface UserBehavior {
  lastActive: number;            // Unix timestamp
  totalViews: number;
  totalPurchases: number;
}

/**
 * User privacy settings
 */
export interface UserPrivacy {
  trackingConsent: boolean;
  emailConsent: boolean;
}

/**
 * Complete user profile
 */
export interface UserProfile {
  userId: string;                // Cognito user ID (Partition key)
  email: string;
  name: string;
  preferences: UserPreferences;
  behavior: UserBehavior;
  privacy: UserPrivacy;
  createdAt: number;             // Unix timestamp
  updatedAt: number;             // Unix timestamp
}

/**
 * User profile creation request
 */
export interface CreateUserProfileRequest {
  userId: string;
  email: string;
  name: string;
  preferences?: Partial<UserPreferences>;
  privacy?: Partial<UserPrivacy>;
}

/**
 * User profile update request (partial update)
 */
export interface UpdateUserProfileRequest {
  name?: string;
  preferences?: Partial<UserPreferences>;
  privacy?: Partial<UserPrivacy>;
}

/**
 * User profile query result
 */
export interface UserProfileQueryResult {
  profile: UserProfile;
  cacheHit: boolean;
}
