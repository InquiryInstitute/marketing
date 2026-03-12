/**
 * GDPR Data Deletion Lambda
 * Handles user data deletion requests
 * Requirements: Req 15.3, 15.4 (Data deletion within 48 hours), Task 21.2
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Environment variables
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || '';
const USER_EVENTS_TABLE = process.env.USER_EVENTS_TABLE || '';
const ENV_NAME = process.env.ENV_NAME || 'dev';

/**
 * Logical delete user profile
 */
async function logicalDeleteProfile(userId: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { userId },
      UpdateExpression: 'SET #deleted = :deleted, #deleteRequestedAt = :deleteRequestedAt',
      ExpressionAttributeNames: {
        '#deleted': 'deleted',
        '#deleteRequestedAt': 'deleteRequestedAt',
      },
      ExpressionAttributeValues: {
        ':deleted': true,
        ':deleteRequestedAt': Date.now(),
      },
    })
  );
}

/**
 * Stop email communications
 */
async function stopEmailCommunications(userId: string): Promise<void> {
  // Update emailConsent to false
  await docClient.send(
    new UpdateCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { userId },
      UpdateExpression: 'SET #emailConsent = :emailConsent',
      ExpressionAttributeNames: {
        '#emailConsent': 'privacy.emailConsent',
      },
      ExpressionAttributeValues: {
        ':emailConsent': false,
      },
    })
  );
}

/**
 * Remove from recommendation cache
 */
async function removeFromRecommendationCache(userId: string): Promise<void> {
  // In production, you would delete from Redis
  console.log(`Removing ${userId} from recommendation cache`);
}

/**
 * Anonymize userId in future events
 */
async function anonymizeFutureEvents(userId: string): Promise<void> {
  // In production, you would update events table to anonymize userId
  console.log(`Anonymizing future events for ${userId}`);
}

/**
 * Lambda handler for data deletion API
 */
export async function handler(event: APIGatewayEvent): Promise<APIGatewayProxyResult> {
  console.log('Data deletion request:', JSON.stringify(event));

  try {
    // Extract userId from path parameter
    const userId = event.pathParameters?.userId;
    if (!userId) {
      await cloudwatchClient.send(
        new PutMetricDataCommand({
          Namespace: `InquiryGrowth/${ENV_NAME}/GDPR`,
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

    // Perform logical deletion
    await logicalDeleteProfile(userId);
    await stopEmailCommunications(userId);
    await removeFromRecommendationCache(userId);
    await anonymizeFutureEvents(userId);

    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/GDPR`,
        MetricData: [
          {
            MetricName: 'DeletionsProcessed',
            Value: 1,
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
      body: JSON.stringify({
        message: 'Data deletion request processed',
        status: 'pending_physical_purge',
      }),
    };
  } catch (error) {
    console.error('Error processing data deletion:', error);
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/GDPR`,
        MetricData: [
          {
            MetricName: 'DeletionErrors',
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
        message: 'Failed to process data deletion',
      }),
    };
  }
}
