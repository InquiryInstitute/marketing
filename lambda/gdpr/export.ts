/**
 * GDPR Data Export Lambda
 * Handles user data export requests
 * Requirements: Req 15.1, 15.2 (Data export in JSON within 48 hours), Task 21.1
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Environment variables
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || '';
const USER_EVENTS_TABLE = process.env.USER_EVENTS_TABLE || '';
const EMAIL_CAMPAIGNS_TABLE = process.env.EMAIL_CAMPAIGNS_TABLE || '';
const EXPORT_BUCKET = process.env.EXPORT_BUCKET || '';
const ENV_NAME = process.env.ENV_NAME || 'dev';

/**
 * Export user data
 */
async function exportUserData(userId: string): Promise<any> {
  const data: any = {
    userId,
    exportedAt: new Date().toISOString(),
  };

  // Get user profile
  const profileResult = await docClient.send(
    new GetCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { userId },
    })
  );
  data.profile = profileResult.Item || null;

  // Get user events
  const eventsResult = await docClient.send(
    new QueryCommand({
      TableName: USER_EVENTS_TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    })
  );
  data.events = eventsResult.Items || [];

  // Get email campaign history
  const campaignsResult = await docClient.send(
    new QueryCommand({
      TableName: EMAIL_CAMPAIGNS_TABLE,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    })
  );
  data.emailCampaigns = campaignsResult.Items || [];

  return data;
}

/**
 * Upload export to S3
 */
async function uploadExportToS3(userId: string, data: any): Promise<string> {
  const key = `exports/${userId}/${Date.now()}.json`;
  const body = JSON.stringify(data, null, 2);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: EXPORT_BUCKET,
      Key: key,
      Body: body,
      ContentType: 'application/json',
    })
  );

  // Generate presigned URL (48-hour expiration)
  const url = await s3Client.getSignedUrl(
    'getObject',
    {
      Bucket: EXPORT_BUCKET,
      Key: key,
      Expires: 48 * 60 * 60, // 48 hours
    }
  );

  return url;
}

/**
 * Lambda handler for data export API
 */
export async function handler(event: APIGatewayEvent): Promise<APIGatewayProxyResult> {
  console.log('Data export request:', JSON.stringify(event));

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

    // Export user data
    const data = await exportUserData(userId);

    // Upload to S3
    const url = await uploadExportToS3(userId, data);

    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/GDPR`,
        MetricData: [
          {
            MetricName: 'ExportsGenerated',
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
        message: 'Data export generated',
        presignedUrl: url,
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      }),
    };
  } catch (error) {
    console.error('Error exporting user data:', error);
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/GDPR`,
        MetricData: [
          {
            MetricName: 'ExportErrors',
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
        message: 'Failed to export user data',
      }),
    };
  }
}
