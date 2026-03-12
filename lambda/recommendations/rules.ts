/**
 * Rules-Based Recommendation Logic
 * Implements rules-based recommendation layer
 * Requirements: Req 4 (Two-Layer Recommendation Engine - Rules), Task 9.1
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { UserProfile } from '../shared/types/user';
import { Content } from '../shared/types/content';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Environment variables
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || '';
const CONTENT_TABLE = process.env.CONTENT_TABLE || '';
const ENV_NAME = process.env.ENV_NAME || 'dev';

/**
 * Recommendation candidate
 */
interface RecommendationCandidate {
  contentId: string;
  score: number;
  reason: string;
  source: 'rules';
}

/**
 * Get user profile from DynamoDB
 */
async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: USER_PROFILES_TABLE,
        Key: { userId },
      })
    );

    return result.Item as UserProfile | null;
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw error;
  }
}

/**
 * Query content by topics
 */
async function queryContentByTopics(topics: string[], limit: number = 20): Promise<Content[]> {
  try {
    // Query content with any of the specified topics
    const results: Content[] = [];

    // In a real implementation, you would use a GSI on topics
    // For now, we'll return an empty array (placeholder)
    // The actual implementation would query DynamoDB with a GSI

    return results;
  } catch (error) {
    console.error('Error querying content by topics:', error);
    throw error;
  }
}

/**
 * Query trending content (high engagement last 7 days)
 */
async function queryTrendingContent(days: number = 7, limit: number = 10): Promise<Content[]> {
  try {
    // Query content with high engagement in the last N days
    // This would query the user-events table to count views per content
    // For now, we'll return an empty array (placeholder)

    return [];
  } catch (error) {
    console.error('Error querying trending content:', error);
    throw error;
  }
}

/**
 * Query recent content (published last 30 days)
 */
async function queryRecentContent(days: number = 30, limit: number = 10): Promise<Content[]> {
  try {
    // Query content published in the last N days
    // This would query the content table with a GSI on publishedAt
    // For now, we'll return an empty array (placeholder)

    return [];
  } catch (error) {
    console.error('Error querying recent content:', error);
    throw error;
  }
}

/**
 * Get user's viewed content
 */
async function getUserViewedContent(userId: string, limit: number = 100): Promise<string[]> {
  try {
    // Query user-events table to get viewed content IDs
    // For now, we'll return an empty array (placeholder)

    return [];
  } catch (error) {
    console.error('Error getting user viewed content:', error);
    throw error;
  }
}

/**
 * Rules-based recommendation layer
 */
export async function rulesLayer(userId: string): Promise<RecommendationCandidate[]> {
  const candidates: RecommendationCandidate[] = [];
  const viewedContent = await getUserViewedContent(userId);

  try {
    // Get user profile
    const profile = await getUserProfile(userId);

    // Rule 1: User's favorite topics
    if (profile?.preferences?.topics?.length > 0) {
      const topicContent = await queryContentByTopics(profile.preferences.topics, 20);

      candidates.push(
        ...topicContent
          .filter((c) => !viewedContent.includes(c.id))
          .map((c) => ({
            contentId: c.id,
            score: 1.0,
            reason: `Matches your interest in ${c.topics?.[0] || 'topic'}`,
            source: 'rules' as const,
          }))
      );
    }

    // Rule 2: Trending content (high engagement last 7 days)
    const trending = await queryTrendingContent(7, 10);
    candidates.push(
      ...trending
        .filter((c) => !viewedContent.includes(c.id))
        .map((c) => ({
          contentId: c.id,
          score: 0.8,
          reason: 'Popular this week',
          source: 'rules' as const,
        }))
    );

    // Rule 3: Recent content (published last 30 days)
    const recent = await queryRecentContent(30, 10);
    candidates.push(
      ...recent
        .filter((c) => !viewedContent.includes(c.id))
        .map((c) => ({
          contentId: c.id,
          score: 0.6,
          reason: 'Recently published',
          source: 'rules' as const,
        }))
    );
  } catch (error) {
    console.error('Error in rules layer:', error);
  }

  return candidates;
}

/**
 * Calculate rules-based score for a candidate
 */
export function calculateRulesScore(candidate: RecommendationCandidate): number {
  // Apply scoring based on candidate properties
  let score = candidate.score;

  // Apply topic preference matching (1.0 score)
  if (candidate.reason.includes('Matches your interest')) {
    score = 1.0;
  }

  // Apply trending boost (0.8 score)
  if (candidate.reason === 'Popular this week') {
    score = 0.8;
  }

  // Apply recency score (0.6 score)
  if (candidate.reason === 'Recently published') {
    score = 0.6;
  }

  return score;
}

/**
 * Publish CloudWatch metrics
 */
async function publishMetrics(metricName: string, value: number): Promise<void> {
  try {
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/Recommendations`,
        MetricData: [
          {
            MetricName: metricName,
            Value: value,
            Unit: StandardUnit.Count,
            Timestamp: new Date(),
          },
        ],
      })
    );
  } catch (error) {
    console.error('Error publishing metrics:', error);
  }
}
