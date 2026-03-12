/**
 * Content Service Types
 * Requirements: Req 1 (Content Publishing System)
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
 * Base content interface
 */
export interface BaseContent {
  id: string;
  domain: ContentDomain;
  title: string;
  description: string;
  body: string;
  author: string;
  topics: string[];
  tags: string[];
  state: ContentState;
  publishedAt?: number;
  version: number;
  embedding?: number[];
  aiAssisted?: boolean;
  aiModel?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Article content
 */
export interface Article extends BaseContent {
  domain: 'article';
  readTime?: number;
}

/**
 * Content type (discriminated union)
 */
export type Content = Article;

/**
 * Create content request
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
  readTime?: number;
}

/**
 * Update content request
 */
export interface UpdateContentRequest {
  title?: string;
  description?: string;
  body?: string;
  topics?: string[];
  tags?: string[];
  state?: ContentState;
  readTime?: number;
}

/**
 * Content query parameters
 */
export interface ContentQueryParams {
  domain?: ContentDomain;
  state?: ContentState;
  limit?: number;
  offset?: number;
  lastEvaluatedKey?: string;
}

/**
 * Content list response
 */
export interface ContentListResponse {
  items: Content[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  lastEvaluatedKey?: string;
}

/**
 * Error response
 */
export interface ErrorResponse {
  error: string;
  message: string;
  fields?: Array<{ field: string; message: string }>;
}
