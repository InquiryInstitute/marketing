/**
 * Quality Controls for AI-Generated Content
 * Implements plagiarism check, readability score, and AI content flagging
 * Requirements: Req 8.7, 8.8 (AI content flagging and human review), Task 15.3
 */

import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';

// Environment variables
const ENV_NAME = process.env.ENV_NAME || 'dev';
const SIMILARITY_THRESHOLD = 0.8; // 80% similarity threshold

/**
 * AI content metadata
 */
interface AICoordinates {
  aiAssisted: boolean;
  model: string;
  generatedAt: string;
}

/**
 * Plagiarism check
 */
export function checkPlagiarism(
  content: string,
  sourceContent: string[]
): { isPlagiarized: boolean; similarity: number } {
  // Simple similarity check (placeholder)
  // In production, you would use a more sophisticated algorithm
  const contentWords = content.toLowerCase().split(/\s+/);
  const sourceWords = sourceContent.join(' ').toLowerCase().split(/\s+/);

  const contentSet = new Set(contentWords);
  const sourceSet = new Set(sourceWords);

  let matchingWords = 0;
  for (const word of contentWords) {
    if (sourceSet.has(word)) {
      matchingWords++;
    }
  }

  const similarity = matchingWords / contentWords.length;

  return {
    isPlagiarized: similarity > SIMILARITY_THRESHOLD,
    similarity,
  };
}

/**
 * Calculate readability score (Flesch-Kincaid grade level)
 */
export function calculateReadabilityScore(text: string): number {
  // Simple readability calculation (placeholder)
  // In production, you would use the full Flesch-Kincaid formula

  const words = text.split(/\s+/).length;
  const sentences = text.split(/[.!?]+/).length;
  const syllables = text.split(/[aeiou]+/i).length - 1;

  // Flesch-Kincaid grade level formula
  const gradeLevel =
    0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;

  return Math.round(gradeLevel * 10) / 10; // Round to 1 decimal
}

/**
 * Check readability score
 */
export function checkReadability(text: string): {
  score: number;
  gradeLevel: number;
  acceptable: boolean;
} {
  const score = calculateReadabilityScore(text);
  const gradeLevel = Math.floor(score);

  // Target grade level 10-12
  const acceptable = gradeLevel >= 10 && gradeLevel <= 12;

  return {
    score,
    gradeLevel,
    acceptable,
  };
}

/**
 * Flag AI-generated content
 */
export function flagAIContent(
  content: string,
  model: string
): { flagged: boolean; metadata: AICoordinates } {
  return {
    flagged: true,
    metadata: {
      aiAssisted: true,
      model,
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Require human review
 */
export function requireHumanReview(content: string): boolean {
  // All AI-generated content requires human review
  return true;
}

/**
 * Quality control check
 */
export async function runQualityControls(
  content: string,
  sourceContent: string[],
  model: string
): Promise<{
  passed: boolean;
  issues: string[];
  metadata: AICoordinates;
}> {
  const issues: string[] = [];

  // Plagiarism check
  const plagiarism = checkPlagiarism(content, sourceContent);
  if (plagiarism.isPlagiarized) {
    issues.push(`Plagiarism detected: ${Math.round(plagiarism.similarity * 100)}% similarity`);
  }

  // Readability check
  const readability = checkReadability(content);
  if (!readable.acceptable) {
    issues.push(`Readability score ${readable.score} outside target range (10-12)`);
  }

  // Flag AI content
  const aiMetadata = flagAIContent(content, model).metadata;

  return {
    passed: issues.length === 0,
    issues,
    metadata: aiMetadata,
  };
}

/**
 * Publish CloudWatch metrics
 */
async function publishMetrics(metricName: string, value: number): Promise<void> {
  try {
    const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/QualityControls`,
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
