/**
 * Embedding Generation Lambda
 * Requirements: Req 5 (Content Embedding Generation)
 * 
 * This Lambda function generates embeddings using AWS Bedrock Titan Embeddings V2
 * when content is published (state = 'published').
 * 
 * Features:
 * - Generates 1536-dimensional embeddings from content (title + body)
 * - Implements exponential backoff for Bedrock API calls
 * - Logs CloudWatch metrics for embedding generation time
 * - Handles rate limiting and retries
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import {
  ContentForEmbedding,
  TitanEmbeddingRequest,
  TitanEmbeddingResponse,
  EmbeddingGenerationResult,
} from './types';

// Environment variables
const BEDROCK_REGION = process.env.BEDROCK_REGION || 'us-east-1';
const CONTENT_TABLE = process.env.CONTENT_TABLE!;
const ENV_NAME = process.env.ENV_NAME || 'dev';
const INDEXING_LAMBDA_ARN = process.env.INDEXING_LAMBDA_ARN;

// Constants
const TITAN_MODEL_ID = 'amazon.titan-embed-text-v2:0';
const EMBEDDING_DIMENSION = 1536;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const MAX_TEXT_LENGTH = 8000; // Titan V2 supports up to 8K tokens

// AWS clients
const bedrockClient = new BedrockRuntimeClient({ region: BEDROCK_REGION });
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cloudwatchClient = new CloudWatchClient({});
const lambdaClient = new LambdaClient({});

/**
 * Extract text from content for embedding generation
 * Concatenates title + description + first 500 words of body
 */
function extractTextForEmbedding(content: ContentForEmbedding): string {
  const { title, description, body } = content;
  
  // Extract first 500 words from body
  const words = body.split(/\s+/);
  const bodyExcerpt = words.slice(0, 500).join(' ');
  
  // Concatenate with newlines
  const fullText = `${title}\n\n${description}\n\n${bodyExcerpt}`;
  
  // Truncate if too long (safety check)
  if (fullText.length > MAX_TEXT_LENGTH) {
    return fullText.substring(0, MAX_TEXT_LENGTH);
  }
  
  return fullText;
}

/**
 * Generate embedding using Bedrock Titan Embeddings V2
 * Implements exponential backoff for retries
 */
