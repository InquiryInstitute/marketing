/**
 * Content Versioning Lambda
 * Handles content version tracking and history
 * Requirements: Req 10 (Content Versioning), Task 18.1
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Environment variables
const CONTENT_VERSIONS_TABLE = process.env.CONTENT_VERSIONS_TABLE || '';
const ENV_NAME = process.env.ENV_NAME || 'dev';

/**
 * Content version
 */
interface ContentVersion {
  id: string;
  contentId: string;
  version: number;
  content: any;
  author: string;
  timestamp: number;
  changeDescription?: string;
}

/**
 * Create content version
 */
async function createVersion(
  contentId: string,
  version: number,
  content: any,
  author: string,
  changeDescription?: string
): Promise<ContentVersion> {
  const now = Date.now();
  const versionId = `ver_${contentId}_${version}_${now}`;

  const versionRecord: ContentVersion = {
    id: versionId,
    contentId,
    version,
    content,
    author,
    timestamp: now,
    changeDescription,
  };

  await docClient.send(
    new PutCommand({
      TableName: CONTENT_VERSIONS_TABLE,
      Item: versionRecord,
    })
  );

  return versionRecord;
}

/**
 * Get content version history
 */
async function getVersionHistory(contentId: string, limit: number = 10): Promise<ContentVersion[]> {
  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: CONTENT_VERSIONS_TABLE,
        KeyConditionExpression: 'contentId = :contentId',
        ExpressionAttributeValues: {
          ':contentId': contentId,
        },
        ScanIndexForward: false, // Descending order (newest first)
        Limit: limit,
      })
    );

    return (result.Items || []) as ContentVersion[];
  } catch (error) {
    console.error('Error getting version history:', error);
    throw error;
  }
}

/**
 * Compare two versions
 */
function compareVersions(version1: ContentVersion, version2: ContentVersion): {
  diff: string;
  changes: string[];
} {
  // Simple diff (placeholder)
  // In production, you would use a diff library like diff-match-patch
  const changes: string[] = [];

  if (version1.content.title !== version2.content.title) {
    changes.push(`Title changed: "${version1.content.title}" -> "${version2.content.title}"`);
  }

  if (version1.content.description !== version2.content.description) {
    changes.push(`Description changed`);
  }

  if (version1.content.body !== version2.content.body) {
    changes.push(`Body changed`);
  }

  return {
    diff: changes.join('\n'),
    changes,
  };
}

/**
 * Revert to previous version
 */
async function revertToVersion(
  contentId: string,
  targetVersion: number,
  author: string
): Promise<ContentVersion> {
  // Get target version
  const target = await getVersionHistory(contentId, 100);
  const version = target.find((v) => v.version === targetVersion);

  if (!version) {
    throw new Error('Version not found');
  }

  // Create new version with content from target version
  return createVersion(
    contentId,
    version.version + 1,
    version.content,
    author,
    `Reverted to version ${targetVersion}`
  );
}

/**
 * Lambda handler for content versioning API
 */
export async function handler(event: APIGatewayEvent): Promise<APIGatewayProxyResult> {
  console.log('Content versioning request:', JSON.stringify(event));

  try {
    // Extract contentId from path parameter
    const contentId = event.pathParameters?.id;
    if (!contentId) {
      await cloudwatchClient.send(
        new PutMetricDataCommand({
          Namespace: `InquiryGrowth/${ENV_NAME}/Versioning`,
          MetricData: [
            {
              MetricName: 'MissingContentId',
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
          message: 'id path parameter is required',
        }),
      };
    }

    // GET /api/content/:id/versions - Get version history
    if (event.httpMethod === 'GET' && event.pathParameters?.id && !event.pathParameters?.versionId) {
      const limit = event.queryStringParameters?.limit
        ? parseInt(event.queryStringParameters.limit, 10)
        : 10;

      const versions = await getVersionHistory(contentId, limit);

      await cloudwatchClient.send(
        new PutMetricDataCommand({
          Namespace: `InquiryGrowth/${ENV_NAME}/Versioning`,
          MetricData: [
            {
              MetricName: 'VersionHistoryRetrieved',
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
          contentId,
          versions,
        }),
      };
    }

    // POST /api/content/:id/revert - Revert to previous version
    if (event.httpMethod === 'POST' && event.pathParameters?.id && !event.pathParameters?.versionId) {
      // Parse request body
      let body: { targetVersion: number; author: string };
      try {
        body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      } catch (error) {
        await cloudwatchClient.send(
          new PutMetricDataCommand({
            Namespace: `InquiryGrowth/${ENV_NAME}/Versioning`,
            MetricData: [
              {
                MetricName: 'InvalidJSON',
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
            error: 'InvalidJSON',
            message: 'Request body must be valid JSON',
          }),
        };
      }

      const newVersion = await revertToVersion(
        contentId,
        body.targetVersion,
        body.author
      );

      await cloudwatchClient.send(
        new PutMetricDataCommand({
          Namespace: `InquiryGrowth/${ENV_NAME}/Versioning`,
          MetricData: [
            {
              MetricName: 'VersionsReverted',
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
        body: JSON.stringify(newVersion),
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
    console.error('Error processing content versioning:', error);
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/Versioning`,
        MetricData: [
          {
            MetricName: 'RequestErrors',
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
        message: 'Failed to process content versioning',
      }),
    };
  }
}
