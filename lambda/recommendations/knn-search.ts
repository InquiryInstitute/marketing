/**
 * k-NN Similarity Search Lambda
 * Performs k-NN search in OpenSearch for similar content
 * Requirements: Req 4 (Vector similarity layer), Task 10.2
 */

import { OpenSearchClient } from '@aws-sdk/client-opensearch';
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';

// Initialize AWS clients
const opensearchClient = new OpenSearchClient({ region: process.env.AWS_REGION || 'us-east-1' });
const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Environment variables
const OPENSEARCH_ENDPOINT = process.env.OPENSEARCH_ENDPOINT || '';
const OPENSEARCH_INDEX = process.env.OPENSEARCH_INDEX || 'content';
const ENV_NAME = process.env.ENV_NAME || 'dev';
const KNN_K = parseInt(process.env.KNN_K || '20', 10);

/**
 * k-NN search parameters
 */
interface KNNSearchParams {
  vector: number[];
  k?: number;
  filter?: any;
}

/**
 * Build k-NN search query
 */
function buildKNNQuery(params: KNNSearchParams): any {
  const query: any = {
    knn: {
      embedding: {
        vector: params.vector,
        k: params.k || KNN_K,
      },
    },
    size: params.k || KNN_K,
    _source: ['contentId', 'title', 'description', 'topics', 'tags'],
  };

  // Add filter if specified
  if (params.filter) {
    query.filter = params.filter;
  }

  return query;
}

/**
 * Parse OpenSearch k-NN response
 */
function parseKNNResponse(response: any): Array<{
  contentId: string;
  score: number; // Cosine similarity
  title: string;
  description: string;
  topics: string[];
  tags: string[];
}> {
  const hits = response.hits?.hits || [];
  return hits.map((hit: any) => ({
    contentId: hit._source.contentId,
    score: hit._score, // Cosine similarity
    title: hit._source.title,
    description: hit._source.description,
    topics: hit._source.topics || [],
    tags: hit._source.tags || [],
  }));
}

/**
 * Lambda handler for k-NN search API
 */
export async function handler(event: APIGatewayEvent): Promise<APIGatewayProxyResult> {
  console.log('k-NN search request:', JSON.stringify(event));

  try {
    // Parse request body
    let body: KNNSearchParams;
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (error) {
      await cloudwatchClient.send(
        new PutMetricDataCommand({
          Namespace: `InquiryGrowth/${ENV_NAME}/KNN`,
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

    // Validate request
    if (!body.vector || !Array.isArray(body.vector) || body.vector.length === 0) {
      await cloudwatchClient.send(
        new PutMetricDataCommand({
          Namespace: `InquiryGrowth/${ENV_NAME}/KNN`,
          MetricData: [
            {
              MetricName: 'ValidationError',
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
          message: 'vector parameter is required',
        }),
      };
    }

    // Build k-NN query
    const knnQuery = buildKNNQuery(body);

    // Execute k-NN search
    const response = await opensearchClient.send({
      command: {
        method: 'GET',
        path: `/${OPENSEARCH_INDEX}/_search`,
        body: JSON.stringify(knnQuery),
      },
    });

    // Parse response
    const results = parseKNNResponse(response);

    // Publish metrics
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/KNN`,
        MetricData: [
          {
            MetricName: 'SearchesExecuted',
            Value: 1,
            Unit: StandardUnit.Count,
            Timestamp: new Date(),
          },
          {
            MetricName: 'ResultsReturned',
            Value: results.length,
            Unit: StandardUnit.Count,
            Timestamp: new Date(),
          },
        ],
      })
    );

    // Build response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
      body: JSON.stringify({
        results,
        took: response.took || 0,
      }),
    };
  } catch (error) {
    console.error('Error executing k-NN search:', error);
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/KNN`,
        MetricData: [
          {
            MetricName: 'SearchErrors',
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
        message: 'Failed to execute k-NN search',
      }),
    };
  }
}
