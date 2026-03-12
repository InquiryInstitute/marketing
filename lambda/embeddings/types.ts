/**
 * Embedding Service Types
 * Requirements: Req 5 (Content Embedding Generation)
 */

/**
 * Content object for embedding generation
 */
export interface ContentForEmbedding {
  id: string;
  title: string;
  description: string;
  body: string;
  domain: string;
  state: string;
}

/**
 * Embedding generation request
 */
export interface EmbeddingRequest {
  contentId: string;
  text: string;
}

/**
 * Embedding generation response
 */
export interface EmbeddingResponse {
  contentId: string;
  embedding: number[];
  dimension: number;
  model: string;
  generationTime: number;
}

/**
 * Bedrock Titan Embeddings V2 request body
 */
export interface TitanEmbeddingRequest {
  inputText: string;
  dimensions?: number;
  normalize?: boolean;
}

/**
 * Bedrock Titan Embeddings V2 response body
 */
export interface TitanEmbeddingResponse {
  embedding: number[];
  inputTextTokenCount: number;
}

/**
 * Embedding generation result
 */
export interface EmbeddingGenerationResult {
  success: boolean;
  contentId: string;
  embedding?: number[];
  error?: string;
  retryCount?: number;
}

/**
 * CloudWatch metrics data
 */
export interface EmbeddingMetrics {
  contentId: string;
  generationTime: number;
  tokenCount: number;
  success: boolean;
  retryCount: number;
}