async function generateEmbedding(
  text: string,
  retryCount = 0
): Promise<number[]> {
  try {
    const requestBody: TitanEmbeddingRequest = {
      inputText: text,
      dimensions: EMBEDDING_DIMENSION,
      normalize: true,
    };

    const command = new InvokeModelCommand({
      modelId: TITAN_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(
      new TextDecoder().decode(response.body)
    ) as TitanEmbeddingResponse;

    return responseBody.embedding;
  } catch (error: any) {
    console.error(`Bedrock API error (attempt ${retryCount + 1}):`, error);

    // Check if we should retry
    if (retryCount < MAX_RETRIES) {
      // Exponential backoff: 1s, 2s, 4s
      const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, retryCount);
      console.log(`Retrying after ${backoffMs}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      return generateEmbedding(text, retryCount + 1);
    }

    // Max retries exceeded
    throw new Error(
      `Failed to generate embedding after ${MAX_RETRIES} retries: ${error.message}`
    );
  }
}

/**
 * Fetch content from DynamoDB
 */
async function getContent(contentId: string): Promise<ContentForEmbedding | null> {
  try {
    const command = new GetCommand({
      TableName: CONTENT_TABLE,
      Key: { id: contentId },
    });

    const response = await dynamoClient.send(command);
    
    if (!response.Item) {
      console.warn(`Content not found: ${contentId}`);
      return null;
    }

    return response.Item as ContentForEmbedding;
  } catch (error: any) {
    console.error(`Error fetching content ${contentId}:`, error);
    throw error;
  }
}

/**
 * Update content with embedding in DynamoDB
 */
async function updateContentWithEmbedding(
  contentId: string,
  embedding: number[]
): Promise<void> {
  try {
    const command = new UpdateCommand({
      TableName: CONTENT_TABLE,
      Key: { id: contentId },
      UpdateExpression: 'SET embedding = :embedding, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':embedding': embedding,
        ':updatedAt': Date.now(),
      },
    });

    await dynamoClient.send(command);
    console.log(`Updated content ${contentId} with embedding`);
  } catch (error: any) {
    console.error(`Error updating content ${contentId}:`, error);
    throw error;
  }
}

/**
 * Log CloudWatch metrics for embedding generation
 */
async function logMetrics(
  contentId: string,
  generationTime: number,
  success: boolean,
  retryCount: number
): Promise<void> {
  try {
    const command = new PutMetricDataCommand({
      Namespace: `InquiryGrowth/${ENV_NAME}`,
      MetricData: [
        {
          MetricName: 'EmbeddingGenerationTime',
          Value: generationTime,
          Unit: 'Milliseconds',
          Dimensions: [
            { Name: 'Environment', Value: ENV_NAME },
            { Name: 'Service', Value: 'Embeddings' },
          ],
        },
        {
          MetricName: 'EmbeddingGenerationSuccess',
          Value: success ? 1 : 0,
          Unit: 'Count',
          Dimensions: [
            { Name: 'Environment', Value: ENV_NAME },
            { Name: 'Service', Value: 'Embeddings' },
          ],
        },
        {
          MetricName: 'EmbeddingRetryCount',
          Value: retryCount,
          Unit: 'Count',
          Dimensions: [
            { Name: 'Environment', Value: ENV_NAME },
            { Name: 'Service', Value: 'Embeddings' },
          ],
        },
      ],
    });

    await cloudwatchClient.send(command);
  } catch (error: any) {
    // Don't fail the function if metrics logging fails
    console.error('Error logging metrics:', error);
  }
}

/**
 * Trigger OpenSearch indexing Lambda
 */
async function triggerIndexing(contentId: string, embedding: number[]): Promise<void> {
  // Skip if indexing Lambda ARN is not configured
  if (!INDEXING_LAMBDA_ARN) {
    console.log('Indexing Lambda ARN not configured - skipping indexing trigger');
    return;
  }

  try {
    const command = new InvokeCommand({
      FunctionName: INDEXING_LAMBDA_ARN,
      InvocationType: 'Event', // Async invocation
      Payload: JSON.stringify({
        contentId,
        embedding,
      }),
    });

    await lambdaClient.send(command);
    console.log(`Triggered indexing Lambda for content ${contentId}`);
  } catch (error: any) {
    // Don't fail embedding generation if indexing trigger fails
    console.error('Error triggering indexing Lambda:', error);
  }
}

/**
 * Process a single content item for embedding generation
 */
export async function processContent(
  contentId: string
): Promise<EmbeddingGenerationResult> {
  const startTime = Date.now();
  let retryCount = 0;

  try {
    console.log(`Processing content ${contentId} for embedding generation`);

    // Fetch content from DynamoDB
    const content = await getContent(contentId);
    
    if (!content) {
      return {
        success: false,
        contentId,
        error: 'Content not found',
      };
    }

    // Only generate embeddings for published content
    if (content.state !== 'published') {
      console.log(`Skipping content ${contentId} - not published (state: ${content.state})`);
      return {
        success: false,
        contentId,
        error: 'Content not published',
      };
    }

    // Extract text for embedding
    const text = extractTextForEmbedding(content);
    console.log(`Extracted ${text.length} characters for embedding`);

    // Generate embedding with retries
    const embedding = await generateEmbedding(text);
    console.log(`Generated embedding with ${embedding.length} dimensions`);

    // Update content in DynamoDB
    await updateContentWithEmbedding(contentId, embedding);

    // Trigger OpenSearch indexing
    await triggerIndexing(contentId, embedding);

    // Calculate generation time
    const generationTime = Date.now() - startTime;

    // Log metrics
    await logMetrics(contentId, generationTime, true, retryCount);

    console.log(`Successfully generated embedding for ${contentId} in ${generationTime}ms`);

    return {
      success: true,
      contentId,
      embedding,
      retryCount,
    };
  } catch (error: any) {
    const generationTime = Date.now() - startTime;
    
    console.error(`Failed to generate embedding for ${contentId}:`, error);
    
    // Log failure metrics
    await logMetrics(contentId, generationTime, false, retryCount);

    return {
      success: false,
      contentId,
      error: error.message,
      retryCount,
    };
  }
}

/**
 * Lambda handler
 * Can be triggered by:
 * - DynamoDB Stream (when content is published)
 * - Direct invocation (for batch processing)
 * - EventBridge (scheduled batch processing)
 */
export async function handler(event: any): Promise<any> {
  console.log('Embedding generation Lambda invoked:', JSON.stringify(event));

  try {
    // Handle DynamoDB Stream events
    if (event.Records && event.Records[0]?.eventSource === 'aws:dynamodb') {
      const results: EmbeddingGenerationResult[] = [];

      for (const record of event.Records) {
        // Only process INSERT and MODIFY events
        if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
          const newImage = record.dynamodb?.NewImage;
          
          if (newImage && newImage.id && newImage.state?.S === 'published') {
            const contentId = newImage.id.S;
            const result = await processContent(contentId);
            results.push(result);
          }
        }
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Processed DynamoDB stream events',
          results,
        }),
      };
    }

    // Handle direct invocation with contentId
    if (event.contentId) {
      const result = await processContent(event.contentId);
      
      return {
        statusCode: result.success ? 200 : 500,
        body: JSON.stringify(result),
      };
    }

    // Handle batch processing
    if (event.contentIds && Array.isArray(event.contentIds)) {
      const results: EmbeddingGenerationResult[] = [];

      for (const contentId of event.contentIds) {
        const result = await processContent(contentId);
        results.push(result);
      }

      const successCount = results.filter(r => r.success).length;

      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Batch processing complete',
          total: results.length,
          successful: successCount,
          failed: results.length - successCount,
          results,
        }),
      };
    }

    // Unknown event format
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Invalid event format',
        message: 'Expected contentId, contentIds array, or DynamoDB stream event',
      }),
    };
  } catch (error: any) {
    console.error('Lambda handler error:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
      }),
    };
  }
}
