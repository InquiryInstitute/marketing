/**
 * Profile Management Lambda
 * Handles user profile CRUD operations with privacy controls
 * Requirements: Req 7 (User Profile Management), Req 7.8 (Privacy controls), Task 8.1, 8.3
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { UserProfile } from '../shared/types/user';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Environment variables
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || '';
const ENV_NAME = process.env.ENV_NAME || 'dev';

/**
 * Profile request body
 */
interface ProfileRequestBody {
  preferences?: {
    topics?: string[];
    contentTypes?: string[];
    emailFrequency?: 'daily' | 'weekly' | 'never';
  };
  privacy?: {
    trackingConsent?: boolean;
    emailConsent?: boolean;
  };
}

/**
 * Validate profile request body
 */
function validateProfileRequest(body: any): { valid: boolean; errors?: string[] } {
  const errors: string[] = [];

  if (body.preferences) {
    if (body.preferences.topics && !Array.isArray(body.preferences.topics)) {
      errors.push('preferences.topics must be an array');
    }
    if (body.preferences.contentTypes && !Array.isArray(body.preferences.contentTypes)) {
      errors.push('preferences.contentTypes must be an array');
    }
    if (body.preferences.emailFrequency && !['daily', 'weekly', 'never'].includes(body.preferences.emailFrequency)) {
      errors.push('preferences.emailFrequency must be one of: daily, weekly, never');
    }
  }

  if (body.privacy) {
    if (body.privacy.trackingConsent !== undefined && typeof body.privacy.trackingConsent !== 'boolean') {
      errors.push('privacy.trackingConsent must be a boolean');
    }
    if (body.privacy.emailConsent !== undefined && typeof body.privacy.emailConsent !== 'boolean') {
      errors.push('privacy.emailConsent must be a boolean');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if user has opted out of tracking
 */
function isTrackingOptedOut(profile: UserProfile): boolean {
  return !profile.privacy?.trackingConsent || false;
}

/**
 * Check if user has opted out of emails
 */
function isEmailOptedOut(profile: UserProfile): boolean {
  return !profile.privacy?.emailConsent || false;
}

/**
 * Get non-personalized recommendations for opted-out users
 */
function getNonPersonalizedRecommendations(): any[] {
  // Return popular content as fallback for opted-out users
  return [
    {
      contentId: 'popular-1',
      title: 'Popular Article 1',
      explanation: 'Popular this week',
    },
    {
      contentId: 'popular-2',
      title: 'Popular Article 2',
      explanation: 'Popular this week',
    },
  ];
}

/**
 * Get user profile from DynamoDB
 */
async function getProfile(userId: string): Promise<UserProfile | null> {
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: USER_PROFILES_TABLE,
        Key: { userId },
      })
    );

    return result.Item as UserProfile | null;
  } catch (error) {
    console.error('Error getting profile:', error);
    throw error;
  }
}

/**
 * Create or update user profile in DynamoDB
 */
async function upsertProfile(userId: string, updates: Partial<ProfileRequestBody>): Promise<UserProfile> {
  const now = new Date().toISOString();

  // Build update expression
  const updateExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {};

  // Add timestamp
  updateExpressions.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = now;

  // Add preferences if provided
  if (updates.preferences) {
    if (updates.preferences.topics) {
      updateExpressions.push('#topics = :topics');
      expressionAttributeNames['#topics'] = 'preferences.topics';
      expressionAttributeValues[':topics'] = updates.preferences.topics;
    }
    if (updates.preferences.contentTypes) {
      updateExpressions.push('#contentTypes = :contentTypes');
      expressionAttributeNames['#contentTypes'] = 'preferences.contentTypes';
      expressionAttributeValues[':contentTypes'] = updates.preferences.contentTypes;
    }
    if (updates.preferences.emailFrequency) {
      updateExpressions.push('#emailFrequency = :emailFrequency');
      expressionAttributeNames['#emailFrequency'] = 'preferences.emailFrequency';
      expressionAttributeValues[':emailFrequency'] = updates.preferences.emailFrequency;
    }
  }

  // Add privacy settings if provided
  if (updates.privacy) {
    if (updates.privacy.trackingConsent !== undefined) {
      updateExpressions.push('#trackingConsent = :trackingConsent');
      expressionAttributeNames['#trackingConsent'] = 'privacy.trackingConsent';
      expressionAttributeValues[':trackingConsent'] = updates.privacy.trackingConsent;
    }
    if (updates.privacy.emailConsent !== undefined) {
      updateExpressions.push('#emailConsent = :emailConsent');
      expressionAttributeNames['#emailConsent'] = 'privacy.emailConsent';
      expressionAttributeValues[':emailConsent'] = updates.privacy.emailConsent;
    }
  }

  // Default values for new profiles
  const defaultProfile: UserProfile = {
    userId,
    email: '',
    name: '',
    preferences: {
      topics: [],
      contentTypes: ['article'],
      emailFrequency: 'weekly',
    },
    behavior: {
      lastActive: now,
      totalViews: 0,
      totalPurchases: 0,
    },
    privacy: {
      trackingConsent: true,
      emailConsent: true,
    },
    createdAt: now,
    updatedAt: now,
  };

  // Build put command
  const putParams: any = {
    TableName: USER_PROFILES_TABLE,
    Item: defaultProfile,
  };

  // Add update expression if there are updates
  if (updateExpressions.length > 0) {
    putParams.UpdateExpression = `SET ${updateExpressions.join(', ')}`;
    putParams.ExpressionAttributeNames = expressionAttributeNames;
    putParams.ExpressionAttributeValues = expressionAttributeValues;
    putParams.ReturnValues = 'ALL_NEW';
  }

  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: USER_PROFILES_TABLE,
        Key: { userId },
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      })
    );

    return result.Attributes as UserProfile;
  } catch (error) {
    console.error('Error upserting profile:', error);
    throw error;
  }
}

