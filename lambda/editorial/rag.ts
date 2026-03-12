/**
 * RAG Retrieval Pipeline
 * Retrieves relevant content for AI-assisted content generation
 * Requirements: Req 8.4, 8.5 (RAG system for content grounding), Task 15.1
 */

import { OpenSearchClient } from '@aws-sdk/client-opensearch';
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

// Initialize AWS clients
const opensearchClient = new OpenSearchClient({ region: process.env.AWS_REGION || 'us-east-1' });
const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Environment variables
const OPENSEARCH_ENDPOINT = process.env.OPENSEARCH_ENDPOINT || '';
const OPENSEARCH_INDEX = process.env.OPENSEARCH_INDEX || 'content';
const ENV_NAME = process.env.ENV_NAME || 'dev';
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'amazon.titan-embed-text-v1';

/**
 * RAG retrieval result
 */
interface RAGResult {
  contentId: string;
  title: string;
  excerpt: string;
  score: number;
}

/**
 * Generate query embedding from topic
 */
async function generateQueryEmbedding(topic: string): Promise<number[]> {
  try {
    const response = await bedrockClient.send(
      new InvokeModelCommand({
        modelId: BEDROCK_MODEL_ID,
        body: JSON.stringify({
          inputText: topic,
        }),
      })
    );

    const responseBody = JSON.parse(Buffer.from(response.body).toString('utf-8'));
    return responseBody.embedding;
  } catch (error) {
    console.error('Error generating query embedding:', error);
    throw error;
  }
}

/**
 * Query OpenSearch for similar content
 */
async function querySimilarContent(queryEmbedding: number[], k: number = 5): Promise<RAGResult[]> {
  try {
    const response = await opensearchClient.send({
      command: {
        method: 'GET',
        path: `/${OPENSEARCH_INDEX}/_search`,
        body: JSON.stringify({
          knn: {
            embedding: {
              vector: queryEmbedding,
              k,
            },
          },
          size: k,
          _source: ['contentId', 'title', 'description', 'body'],
        }),
      },
    });

    const hits = response.hits?.hits || [];
    return hits.map((hit: any) => ({
      contentId: hit._source.contentId,
      title: hit._source.title,
      excerpt: hit._source.description || hit._source.body?.substring(0, 200),
      score: hit._score,
    }));
  } catch (error) {
    console.error('Error querying OpenSearch:', error);
    throw error;
  }
}

/**
 * Extract relevant excerpts from content
 */
function extractExcerpts(content: any, query: string): string[] {
  const excerpts: string[] = [];

  // Extract sentences containing query terms
  const sentences = content.body.split(/[.!?]+/);
  for (const sentence of sentences) {
    if (sentence.toLowerCase().includes(query.toLowerCase())) {
      excerpts.push(sentence.trim());
    }
  }

  return excerpts.slice(0, 3); // Return top 3 excerpts
}

/**
 * Format context for Claude prompt
 */
export function formatContext(results: RAGResult[]): string {
  return results
    .map((result, index) => {
      return `${index + 1}. ${result.title}\nExcerpt: ${result.excerpt}\n`;
    })
    .join('\n');
}

/**
 * RAG retrieval pipeline
 */
export async function ragRetrieval(topic: string, k: number = 5): Promise<{
  results: RAGResult[];
  context: string;
}> {
  // Generate query embedding
  const queryEmbedding = await generateQueryEmbedding(topic);

  // Query OpenSearch for similar content
  const results = await querySimilarContent(queryEmbedding, k);

  // Format context
  const context = formatContext(results);

  return {
    results,
    context,
  };
}

/**
 * Lambda handler for RAG retrieval
 */
export async function handler(event: any): Promise<any> {
  console.log('RAG retrieval request:', JSON.stringify(event));

  try {
    const { topic, k = 5 } = event;

    const { results, context } = await ragRetrieval(topic, k);

    // Publish metrics
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/RAG`,
        MetricData: [
          {
            MetricName: 'Retrievals',
            Value: 1,
            Unit: StandardUnit.Count,
            Timestamp: new Date(),
          },
          {
            MetricName: 'ResultsRetrieved',
            Value: results.length,
            Unit: StandardUnit.Count,
            Timestamp: new Date(),
          },
        ],
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        results,
        context,
      }),
    };
  } catch (error) {
    console.error('Error in RAG retrieval:', error);
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/RAG`,
        MetricData: [
          {
            MetricName: 'RetrievalErrors',
            Value: 1,
            Unit: StandardUnit.Count,
            Timestamp: new Date(),
          },
        ],
      })
    );
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'InternalServerError',
        message: 'Failed to perform RAG retrieval',
      }),
    };
  }
}
