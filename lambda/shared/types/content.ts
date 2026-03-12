/**
 * Content Types
 * Shared types for content across all domains (article, course, product, event)
 * Requirements: Req 1 (Content Publishing), Req 16 (Multi-Domain Content)
 */

/**
 * Content domain types
 */
export type ContentDomain = 'article' | 'course' | 'product' | 'event';

/**
 * Content state types
 */
export type ContentState = 'draft' | 'published' | 'archived';

/**
 * Base content interface shared across all domains
 */
export interface BaseContent {
  id: string;                    // UUID
  domain: ContentDomain;
  title: string;
  description: string;
  body: string;                  // Markdown
  author: string;                // User ID
  topics: string[];              // e.g., ["philosophy", "ethics"]
  tags: string[];                // e.g., ["featured", "beginner"]
  state: ContentState;
  publishedAt?: number;          // Unix timestamp
  version: number;               // Increments on update
  embedding?: number[];          // 1536-dim vector (Titan)
  aiAssisted?: boolean;          // Flag for AI-generated content
  aiModel?: string;              // Model name if AI-assisted
  createdAt: number;             // Unix timestamp
  updatedAt: number;             // Unix timestamp
}

/**
 * Article content (Phase 1)
 */
export interface Article extends BaseContent {
  domain: 'article';
  readTime?: number;             // Estimated read time in minutes
}

/**
 * Course content (Phase 2)
 */
export interface Course extends BaseContent {
  domain: 'course';
  lessons: Array<{
    title: string;
    duration: number;            // Duration in minutes
  }>;
  totalDuration: number;         // Total duration in minutes
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  price?: number;                // Price in cents (e.g., 2999 = $29.99)
}

/**
 * Product content (Phase 2)
 */
export interface Product extends BaseContent {
  domain: 'product';
  price: number;                 // Price in cents
  inventory: number;             // Available quantity
  shippingRequired: boolean;
}

/**
 * Event content (Phase 2)
 */
export interface Event extends BaseContent {
  domain: 'event';
  eventDate: number;             // Unix timestamp
  location: string;              // Physical or virtual location
  capacity: number;              // Maximum attendees
  registrationUrl: string;       // URL for registration
}

/**
 * Union type for all content types
 */
export type Content = Article | Course | Product | Event;

/**
 * Content creation request (without system-generated fields)
 */
export interface CreateContentRequest {
  domain: ContentDomain;
  title: string;
  description: string;
  body: string;
  author: string;
  topics: string[];
  tags?: string[];
  state?: ContentState;
  // Domain-specific fields
  readTime?: number;             // Article
  lessons?: Course['lessons'];   // Course
  totalDuration?: number;        // Course
  difficulty?: Course['difficulty']; // Course
  price?: number;                // Course, Product
  inventory?: number;            // Product
  shippingRequired?: boolean;    // Product
  eventDate?: number;            // Event
  location?: string;             // Event
  capacity?: number;             // Event
  registrationUrl?: string;      // Event
}

/**
 * Content update request (partial update)
 */
export interface UpdateContentRequest {
  title?: string;
  description?: string;
  body?: string;
  topics?: string[];
  tags?: string[];
  state?: ContentState;
  // Domain-specific fields
  readTime?: number;
  lessons?: Course['lessons'];
  totalDuration?: number;
  difficulty?: Course['difficulty'];
  price?: number;
  inventory?: number;
  shippingRequired?: boolean;
  eventDate?: number;
  location?: string;
  capacity?: number;
  registrationUrl?: string;
}

/**
 * Content query parameters
 */
export interface ContentQueryParams {
  domain?: ContentDomain;
  state?: ContentState;
  limit?: number;
  offset?: number;
  topics?: string[];
}
