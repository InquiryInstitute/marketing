#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';
import { ComputeStack } from '../lib/compute-stack';
import { ApiStack } from '../lib/api-stack';
import { MonitoringStack } from '../lib/monitoring-stack';

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

// Stack naming convention: inquiry-growth-{env}-{stack}
const stackPrefix = `inquiry-growth-${envName}`;

// Network Stack - VPC, subnets, security groups
const networkStack = new NetworkStack(app, `${stackPrefix}-network`, {
  env,
  stackName: `${stackPrefix}-network`,
  description: 'Network infrastructure for Inquiry Growth Engine',
  envName,
  envConfig,
});

// Data Stack - DynamoDB, S3, OpenSearch, Redis, Kinesis
const dataStack = new DataStack(app, `${stackPrefix}-data`, {
  env,
  stackName: `${stackPrefix}-data`,
  description: 'Data layer infrastructure for Inquiry Growth Engine',
  envName,
  envConfig,
  vpc: networkStack.vpc,
  redisSecurityGroup: networkStack.redisSecurityGroup,
});

// Compute Stack - Lambda functions
const computeStack = new ComputeStack(app, `${stackPrefix}-compute`, {
  env,
  stackName: `${stackPrefix}-compute`,
  description: 'Compute layer (Lambda functions) for Inquiry Growth Engine',
  envName,
  envConfig,
  vpc: networkStack.vpc,
  contentTable: dataStack.contentTable,
  userProfilesTable: dataStack.userProfilesTable,
  userEventsTable: dataStack.userEventsTable,
  rateLimitTable: dataStack.rateLimitTable,
  contentBucket: dataStack.contentBucket,
  eventArchiveBucket: dataStack.eventArchiveBucket,
  contentDistributionDomain: dataStack.contentDistribution.distributionDomainName,
  kinesisStream: dataStack.kinesisStream,
  cacheCluster: dataStack.cacheCluster,
  opensearchEndpoint: dataStack.openSearchCollectionEndpoint,
  opensearchRegion: env.region || 'us-east-1',
});

// API Stack - API Gateway, Cognito
const apiStack = new ApiStack(app, `${stackPrefix}-api`, {
  env,
  stackName: `${stackPrefix}-api`,
  description: 'API Gateway and authentication for Inquiry Growth Engine',
  envName,
  envConfig,
  contentFunction: computeStack.contentFunction,
  searchFunction: computeStack.searchFunction,
  recommendationFunction: computeStack.recommendationFunction,
  eventFunction: computeStack.eventFunction,
  profileFunction: computeStack.profileFunction,
  registerFunction: computeStack.registerFunction,
  loginFunction: computeStack.loginFunction,
  logoutFunction: computeStack.logoutFunction,
  refreshFunction: computeStack.refreshFunction,
});

// Monitoring Stack - CloudWatch, X-Ray, Alarms
const monitoringStack = new MonitoringStack(app, `${stackPrefix}-monitoring`, {
  env,
  stackName: `${stackPrefix}-monitoring`,
  description: 'Monitoring and alerting for Inquiry Growth Engine',
  envName,
  envConfig,
  api: apiStack.api,
  contentFunction: computeStack.contentFunction,
  embeddingFunction: computeStack.embeddingFunction,
  indexingFunction: computeStack.indexingFunction,
  searchFunction: computeStack.searchFunction,
  recommendationFunction: computeStack.recommendationFunction,
  eventFunction: computeStack.eventFunction,
  profileFunction: computeStack.profileFunction,
  contentTable: dataStack.contentTable,
  userProfilesTable: dataStack.userProfilesTable,
  userEventsTable: dataStack.userEventsTable,
  kinesisStream: dataStack.kinesisStream,
  contentBucket: dataStack.contentBucket,
  eventArchiveBucket: dataStack.eventArchiveBucket,
  embeddingDLQ: computeStack.embeddingDLQ,
  indexingDLQ: computeStack.indexingDLQ,
  pagerDutyIntegrationUrl: envConfig.pagerDutyIntegrationUrl, // Optional PagerDuty integration
});

// Add tags to all stacks
const tags = {
  Project: 'InquiryGrowthEngine',
  Environment: envName,
  ManagedBy: 'CDK',
};

Object.entries(tags).forEach(([key, value]) => {
  cdk.Tags.of(app).add(key, value);
});

app.synth();
