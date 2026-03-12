/**
 * OpenSearch Vector Indexing Lambda
 * Requirements: Req 5.4 (Store embeddings in OpenSearch)
 * 
 * This Lambda function indexes content with embeddings into OpenSearch Serverless.
 * It stores content metadata + embedding vector in k-NN index for similarity search.
 * 
 * Features:
 * - AWS SigV4 signing for OpenSearch authentication
 * - Indexes content metadata + 1536-dim embedding vector
 * - Error handling with exponential backoff retries
 * - CloudWatch metrics for indexing operations
 * - Integration with embedding generation Lambda
 */

import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

// Environment variables
const OPENSEARCH_ENDPOINT = process.env.OPENSEARCH_ENDPOINT!;
const OPENSEARCH_REGION = process.env.OPENSEARCH_REGION || 'us-east-1';
const CONTENT_TABLE = process.env.CONTENT_TABLE!;
const ENV_NAME = process.env.ENV_NAME || 'dev';

// Constants
const INDEX_NAME = 'content';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

// AWS clients
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cloudwatchClient = new CloudWatchClient({});

// OpenSearch client with AWS SigV4 signing
const opensearchClient = new Client({
  ...AwsSigv4Signer({
    region: OPENSEARCH_REGION,
    service: 'aoss', // OpenSearch Serverless
    getCredentials: () => {
      const credentialsProvider = defaultProvider();
      return credentialsProvider();
    },
  }),
  node: OPENSEARCH_ENDPOINT,
});

/**
 * Content document interface for OpenSearch
 */
interface ContentDocument {
  contentId: string;
  domain: string;
  title: string;
  description: string;
  body: string;
  topics: string[];
  tags: string[];
  author: string;
  state: string;
  publishedAt: string;
  embedding_vector: number[];
}

/**
 * Indexing result interface
 */
interface IndexingResult {
  success: boolean;
  contentId: string;
  error?: string;
  retryCount?: number;
}

/**
 * Fetch content from DynamoDB
 */
async function getContent(contentId: string): Promise<any | null> {
  try {
    const command = new GetCommand({
      TableName: CONTENT_TABLE,
      Key: { id: contentId },
    });

    const response = await dynamoClient.send(command);
    
    if (!response.Item) {
      console.warn(`Content not found: ${contentId}`);
      return null;
    }

    return response.Item;
  } catch (error: any) {
    console.error(`Error fetching content ${contentId}:`, error);
    throw error;
  }
}

/**
 * Index document in OpenSearch with retry logic
 */
