/**
 * Search Indexing Lambda
 * Indexes content in OpenSearch when content is published
 * Requirements: Req 3.7 (Index content within 5 seconds), Task 7.1
 */

import { OpenSearchClient } from '@aws-sdk/client-opensearch';
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { S3Event } from 'aws-lambda';
import { Content } from '../shared/types/content';

// Initialize AWS clients
const opensearchClient = new OpenSearchClient({ region: process.env.AWS_REGION || 'us-east-1' });
const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Environment variables
const OPENSEARCH_ENDPOINT = process.env.OPENSEARCH_ENDPOINT || '';
const OPENSEARCH_INDEX = process.env.OPENSEARCH_INDEX || 'content';
const ENV_NAME = process.env.ENV_NAME || 'dev';

/**
 * Content indexing document
 */
interface ContentDocument {
  contentId: string;
  domain: string;
  title: string;
  description: string;
  body: string;
  author: string;
  topics: string[];
  tags: string[];
  state: string;
  publishedAt?: number;
  createdAt: number;
  updatedAt: number;
  embedding?: number[];
}

/**
 * Build OpenSearch document from content
 */
function buildDocument(content: Content): ContentDocument {
  return {
    contentId: content.id,
    domain: content.domain,
    title: content.title,
    description: content.description,
    body: content.body,
    author: content.author,
    topics: content.topics || [],
    tags: content.tags || [],
    state: content.state,
    publishedAt: content.publishedAt ? new Date(content.publishedAt).getTime() : undefined,
    createdAt: new Date(content.createdAt).getTime(),
    updatedAt: new Date(content.updatedAt).getTime(),
    embedding: content.embedding,
  };
}

/**
 * Index content in OpenSearch
 */
async function indexContent(document: ContentDocument): Promise<void> {
  try {
    const response = await opensearchClient.send({
      // Using REST API directly since OpenSearchClient doesn't have high-level indexing
      command: {
        method: 'PUT',
        path: `/${OPENSEARCH_INDEX}/_doc/${document.contentId}`,
        body: JSON.stringify(document),
      },
    });

    console.log('Content indexed successfully:', response);
  } catch (error) {
    console.error('Error indexing content:', error);
    throw error;
  }
}

/**
 * Batch index content in OpenSearch
 */
async function batchIndexContent(documents: ContentDocument[]): Promise<void> {
  // Build bulk request body
  let body = '';
  for (const doc of documents) {
    body += JSON.stringify({ index: { _index: OPENSEARCH_INDEX, _id: doc.contentId } }) + '\n';
    body += JSON.stringify(doc) + '\n';
  }

  try {
    const response = await opensearchClient.send({
      command: {
        method: 'POST',
        path: '/_bulk',
        body: body,
      },
    });

    console.log('Batch indexing complete:', response);
  } catch (error) {
    console.error('Error batch indexing content:', error);
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
        Namespace: `InquiryGrowth/${ENV_NAME}/SearchIndexing`,
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
 * Process S3 event for content indexing
 */
async function processS3Event(event: S3Event): Promise<void> {
  console.log('Processing S3 event:', JSON.stringify(event));

  const documents: ContentDocument[] = [];

  for (const record of event.Records) {
    try {
      // Parse S3 object key to get content ID
      const key = decodeURIComponent(record.s3.object.key);
      const contentId = key.replace('content/', '').replace('.json', '');

      console.log(`Processing content: ${contentId}`);

      // In a real implementation, you would fetch the content from S3 or DynamoDB
      // For now, we'll create a placeholder document
      const document: ContentDocument = {
        contentId,
        domain: 'article',
        title: 'Placeholder Title',
        description: 'Placeholder Description',
        body: 'Placeholder Body',
        author: 'placeholder-author',
        topics: ['placeholder'],
        tags: [],
        state: 'published',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      documents.push(document);
    } catch (error) {
      console.error(`Error processing record:`, error);
      await publishMetrics('ProcessingErrors', 1);
    }
  }

  // Index documents
  if (documents.length > 0) {
    await batchIndexContent(documents);
    await publishMetrics('DocumentsIndexed', documents.length);
  }
}

/**
 * Lambda handler for content indexing
 */
export async function handler(event: any): Promise<void> {
  console.log('Search indexing request:', JSON.stringify(event));

  try {
    // Determine event type
    if (event.Records && event.Records[0].eventSource === 'aws:s3') {
      await processS3Event(event as S3Event);
    } else {
      // Direct content indexing (from content service)
      const content = event as Content;
      const document = buildDocument(content);
      await indexContent(document);
      await publishMetrics('DocumentsIndexed', 1);
    }
  } catch (error) {
    console.error('Fatal error indexing content:', error);
    await publishMetrics('IndexingErrors', 1);
    throw error;
  }
}
