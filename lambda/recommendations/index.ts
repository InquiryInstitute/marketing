/**
 * Recommendation API Lambda
 * Handles recommendation requests
 * Requirements: Req 4.5, 4.7, 4.8 (API endpoint, logging, explanations), Task 11.4
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { rulesLayer, calculateRulesScore } from './rules';
import { generateUserEmbedding, getColdStartFallback } from './user-embedding';
import { mergeRecommendations, applyDiversityConstraint, generateExplanation } from './merge';
import { getRecommendationsFromCache, setRecommendationsInCache } from './cache';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Environment variables
const ENV_NAME = process.env.ENV_NAME || 'dev';

/**
 * Recommendation response
 */
interface RecommendationResponse {
  recommendations: Array<{
    contentId: string;
    score: number;
    source: 'rules' | 'vector' | 'merged';
    explanation: string;
  }>;
  generatedAt: string;
}

/**
 * Get recommendations for a user
 */
async function getRecommendations(userId: string, count: number = 10): Promise<RecommendationResponse> {
  // Check cache first
  const cached = await getRecommendationsFromCache(userId);
  if (cached) {
    return {
      recommendations: cached.slice(0, count).map((rec) => ({
        contentId: rec.contentId,
        score: rec.finalScore,
        source: rec.sources.length > 1 ? 'merged' : rec.sources[0],
        explanation: generateExplanation(rec),
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  // Generate from both layers
  const rulesCandidates = await rulesLayer(userId);
  const userVector = await generateUserEmbedding(userId);

  // For now, use cold start fallback for vector layer
  // In production, you would query OpenSearch k-NN with the user vector
  const vectorCandidates = [];

  // Merge candidates
  const merged = mergeRecommendations(rulesCandidates, vectorCandidates);

  // Apply diversity constraint
  const diverse = applyDiversityConstraint(merged);

  // Take top N
  const recommendations = diverse.slice(0, count);

  // Cache for 5 minutes
  await setRecommendationsInCache(userId, recommendations);

  // Log recommendations for A/B testing
  console.log('Recommendations generated:', {
    userId,
    count: recommendations.length,
    sources: recommendations.map((r) => r.sources),
  });

  return {
    recommendations: recommendations.map((rec) => ({
      contentId: rec.contentId,
      score: rec.finalScore,
      source: rec.sources.length > 1 ? 'merged' : rec.sources[0],
      explanation: generateExplanation(rec),
    })),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Lambda handler for recommendation API
 */
export async function handler(event: APIGatewayEvent): Promise<APIGatewayProxyResult> {
  console.log('Recommendation request:', JSON.stringify(event));

  // Extract userId from path parameter
  const userId = event.pathParameters?.userId;
  if (!userId) {
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/Recommendations`,
        MetricData: [
          {
            MetricName: 'MissingUserId',
            Value: 1,
            Unit: StandardUnit.Count,
            Timestamp: new Date(),
          },
        ],
      })
    );
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
      body: JSON.stringify({
        error: 'ValidationError',
        message: 'userId path parameter is required',
      }),
    };
  }

  // Parse query parameters
  let count = 10;
  if (event.queryStringParameters?.count) {
    count = parseInt(event.queryStringParameters.count, 10);
    if (count < 1 || count > 50) {
      count = 10;
    }
  }

  try {
    // Get recommendations
    const response = await getRecommendations(userId, count);

    // Publish metrics
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/Recommendations`,
        MetricData: [
          {
            MetricName: 'RecommendationsGenerated',
            Value: 1,
            Unit: StandardUnit.Count,
            Timestamp: new Date(),
          },
          {
            MetricName: 'RecommendationsReturned',
            Value: response.recommendations.length,
            Unit: StandardUnit.Count,
            Timestamp: new Date(),
          },
        ],
      })
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error generating recommendations:', error);
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/Recommendations`,
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
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
      body: JSON.stringify({
        error: 'InternalServerError',
        message: 'Failed to generate recommendations',
      }),
    };
  }
}
