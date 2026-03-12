/**
 * Profile Caching Layer
 * Handles Redis caching for user profiles
 * Requirements: Req 7.4, 7.5 (Profile caching), Task 8.2
 */

import { Redis } from 'ioredis';
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { UserProfile } from '../shared/types/user';

// Initialize Redis client
let redisClient: Redis | null = null;

// Environment variables
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';
const CACHE_TTL = parseInt(process.env.CACHE_TTL || '600', 10); // 10 minutes default

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
  return `profile:${userId}`;
}

/**
 * Get profile from cache
 */
export async function getProfileFromCache(userId: string): Promise<UserProfile | null> {
  try {
    const client = getRedisClient();
    const key = getCacheKey(userId);

    const cached = await client.get(key);
    if (!cached) {
      await publishMetrics('CacheMiss', 1);
      return null;
    }

    const profile = JSON.parse(cached) as UserProfile;
    await publishMetrics('CacheHit', 1);
    return profile;
  } catch (error) {
    console.error('Error getting profile from cache:', error);
    await publishMetrics('CacheErrors', 1);
    return null;
  }
}

/**
 * Set profile in cache
 */
export async function setProfileInCache(userId: string, profile: UserProfile): Promise<void> {
  try {
    const client = getRedisClient();
    const key = getCacheKey(userId);

    await client.setex(key, CACHE_TTL, JSON.stringify(profile));
    await publishMetrics('CacheSet', 1);
  } catch (error) {
    console.error('Error setting profile in cache:', error);
    await publishMetrics('CacheErrors', 1);
  }
}

/**
 * Delete profile from cache
 */
export async function deleteProfileFromCache(userId: string): Promise<void> {
  try {
    const client = getRedisClient();
    const key = getCacheKey(userId);

    await client.del(key);
    await publishMetrics('CacheDelete', 1);
  } catch (error) {
    console.error('Error deleting profile from cache:', error);
    await publishMetrics('CacheErrors', 1);
  }
}

/**
 * Invalidate all profile caches for a user
 */
export async function invalidateProfileCache(userId: string): Promise<void> {
  await deleteProfileFromCache(userId);
}

/**
 * Write-through cache update
 */
export async function updateProfileWithCache(
  userId: string,
  updates: Partial<UserProfile>
): Promise<UserProfile> {
  // Get current profile from cache or DB
  let currentProfile = await getProfileFromCache(userId);

  if (!currentProfile) {
    // Profile not in cache, fetch from DB (not implemented here)
    throw new Error('Profile not in cache and DB fetch not implemented');
  }

  // Merge updates
  const updatedProfile: UserProfile = {
    ...currentProfile,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  // Update cache
  await setProfileInCache(userId, updatedProfile);

  return updatedProfile;
}

/**
 * Publish CloudWatch metrics
 */
async function publishMetrics(metricName: string, value: number): Promise<void> {
  try {
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${process.env.ENV_NAME || 'dev'}/ProfileCache`,
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
