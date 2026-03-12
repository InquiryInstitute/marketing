/**
 * Search Query Lambda
 * Handles search queries against OpenSearch
 * Requirements: Req 3 (Content Search), Task 7.2, 7.3
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

/**
 * Search query parameters
 */
interface SearchQuery {
  q: string;
  limit?: number;
  offset?: number;
  domain?: string;
  state?: string;
  topics?: string[];
  sortBy?: 'relevance' | 'date';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Parse query parameters from API Gateway event
 */
function parseQueryParams(event: APIGatewayEvent): SearchQuery {
  const params: SearchQuery = { q: '' };

  if (event.queryStringParameters) {
    params.q = event.queryStringParameters.q || '';
    if (event.queryStringParameters.limit) {
      params.limit = parseInt(event.queryStringParameters.limit, 10);
    }
    if (event.queryStringParameters.offset) {
      params.offset = parseInt(event.queryStringParameters.offset, 10);
    }
    if (event.queryStringParameters.domain) {
      params.domain = event.queryStringParameters.domain;
    }
    if (event.queryStringParameters.state) {
      params.state = event.queryStringParameters.state;
    }
    if (event.queryStringParameters.topics) {
      params.topics = event.queryStringParameters.topics.split(',');
    }
    if (event.queryStringParameters.sortBy) {
      params.sortBy = event.queryStringParameters.sortBy as 'relevance' | 'date';
    }
    if (event.queryStringParameters.sortOrder) {
      params.sortOrder = event.queryStringParameters.sortOrder as 'asc' | 'desc';
    }
  }

  // Set defaults
  params.limit = params.limit || 20;
  params.offset = params.offset || 0;
  params.sortBy = params.sortBy || 'relevance';
  params.sortOrder = params.sortOrder || 'desc';

  return params;
}

/**
 * Validate query parameters
 */
function validateQueryParams(params: SearchQuery): { valid: boolean; error?: string } {
  if (!params.q || params.q.trim().length === 0) {
    return { valid: false, error: 'q (query) parameter is required' };
  }

  if (params.limit && (params.limit < 1 || params.limit > 100)) {
    return { valid: false, error: 'limit must be between 1 and 100' };
  }

  if (params.offset && params.offset < 0) {
    return { valid: false, error: 'offset must be non-negative' };
  }

  if (params.state && !['draft', 'published', 'archived'].includes(params.state)) {
    return { valid: false, error: 'state must be one of: draft, published, archived' };
  }

  if (params.sortBy && !['relevance', 'date'].includes(params.sortBy)) {
    return { valid: false, error: 'sortBy must be one of: relevance, date' };
  }

  if (params.sortOrder && !['asc', 'desc'].includes(params.sortOrder)) {
    return { valid: false, error: 'sortOrder must be one of: asc, desc' };
  }

  return { valid: true };
}

/**
 * Build OpenSearch query
 */
function buildSearchQuery(params: SearchQuery): any {
  const mustClauses: any[] = [];
  const filterClauses: any[] = [];

  // Multi-match query for full-text search with field boosting
  mustClauses.push({
    multi_match: {
      query: params.q,
      fields: ['title^3', 'description^2', 'body'],
      type: 'best_fields',
      fuzziness: 'AUTO',
    },
  });

  // Filter by state (published only by default)
  if (params.state) {
    filterClauses.push({ term: { state: params.state } });
  } else {
    filterClauses.push({ term: { state: 'published' } });
  }

  // Filter by domain if specified
  if (params.domain) {
    filterClauses.push({ term: { domain: params.domain } });
  }

  // Filter by topics if specified
  if (params.topics && params.topics.length > 0) {
    filterClauses.push({
      terms: { topics: params.topics },
    });
  }

  // Build bool query
  const query: any = {
    bool: {
      must: mustClauses,
      filter: filterClauses,
    },
  };

  // Build search request
  const request: any = {
    query,
    highlight: {
      fields: {
        title: {},
        description: {},
        body: { fragment_size: 150, number_of_fragments: 1 },
      },
    },
    size: params.limit,
    from: params.offset,
  };

  // Add sorting if specified
  if (params.sortBy === 'date') {
    request.sort = [
      {
        publishedAt: {
          order: params.sortOrder,
          missing: '_last',
          unmapped_type: 'long',
        },
      },
    ];
  }
  // For relevance, no sort is needed (default is by _score)

  return request;
}

/**
 * Parse OpenSearch response
 */
function parseResponse(response: any): {
  results: any[];
  total: number;
  took: number;
} {
  const hits = response.hits?.hits || [];
  const results = hits.map((hit: any) => ({
    contentId: hit._source.contentId,
    title: hit._source.title,
    description: hit._source.description,
    snippet: hit.highlight?.body?.[0] || hit._source.description?.substring(0, 200),
    score: hit._score,
    topics: hit._source.topics,
    tags: hit._source.tags,
    publishedAt: hit._source.publishedAt ? new Date(hit._source.publishedAt).toISOString() : undefined,
  }));

  return {
    results,
    total: response.hits?.total?.value || 0,
    took: response.took || 0,
  };
}

/**
 * Publish CloudWatch metrics
 */
async function publishMetrics(metricName: string, value: number): Promise<void> {
  try {
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/SearchQuery`,
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
 * Lambda handler for search query API
 */
export async function handler(event: APIGatewayEvent): Promise<APIGatewayProxyResult> {
  console.log('Search query request:', JSON.stringify(event));

  // Parse and validate query parameters
  const queryParams = parseQueryParams(event);
  const validation = validateQueryParams(queryParams);

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
        message: validation.error,
      }),
    };
  }

  try {
    // Build search query
    const searchQuery = buildSearchQuery(queryParams);

    // Execute search
    const response = await opensearchClient.send({
      command: {
        method: 'GET',
        path: `/${OPENSEARCH_INDEX}/_search`,
        body: JSON.stringify(searchQuery),
      },
    });

    // Parse response
    const { results, total, took } = parseResponse(response);

    // Publish metrics
    await publishMetrics('QueriesExecuted', 1);
    await publishMetrics('ResultsReturned', results.length);

    // Build response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
      body: JSON.stringify({
        query: queryParams.q,
        results,
        pagination: {
          limit: queryParams.limit,
          offset: queryParams.offset,
          total,
          hasMore: queryParams.offset + results.length < total,
        },
        sorting: {
          sortBy: queryParams.sortBy,
          sortOrder: queryParams.sortOrder,
        },
        took,
      }),
    };
  } catch (error) {
    console.error('Error executing search:', error);
    await publishMetrics('QueryErrors', 1);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
      body: JSON.stringify({
        error: 'InternalServerError',
        message: 'Failed to execute search',
      }),
    };
  }
}
