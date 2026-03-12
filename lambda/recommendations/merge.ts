/**
 * Recommendation Merging Logic
 * Merges candidates from rules and vector layers
 * Requirements: Req 4.3 (Combine results from both layers), Task 11.1
 */

import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';

// Environment variables
const ENV_NAME = process.env.ENV_NAME || 'dev';

// Weights for merging
const RULES_WEIGHT = 0.4;
const VECTOR_WEIGHT = 0.6;

/**
 * Recommendation candidate from any layer
 */
interface RecommendationCandidate {
  contentId: string;
  score: number;
  reason: string;
  source: 'rules' | 'vector';
}

/**
 * Merged recommendation
 */
interface MergedRecommendation {
  contentId: string;
  score: number;
  reasons: string[];
  sources: ('rules' | 'vector')[];
  finalScore: number;
}

/**
 * Merge candidates from rules and vector layers
 */
export function mergeRecommendations(
  rulesCandidates: RecommendationCandidate[],
  vectorCandidates: RecommendationCandidate[]
): MergedRecommendation[] {
  // Create maps for quick lookup
  const rulesMap = new Map(rulesCandidates.map((c) => [c.contentId, c]));
  const vectorMap = new Map(vectorCandidates.map((c) => [c.contentId, c]));

  // Get all unique content IDs
  const allContentIds = new Set([
    ...rulesMap.keys(),
    ...vectorMap.keys(),
  ]);

  // Merge candidates
  const merged: MergedRecommendation[] = [];

  for (const contentId of allContentIds) {
    const rulesCandidate = rulesMap.get(contentId);
    const vectorCandidate = vectorMap.get(contentId);

    const reasons: string[] = [];
    const sources: ('rules' | 'vector')[] = [];

    // Calculate final score
    let finalScore = 0;

    if (rulesCandidate) {
      reasons.push(rulesCandidate.reason);
      sources.push('rules');
      finalScore += rulesCandidate.score * RULES_WEIGHT;
    }

    if (vectorCandidate) {
      reasons.push(vectorCandidate.reason);
      sources.push('vector');
      finalScore += vectorCandidate.score * VECTOR_WEIGHT;
    }

    merged.push({
      contentId,
      score: (rulesCandidate?.score || 0) + (vectorCandidate?.score || 0),
      reasons,
      sources,
      finalScore,
    });
  }

  // Sort by final score descending
  merged.sort((a, b) => b.finalScore - a.finalScore);

  return merged;
}

/**
 * Apply diversity constraint
 */
export function applyDiversityConstraint(
  recommendations: MergedRecommendation[],
  maxPerTopic: number = 0.4,
  minTopics: number = 3
): MergedRecommendation[] {
  // Group by topic (placeholder - would need topic data from content)
  const topicCounts = new Map<string, number>();
  const result: MergedRecommendation[] = [];

  for (const rec of recommendations) {
    // Get topics for this content (placeholder)
    const topics = rec.sources; // Placeholder

    // Check if adding this recommendation would exceed max per topic
    let exceedsMax = false;
    for (const topic of topics) {
      const count = topicCounts.get(topic) || 0;
      if (count >= recommendations.length * maxPerTopic) {
        exceedsMax = true;
        break;
      }
    }

    if (!exceedsMax) {
      result.push(rec);
      for (const topic of topics) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      }
    }
  }

  // Ensure minimum topics (placeholder)
  if (topicCounts.size < minTopics) {
    // Add more recommendations from different topics
    // (placeholder implementation)
  }

  return result;
}

/**
 * Generate explanation for recommendation
 */
export function generateExplanation(rec: MergedRecommendation): string {
  const explanationParts: string[] = [];

  if (rec.sources.includes('rules')) {
    explanationParts.push('based on your interests');
  }

  if (rec.sources.includes('vector')) {
    explanationParts.push('similar to content you viewed');
  }

  return explanationParts.join(' and ');
}

/**
 * Publish CloudWatch metrics
 */
async function publishMetrics(metricName: string, value: number): Promise<void> {
  try {
    const cloudwatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: `InquiryGrowth/${ENV_NAME}/Recommendations`,
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
