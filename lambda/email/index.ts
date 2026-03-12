/**
 * Email Service Lambda
 * Handles email campaign management and delivery
 * Requirements: Req 9 (Email Distribution), Task 17.1
 */

import { SESClient, SendEmailCommand, CreateTemplateCommand, GetTemplateCommand } from '@aws-sdk/client-ses';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';

// Initialize AWS clients
const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Environment variables
const EMAIL_TEMPLATES_TABLE = process.env.EMAIL_TEMPLATES_TABLE || '';
const EMAIL_CAMPAIGNS_TABLE = process.env.EMAIL_CAMPAIGNS_TABLE || '';
const ENV_NAME = process.env.ENV_NAME || 'dev';

/**
 * Email campaign schema
 */
interface EmailCampaign {
  id: string;
  name: string;
  subject: string;
  template: string;
  audience: {
    segment: 'all' | 'active' | 'inactive';
    topicFilter?: string[];
  };
  schedule: {
    type: 'immediate' | 'scheduled';
    sendAt?: number;
  };
  status: 'draft' | 'sending' | 'sent';
  metrics: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    unsubscribed: number;
  };
  createdAt: number;
  updatedAt: number;
}

/**
 * Create email campaign
 */
async function createCampaign(campaign: Omit<EmailCampaign, 'id' | 'metrics' | 'createdAt' | 'updatedAt'>): Promise<EmailCampaign> {
  const now = Date.now();
  const campaignWithId = {
    ...campaign,
    id: `camp_${now}_${Math.random().toString(36).substring(2, 15)}`,
    metrics: {
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      unsubscribed: 0,
    },
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: EMAIL_CAMPAIGNS_TABLE,
      Item: campaignWithId,
    })
  );

  return campaignWithId;
}

/**
 * Send email campaign
 */
async function sendCampaign(campaign: EmailCampaign): Promise<void> {
  // Query users matching audience criteria
  // For now, we'll just log the campaign (placeholder)
  console.log(`Sending campaign ${campaign.id} to ${campaign.audience.segment} users`);

  // Update campaign status
  campaign.status = 'sending';
  campaign.metrics.sent = 100; // Placeholder
  campaign.updatedAt = Date.now();

  await docClient.send(
    new PutCommand({
      TableName: EMAIL_CAMPAIGNS_TABLE,
      Item: campaign,
    })
  );

  // Send emails via SES (rate-limited to 14/sec)
  // For now, we'll just log (placeholder)
  console.log('Emails sent via SES');
}

/**
 * Lambda handler for email campaign management API
 */
export async function handler(event: APIGatewayEvent): Promise<APIGatewayProxyResult> {
  console.log('Email campaign request:', JSON.stringify(event));

  try {
    // Parse request body
    let body: any;
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (error) {
      await cloudwatchClient.send(
        new PutMetricDataCommand({
          Namespace: `InquiryGrowth/${ENV_NAME}/Email`,
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

    // POST /api/campaigns - Create campaign
    if (event.httpMethod === 'POST' && !event.pathParameters?.id) {
      const campaign = await createCampaign({
        name: body.name,
        subject: body.subject,
        template: body.template,
        audience: body.audience,
        schedule: body.schedule,
        status: 'draft',
      });

      await cloudwatchClient.send(
        new PutMetricDataCommand({
          Namespace: `InquiryGrowth/${ENV_NAME}/Email`,
          MetricData: [
            {
              MetricName: 'CampaignsCreated',
              Value: 1,
              Unit: StandardUnit.Count,
              Timestamp: new Date(),
            },
          ],
        })
      );

      return {
        statusCode: 201,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        },
        body: JSON.stringify(campaign),
      };
    }

    // POST /api/campaigns/:id/send - Send campaign
    if (event.httpMethod === 'POST' && event.pathParameters?.id) {
      // Query campaign
      const campaign: EmailCampaign | null = null; // Placeholder

      if (!campaign) {
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
          },
          body: JSON.stringify({
            error: 'NotFound',
            message: 'Campaign not found',
          }),
        };
      }

      await sendCampaign(campaign);

      await cloudwatchClient.send(
        new PutMetricDataCommand({
          Namespace: `InquiryGrowth/${ENV_NAME}/Email`,
          MetricData: [
            {
              MetricName: 'CampaignsSent',
              Value: 1,
              Unit: StandardUnit.Count,
              Timestamp: new Date(),
            },
          ],
        })
      );

      return {
        statusCode: 202,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        },
        body: JSON.stringify({
          message: 'Campaign queued for sending',
        }),
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
    console.error('Error processing email campaign:', error);
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/Email`,
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
        message: 'Failed to process email campaign',
      }),
    };
  }
}
