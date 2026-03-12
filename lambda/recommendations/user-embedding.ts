/**
 * User Embedding Generation Lambda
 * Generates user embedding vector from viewing history
 * Requirements: Req 4 (Vector similarity layer), Task 10.1
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { ScheduledEvent } from 'aws-lambda';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Environment variables
const USER_EVENTS_TABLE = process.env.USER_EVENTS_TABLE || '';
const CONTENT_TABLE = process.env.CONTENT_TABLE || '';
const ENV_NAME = process.env.ENV_NAME || 'dev';
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'amazon.titan-embed-text-v1';
const USER_VECTOR_DIMENSIONS = parseInt(process.env.USER_VECTOR_DIMENSIONS || '1536', 10);

/**
 * Get user's recent viewed content
 */
async function getUserRecentViews(userId: string, limit: number = 10): Promise<string[]> {
  try {
    // Query user-events table for view events
    // This would use a GSI on timestamp
    // For now, we'll return an empty array (placeholder)

    return [];
  } catch (error) {
    console.error('Error getting user recent views:', error);
    throw error;
  }
}

/**
 * Get content embedding from OpenSearch
 */
async function getContentEmbedding(contentId: string): Promise<number[] | null> {
  try {
    // Query OpenSearch for content embedding
    // For now, we'll return null (placeholder)

    return null;
  } catch (error) {
    console.error('Error getting content embedding:', error);
    throw error;
  }
}

/**
 * Calculate average embedding vector
 */
function calculateAverageEmbedding(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    return new Array(USER_VECTOR_DIMENSIONS).fill(0);
  }

  const average = new Array(USER_VECTOR_DIMENSIONS).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < USER_VECTOR_DIMENSIONS; i++) {
      average[i] += embedding[i] || 0;
    }
  }

  // Normalize by number of embeddings
  for (let i = 0; i < USER_VECTOR_DIMENSIONS; i++) {
    average[i] /= embeddings.length;
  }

  return average;
}

/**
 * Generate user embedding from viewing history
 */
export async function generateUserEmbedding(userId: string): Promise<number[]> {
  // Get user's last 10 viewed content items
  const recentViews = await getUserRecentViews(userId, 10);

  if (recentViews.length === 0) {
    // Cold start: return zero vector
    return new Array(USER_VECTOR_DIMENSIONS).fill(0);
  }

  // Get embeddings for viewed content
  const embeddings: number[][] = [];
  for (const contentId of recentViews) {
    const embedding = await getContentEmbedding(contentId);
    if (embedding) {
      embeddings.push(embedding);
    }
  }

  // Calculate average embedding
  const userVector = calculateAverageEmbedding(embeddings);

  return userVector;
}

/**
 * Handle cold-start case (new users with no history)
 */
export function getColdStartFallback(): number[] {
  // Return zero vector for cold start
  return new Array(USER_VECTOR_DIMENSIONS).fill(0);
}

/**
 * Blend with popular content for users with minimal history
 */
export function blendWithPopular(userVector: number[], popularVector: number[], minViews: number = 3): number[] {
  // Gradually increase personalization as user history grows
  // For users with < minViews, blend with popular content
  const views = 1; // Placeholder for actual view count
  const blendFactor = Math.min(views / minViews, 1.0);

  const blended = new Array(USER_VECTOR_DIMENSIONS).fill(0);
  for (let i = 0; i < USER_VECTOR_DIMENSIONS; i++) {
    blended[i] = userVector[i] * blendFactor + popularVector[i] * (1 - blendFactor);
  }

  return blended;
}

/**
 * Lambda handler for user embedding generation
 */
export async function handler(event: ScheduledEvent): Promise<void> {
  console.log('User embedding generation triggered:', JSON.stringify(event));

  try {
    // In a real implementation, you would:
    // 1. Get all users from DynamoDB
    // 2. Generate embeddings for each user
    // 3. Store embeddings in OpenSearch

    // For now, we'll just log that the function was triggered
    console.log('User embedding generation function triggered');

    // Publish metrics
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/UserEmbeddings`,
        MetricData: [
          {
            MetricName: 'GenerationTriggered',
            Value: 1,
            Unit: StandardUnit.Count,
            Timestamp: new Date(),
          },
        ],
      })
    );
  } catch (error) {
    console.error('Error generating user embeddings:', error);
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/UserEmbeddings`,
        MetricData: [
          {
            MetricName: 'GenerationErrors',
            Value: 1,
            Unit: StandardUnit.Count,
            Timestamp: new Date(),
          },
        ],
      })
    );
    throw error;
  }
}
