/**
 * Recommendation Caching Layer
 * Handles Redis caching for recommendations
 * Requirements: Req 4.6 (Cache recommendations with 5-minute TTL), Task 11.3
 */

import { Redis } from 'ioredis';
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { MergedRecommendation } from './merge';

// Initialize Redis client
let redisClient: Redis | null = null;

// Environment variables
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';
const CACHE_TTL = parseInt(process.env.CACHE_TTL || '300', 10); // 5 minutes default

// Initialize CloudWatch client
const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });

/**
 * Get Redis client (singleton)
 */
function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      lazyConnect: true,
    });

    // Handle connection errors
    redisClient.on('error', (err) => console.error('Redis error:', err));
    redisClient.on('connect', () => console.log('Redis connected'));
  }
  return redisClient;
}

/**
 * Cache key pattern
 */
function getCacheKey(userId: string): string {
  return `reco:${userId}`;
}

/**
 * Get recommendations from cache
 */
export async function getRecommendationsFromCache(userId: string): Promise<MergedRecommendation[] | null> {
  try {
    const client = getRedisClient();
    const key = getCacheKey(userId);

    const cached = await client.get(key);
    if (!cached) {
      await publishMetrics('CacheMiss', 1);
      return null;
    }

    const recommendations = JSON.parse(cached) as MergedRecommendation[];
    await publishMetrics('CacheHit', 1);
    return recommendations;
  } catch (error) {
    console.error('Error getting recommendations from cache:', error);
    await publishMetrics('CacheErrors', 1);
    return null;
  }
}

/**
 * Set recommendations in cache
 */
export async function setRecommendationsInCache(userId: string, recommendations: MergedRecommendation[]): Promise<void> {
  try {
    const client = getRedisClient();
    const key = getCacheKey(userId);

    await client.setex(key, CACHE_TTL, JSON.stringify(recommendations));
    await publishMetrics('CacheSet', 1);
  } catch (error) {
    console.error('Error setting recommendations in cache:', error);
    await publishMetrics('CacheErrors', 1);
  }
}

/**
 * Delete recommendations from cache
 */
export async function deleteRecommendationsFromCache(userId: string): Promise<void> {
  try {
    const client = getRedisClient();
    const key = getCacheKey(userId);

    await client.del(key);
    await publishMetrics('CacheDelete', 1);
  } catch (error) {
    console.error('Error deleting recommendations from cache:', error);
    await publishMetrics('CacheErrors', 1);
  }
}

/**
 * Invalidate cache for a user
 */
export async function invalidateRecommendationCache(userId: string): Promise<void> {
  await deleteRecommendationsFromCache(userId);
}

/**
 * Cache warming for active users
 */
export async function warmCache(userId: string, recommendations: MergedRecommendation[]): Promise<void> {
  // Warm cache for active users
  await setRecommendationsInCache(userId, recommendations);
}

/**
 * Publish CloudWatch metrics
 */
async function publishMetrics(metricName: string, value: number): Promise<void> {
  try {
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${process.env.ENV_NAME || 'dev'}/RecommendationCache`,
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

/**
 * Initialize Redis connection
 */
export async function initializeCache(): Promise<void> {
  const client = getRedisClient();
  await client.connect();
}

/**
 * Close Redis connection
 */
export async function closeCache(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
