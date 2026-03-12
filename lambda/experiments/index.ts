/**
 * A/B Testing Framework Lambda
 * Handles experiment creation and cohort assignment
 * Requirements: Req 12 (A/B Testing Framework), Task 20.1
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
const EXPERIMENTS_TABLE = process.env.EXPERIMENTS_TABLE || '';
const COHORTS_TABLE = process.env.COHORTS_TABLE || '';
const ENV_NAME = process.env.ENV_NAME || 'dev';

/**
 * Experiment schema
 */
interface Experiment {
  id: string;
  name: string;
  description?: string;
  control: {
    name: string;
    variant: any;
  };
  treatment: {
    name: string;
    variant: any;
  };
  metrics: string[];
  status: 'active' | 'concluded';
  startDate: number;
  endDate?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Cohort assignment
 */
interface CohortAssignment {
  userId: string;
  experimentId: string;
  cohort: 'control' | 'treatment';
  assignedAt: number;
}

/**
 * Create experiment
 */
async function createExperiment(experiment: Omit<Experiment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Experiment> {
  const now = Date.now();
  const experimentWithId = {
    ...experiment,
    id: `exp_${now}_${Math.random().toString(36).substring(2, 15)}`,
    createdAt: now,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: EXPERIMENTS_TABLE,
      Item: experimentWithId,
    })
  );

  return experimentWithId;
}

/**
 * Assign user to cohort (50/50 split)
 */
async function assignToCohort(userId: string, experimentId: string): Promise<'control' | 'treatment'> {
  // Use hash function for consistent assignment
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const cohort = hash % 2 === 0 ? 'control' : 'treatment';

  const assignment: CohortAssignment = {
    userId,
    experimentId,
    cohort,
    assignedAt: Date.now(),
  };

  await docClient.send(
    new PutCommand({
      TableName: COHORTS_TABLE,
      Item: assignment,
    })
  );

  return cohort;
}

/**
 * Get user's cohort for an experiment
 */
async function getUserCohort(userId: string, experimentId: string): Promise<'control' | 'treatment' | null> {
  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: COHORTS_TABLE,
        KeyConditionExpression: 'userId = :userId AND experimentId = :experimentId',
        ExpressionAttributeValues: {
          ':userId': userId,
          ':experimentId': experimentId,
        },
        Limit: 1,
      })
    );

    return (result.Items?.[0] as CohortAssignment)?.cohort || null;
  } catch (error) {
    console.error('Error getting user cohort:', error);
    throw error;
  }
}

/**
 * Lambda handler for A/B testing API
 */
export async function handler(event: APIGatewayEvent): Promise<APIGatewayProxyResult> {
  console.log('A/B testing request:', JSON.stringify(event));

  try {
    // Parse request body
    let body: any;
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (error) {
      await cloudwatchClient.send(
        new PutMetricDataCommand({
          Namespace: `InquiryGrowth/${ENV_NAME}/Experiments`,
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

    // POST /api/experiments - Create experiment
    if (event.httpMethod === 'POST' && !event.pathParameters?.id) {
      const experiment = await createExperiment({
        name: body.name,
        description: body.description,
        control: body.control,
        treatment: body.treatment,
        metrics: body.metrics,
        status: 'active',
        startDate: Date.now(),
      });

      await cloudwatchClient.send(
        new PutMetricDataCommand({
          Namespace: `InquiryGrowth/${ENV_NAME}/Experiments`,
          MetricData: [
            {
              MetricName: 'ExperimentsCreated',
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
        body: JSON.stringify(experiment),
      };
    }

    // GET /api/experiments/:id/results - Get experiment results
    if (event.httpMethod === 'GET' && event.pathParameters?.id) {
      // Query experiment results (placeholder)
      const results = {
        experimentId: event.pathParameters.id,
        control: {
          count: 1000,
          metric: 0.05,
        },
        treatment: {
          count: 1000,
          metric: 0.07,
        },
        statisticalSignificance: 0.03,
      };

      await cloudwatchClient.send(
        new PutMetricDataCommand({
          Namespace: `InquiryGrowth/${ENV_NAME}/Experiments`,
          MetricData: [
            {
              MetricName: 'ResultsRetrieved',
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
        body: JSON.stringify(results),
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
    console.error('Error processing A/B testing:', error);
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/Experiments`,
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
        message: 'Failed to process A/B testing',
      }),
    };
  }
}