async function indexDocument(
  document: ContentDocument,
  retryCount = 0
): Promise<void> {
  try {
    const response = await opensearchClient.index({
      index: INDEX_NAME,
      id: document.contentId,
      body: document,
      refresh: true, // Make document immediately searchable
    });

    if (response.statusCode !== 200 && response.statusCode !== 201) {
      throw new Error(`OpenSearch indexing failed with status ${response.statusCode}`);
    }

    console.log(`Successfully indexed document ${document.contentId}`);
  } catch (error: any) {
    console.error(`OpenSearch indexing error (attempt ${retryCount + 1}):`, error);

    // Check if we should retry
    if (retryCount < MAX_RETRIES) {
      // Exponential backoff: 1s, 2s, 4s
      const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, retryCount);
      console.log(`Retrying after ${backoffMs}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      return indexDocument(document, retryCount + 1);
    }

    // Max retries exceeded
    throw new Error(
      `Failed to index document after ${MAX_RETRIES} retries: ${error.message}`
    );
  }
}

/**
 * Log CloudWatch metrics for indexing operations
 */
async function logMetrics(
  contentId: string,
  indexingTime: number,
  success: boolean,
  retryCount: number
): Promise<void> {
  try {
    const command = new PutMetricDataCommand({
      Namespace: `InquiryGrowth/${ENV_NAME}`,
      MetricData: [
        {
          MetricName: 'OpenSearchIndexingTime',
          Value: indexingTime,
          Unit: 'Milliseconds',
          Dimensions: [
            { Name: 'Environment', Value: ENV_NAME },
            { Name: 'Service', Value: 'OpenSearchIndexing' },
          ],
        },
        {
          MetricName: 'OpenSearchIndexingSuccess',
          Value: success ? 1 : 0,
          Unit: 'Count',
          Dimensions: [
            { Name: 'Environment', Value: ENV_NAME },
            { Name: 'Service', Value: 'OpenSearchIndexing' },
          ],
        },
        {
          MetricName: 'OpenSearchIndexingRetryCount',
          Value: retryCount,
          Unit: 'Count',
          Dimensions: [
            { Name: 'Environment', Value: ENV_NAME },
            { Name: 'Service', Value: 'OpenSearchIndexing' },
          ],
        },
      ],
    });

    await cloudwatchClient.send(command);
  } catch (error: any) {
    // Don't fail the function if metrics logging fails
    console.error('Error logging metrics:', error);
  }
}

/**
 * Process a single content item for OpenSearch indexing
 */
export async function processContentIndexing(
  contentId: string
): Promise<IndexingResult> {
  const startTime = Date.now();
  let retryCount = 0;

  try {
    console.log(`Processing content ${contentId} for OpenSearch indexing`);

    // Fetch content from DynamoDB
    const content = await getContent(contentId);
    
    if (!content) {
      return {
        success: false,
        contentId,
        error: 'Content not found',
      };
    }

    // Only index published content
    if (content.state !== 'published') {
      console.log(`Skipping content ${contentId} - not published (state: ${content.state})`);
      return {
        success: false,
        contentId,
        error: 'Content not published',
      };
    }

    // Verify embedding exists
    if (!content.embedding || !Array.isArray(content.embedding)) {
      console.warn(`Content ${contentId} has no embedding - skipping indexing`);
      return {
        success: false,
        contentId,
        error: 'No embedding available',
      };
    }

    // Prepare document for OpenSearch
    const document: ContentDocument = {
      contentId: content.id,
      domain: content.domain || 'article',
      title: content.title,
      description: content.description,
      body: content.body,
      topics: content.topics || [],
      tags: content.tags || [],
      author: content.author || 'unknown',
      state: content.state,
      publishedAt: content.publishedAt 
        ? new Date(content.publishedAt).toISOString() 
        : new Date().toISOString(),
      embedding_vector: content.embedding,
    };

    // Index document in OpenSearch with retries
    await indexDocument(document, retryCount);

    // Calculate indexing time
    const indexingTime = Date.now() - startTime;

    // Log metrics
    await logMetrics(contentId, indexingTime, true, retryCount);

    console.log(`Successfully indexed content ${contentId} in ${indexingTime}ms`);

    return {
      success: true,
      contentId,
      retryCount,
    };
  } catch (error: any) {
    const indexingTime = Date.now() - startTime;
    
    console.error(`Failed to index content ${contentId}:`, error);
    
    // Log failure metrics
    await logMetrics(contentId, indexingTime, false, retryCount);

    return {
      success: false,
      contentId,
      error: error.message,
      retryCount,
    };
  }
}

/**
 * Lambda handler
 * Can be triggered by:
 * - Direct invocation after embedding generation
 * - EventBridge rule (scheduled batch indexing)
 * - Step Functions workflow
 */
export async function handler(event: any): Promise<any> {
  console.log('OpenSearch indexing Lambda invoked:', JSON.stringify(event));

  try {
    // Handle direct invocation with contentId
    if (event.contentId) {
      const result = await processContentIndexing(event.contentId);
      
      return {
        statusCode: result.success ? 200 : 500,
        body: JSON.stringify(result),
      };
    }

    // Handle batch processing
    if (event.contentIds && Array.isArray(event.contentIds)) {
      const results: IndexingResult[] = [];

      for (const contentId of event.contentIds) {
        const result = await processContentIndexing(contentId);
        results.push(result);
      }

      const successCount = results.filter(r => r.success).length;

      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Batch indexing complete',
          total: results.length,
          successful: successCount,
          failed: results.length - successCount,
          results,
        }),
      };
    }

    // Handle invocation from embedding generation Lambda
    if (event.embedding && event.contentId) {
      // Embedding was just generated, now index it
      const result = await processContentIndexing(event.contentId);
      
      return {
        statusCode: result.success ? 200 : 500,
        body: JSON.stringify(result),
      };
    }

    // Unknown event format
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Invalid event format',
        message: 'Expected contentId, contentIds array, or embedding result',
      }),
    };
  } catch (error: any) {
    console.error('Lambda handler error:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
      }),
    };
  }
}
