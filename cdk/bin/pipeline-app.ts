#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/pipeline-stack';

const app = new cdk.App();

// Get environment configuration
const envName = app.node.tryGetContext('env') || 'dev';
const envConfig = app.node.tryGetContext('environments')[envName];

if (!envConfig) {
  throw new Error(`Environment configuration not found for: ${envName}`);
}

const env = {
  account: envConfig.account || process.env.CDK_DEFAULT_ACCOUNT,
  region: envConfig.region || process.env.CDK_DEFAULT_REGION,
};

// GitHub configuration - these should be provided via context or environment variables
const githubOwner = app.node.tryGetContext('githubOwner') || process.env.GITHUB_OWNER;
const githubRepo = app.node.tryGetContext('githubRepo') || process.env.GITHUB_REPO;
const githubBranch = app.node.tryGetContext('githubBranch') || getBranchForEnv(envName);
const githubConnectionArn = app.node.tryGetContext('githubConnectionArn') || process.env.GITHUB_CONNECTION_ARN;
const notificationEmail = app.node.tryGetContext('notificationEmail') || process.env.NOTIFICATION_EMAIL;

if (!githubOwner || !githubRepo || !githubConnectionArn) {
  throw new Error(
    'Missing required GitHub configuration. Please provide:\n' +
    '  - githubOwner (via context or GITHUB_OWNER env var)\n' +
    '  - githubRepo (via context or GITHUB_REPO env var)\n' +
    '  - githubConnectionArn (via context or GITHUB_CONNECTION_ARN env var)\n' +
    '\nExample:\n' +
    '  cdk deploy -c env=dev -c githubOwner=myorg -c githubRepo=myrepo -c githubConnectionArn=arn:aws:...'
  );
}

// Create pipeline stack
const pipelineStack = new PipelineStack(app, `inquiry-growth-${envName}-pipeline`, {
  env,
  stackName: `inquiry-growth-${envName}-pipeline`,
  description: `CI/CD Pipeline for Inquiry Growth Engine (${envName})`,
  envName,
  envConfig,
  githubOwner,
  githubRepo,
  githubBranch,
  githubConnectionArn,
  notificationEmail,
});

// Add tags
const tags = {
  Project: 'InquiryGrowthEngine',
  Environment: envName,
  ManagedBy: 'CDK',
  Component: 'Pipeline',
};

Object.entries(tags).forEach(([key, value]) => {
  cdk.Tags.of(pipelineStack).add(key, value);
});

app.synth();

// Helper function to determine branch based on environment
function getBranchForEnv(env: string): string {
  switch (env) {
    case 'prod':
      return 'main';
    case 'staging':
      return 'staging';
    case 'dev':
    default:
      return 'develop';
  }
}
