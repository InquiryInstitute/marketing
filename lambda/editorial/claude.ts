/**
 * Claude 3.5 Sonnet Integration
 * Generates article drafts using Claude AI
 * Requirements: Req 8.1, 8.2, 8.3, 8.6 (AI-assisted content generation), Task 15.2
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';

// Initialize AWS clients
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Environment variables
const ENV_NAME = process.env.ENV_NAME || 'dev';
const CLAUDE_MODEL_ID = process.env.CLAUDE_MODEL_ID || 'anthropic.claude-3-5-sonnet-20241022-v2:0';

/**
 * Generate article draft with Claude
 */
export async function generateDraft(
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
}> {
  const startTime = Date.now();

  // Construct prompt
  const prompt = `You are an expert writer for Inquiry Institute. Generate an article draft on the following topic.

Topic: ${topic}
${outline ? `Outline: ${outline}` : ''}

Requirements:
- ${targetLength} words
- Maintain institutional voice (thoughtful, accessible, rigorous)
- Include inline citations to reference articles
- Use markdown formatting

Generate the article draft now:`;

  try {
    // Invoke Claude
    const response = await bedrockClient.send(
      new InvokeModelCommand({
        modelId: CLAUDE_MODEL_ID,
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 4000,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      })
    );

    const responseBody = JSON.parse(Buffer.from(response.body).toString('utf-8'));
    const draft = responseBody.content[0].text;

    // Calculate tokens used (approximate)
    const inputTokens = prompt.length / 4; // Approximate
    const outputTokens = draft.length / 4; // Approximate
    const tokensUsed = Math.floor(inputTokens + outputTokens);

    // Calculate generation time
    const generationTime = Date.now() - startTime;

    // Extract citations (placeholder - would parse inline citations from draft)
    const citations: Array<{ contentId: string; title: string; excerpt: string }> = [];

    return {
      draft,
      citations,
      metadata: {
        model: CLAUDE_MODEL_ID,
        tokensUsed,
        generationTime,
      },
    };
  } catch (error) {
    console.error('Error generating draft with Claude:', error);
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
        Namespace: `InquiryGrowth/${ENV_NAME}/Claude`,
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