/**
 * Publish CloudWatch metrics
 */
async function publishMetrics(metricName: string, value: number): Promise<void> {
  try {
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/ProfileManagement`,
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
 * Lambda handler for profile management API
 */
export async function handler(event: APIGatewayEvent): Promise<APIGatewayProxyResult> {
  console.log('Profile management request:', JSON.stringify(event));

  // Extract userId from path parameter
  const userId = event.pathParameters?.userId;
  if (!userId) {
    await publishMetrics('MissingUserId', 1);
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

  try {
    // GET: Get profile
    if (event.httpMethod === 'GET') {
      const profile = await getProfile(userId);

      if (!profile) {
        await publishMetrics('ProfileNotFound', 1);
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          },
          body: JSON.stringify({
            error: 'NotFound',
            message: 'Profile not found',
          }),
        };
      }

      // Check privacy controls
      const trackingOptedOut = isTrackingOptedOut(profile);
      const emailOptedOut = isEmailOptedOut(profile);

      // Return profile with privacy flags
      const responseProfile: any = {
        ...profile,
        privacy: {
          trackingConsent: profile.privacy?.trackingConsent ?? true,
          emailConsent: profile.privacy?.emailConsent ?? true,
        },
        trackingOptedOut,
        emailOptedOut,
      };

      await publishMetrics('ProfileRetrieved', 1);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        },
        body: JSON.stringify(responseProfile),
      };
    }

    // PUT: Update profile
    if (event.httpMethod === 'PUT') {
      // Parse request body
      let body: ProfileRequestBody;
      try {
        body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      } catch (error) {
        await publishMetrics('InvalidJSON', 1);
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          },
          body: JSON.stringify({
            error: 'InvalidJSON',
            message: 'Request body must be valid JSON',
          }),
        };
      }

      // Validate request
      const validation = validateProfileRequest(body);
      if (!validation.valid) {
        await publishMetrics('ValidationError', 1);
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          },
          body: JSON.stringify({
            error: 'ValidationError',
            message: 'Invalid profile data',
            errors: validation.errors,
          }),
        };
      }

      // Update profile
      const profile = await upsertProfile(userId, body);

      // Check privacy controls
      const trackingOptedOut = isTrackingOptedOut(profile);
      const emailOptedOut = isEmailOptedOut(profile);

      // Return profile with privacy flags
      const responseProfile: any = {
        ...profile,
        privacy: {
          trackingConsent: profile.privacy?.trackingConsent ?? true,
          emailConsent: profile.privacy?.emailConsent ?? true,
        },
        trackingOptedOut,
        emailOptedOut,
      };

      await publishMetrics('ProfileUpdated', 1);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        },
        body: JSON.stringify(responseProfile),
      };
    }

    // Method not allowed
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
      body: JSON.stringify({
        error: 'MethodNotAllowed',
        message: 'Method not allowed',
      }),
    };
  } catch (error) {
    console.error('Error processing profile request:', error);
    await publishMetrics('RequestErrors', 1);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
      body: JSON.stringify({
        error: 'InternalServerError',
        message: 'Failed to process profile request',
      }),
    };
  }
}
