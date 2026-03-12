/**
 * Editorial Assistant API Lambda
 * Handles AI-assisted content generation requests
 * Requirements: Req 8 (AI-Assisted Content Creation), Task 15.4
 */

import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ragRetrieval, formatContext } from './rag';
import { generateDraft } from './claude';
import { runQualityControls } from './quality';

// Initialize CloudWatch client
const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Environment variables
const ENV_NAME = process.env.ENV_NAME || 'dev';

/**
 * Generate article draft with AI assistance
 */
async function generateArticleDraft(
  topic: string,
  outline?: string,
  targetLength: number = 1000
): Promise<{
  draft: string;
  citations: Array<{
    contentId: string;
    title: string;
    excerpt: string;
  }>;
  metadata: {
    model: string;
    tokensUsed: number;
    generationTime: number;
  };
  quality: {
    passed: boolean;
    issues: string[];
  };
}> {
  // Step 1: RAG retrieval
  const ragResult = await ragRetrieval(topic, 5);
  const context = formatContext(ragResult.results);

  // Step 2: Generate draft with Claude
  const draftResult = await generateDraft(topic, outline, targetLength);

  // Step 3: Quality controls
  const qualityResult = await runQualityControls(
    draftResult.draft,
    ragResult.results.map((r) => r.excerpt),
    draftResult.metadata.model
  );

  return {
    draft: draftResult.draft,
    citations: ragResult.results.map((r) => ({
      contentId: r.contentId,
      title: r.title,
      excerpt: r.excerpt,
    })),
    metadata: draftResult.metadata,
    quality: {
      passed: qualityResult.passed,
      issues: qualityResult.issues,
    },
  };
}

/**
 * Lambda handler for editorial assistant API
 */
export async function handler(event: APIGatewayEvent): Promise<APIGatewayProxyResult> {
  console.log('Editorial assistant request:', JSON.stringify(event));

  try {
    // Parse request body
    let body: {
      topic: string;
      outline?: string;
      targetLength?: number;
    };
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (error) {
      await cloudwatchClient.send(
        new PutMetricDataCommand({
          Namespace: `InquiryGrowth/${ENV_NAME}/Editorial`,
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
    if (!body.topic || body.topic.length === 0) {
      await cloudwatchClient.send(
        new PutMetricDataCommand({
          Namespace: `InquiryGrowth/${ENV_NAME}/Editorial`,
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
          message: 'topic parameter is required',
        }),
      };
    }

    // Generate draft
    const result = await generateArticleDraft(
      body.topic,
      body.outline,
      body.targetLength || 1000
    );

    // Publish metrics
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/Editorial`,
        MetricData: [
          {
            MetricName: 'DraftsGenerated',
            Value: 1,
            Unit: StandardUnit.Count,
            Timestamp: new Date(),
          },
          {
            MetricName: 'TokensUsed',
            Value: result.metadata.tokensUsed,
            Unit: StandardUnit.Count,
            Timestamp: new Date(),
          },
          {
            MetricName: 'QualityChecksPassed',
            Value: result.quality.passed ? 1 : 0,
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
        draft: result.draft,
        citations: result.citations,
        metadata: result.metadata,
        quality: result.quality,
        humanReviewRequired: true,
      }),
    };
  } catch (error) {
    console.error('Error generating article draft:', error);
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/Editorial`,
        MetricData: [
          {
            MetricName: 'GenerationErrors',
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
        message: 'Failed to generate article draft',
      }),
    };
  }
}
