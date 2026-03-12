import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface ComputeStackProps extends cdk.StackProps {
  envName: string;
  envConfig: any;
  vpc: ec2.Vpc;
  contentTable: dynamodb.Table;
  userProfilesTable: dynamodb.Table;
  userEventsTable: dynamodb.Table;
  rateLimitTable: dynamodb.Table;
  contentBucket: s3.Bucket;
  eventArchiveBucket: s3.Bucket;
  contentDistributionDomain: string;
  kinesisStream: kinesis.Stream;
  cacheCluster: elasticache.CfnCacheCluster;
  opensearchEndpoint: string;
  opensearchRegion: string;
}

export class ComputeStack extends cdk.Stack {
  public readonly contentFunction: lambda.Function;
  public readonly embeddingFunction: lambda.Function;
  public readonly indexingFunction: lambda.Function;
  public readonly searchFunction: lambda.Function;
  public readonly recommendationFunction: lambda.Function;
  public readonly eventFunction: lambda.Function;
  public readonly eventProcessingFunction: lambda.Function;
  public readonly profileFunction: lambda.Function;
  public readonly registerFunction: lambda.Function;
  public readonly loginFunction: lambda.Function;
  public readonly logoutFunction: lambda.Function;
  public readonly refreshFunction: lambda.Function;
  public readonly embeddingDLQ: sqs.Queue;
  public readonly indexingDLQ: sqs.Queue;
  public readonly eventProcessingDLQ: sqs.Queue;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const {
      envName,
      envConfig,
      vpc,
      contentTable,
      userProfilesTable,
      userEventsTable,
      rateLimitTable,
      contentBucket,
      eventArchiveBucket,
      contentDistributionDomain,
      kinesisStream,
      cacheCluster,
      opensearchEndpoint,
      opensearchRegion,
    } = props;

    // Common Lambda configuration
    const commonLambdaProps = {
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        ENV_NAME: envName,
        CONTENT_TABLE: contentTable.tableName,
        USER_PROFILES_TABLE: userProfilesTable.tableName,
        USER_EVENTS_TABLE: userEventsTable.tableName,
        CONTENT_BUCKET: contentBucket.bucketName,
        CLOUDFRONT_DOMAIN: contentDistributionDomain,
        EVENT_ARCHIVE_BUCKET: eventArchiveBucket.bucketName,
        KINESIS_STREAM: kinesisStream.streamName,
        CACHE_ENDPOINT: cacheCluster.attrRedisEndpointAddress,
        CACHE_PORT: cacheCluster.attrRedisEndpointPort,
        BEDROCK_REGION: 'us-east-1',
        OPENSEARCH_ENDPOINT: opensearchEndpoint,
        OPENSEARCH_REGION: opensearchRegion,
      },
    };

    // Content Service Lambda
    this.contentFunction = new lambda.Function(this, 'ContentFunction', {
      ...commonLambdaProps,
      functionName: `inquiry-growth-${envName}-content`,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/content', {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash',
            '-c',
            'npm install && npm run build && cp -r dist/* /asset-output/',
          ],
        },
      }),
      description: 'Content publishing and retrieval service',
    });

    // Grant permissions
    contentTable.grantReadWriteData(this.contentFunction);
    contentBucket.grantReadWrite(this.contentFunction);

    // Bedrock permissions for embeddings
    this.contentFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: ['*'],
      })
    );

    // ========================================
    // Dead Letter Queues for Embedding Pipeline
    // ========================================

    // DLQ for Embedding Lambda failures
    this.embeddingDLQ = new sqs.Queue(this, 'EmbeddingDLQ', {
      queueName: `inquiry-growth-${envName}-embedding-dlq`,
      retentionPeriod: cdk.Duration.days(14), // Retain failed messages for 14 days
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    // DLQ for Indexing Lambda failures
    this.indexingDLQ = new sqs.Queue(this, 'IndexingDLQ', {
      queueName: `inquiry-growth-${envName}-indexing-dlq`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    // ========================================
    // Embedding Generation Lambda with DLQ
    // ========================================
    this.embeddingFunction = new lambda.Function(this, 'EmbeddingFunction', {
      ...commonLambdaProps,
      functionName: `inquiry-growth-${envName}-embedding`,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/embeddings', {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash',
            '-c',
            'npm install && npm run build && cp -r dist/* /asset-output/',
          ],
        },
      }),
      description: 'Embedding generation service using Bedrock Titan V2',
      timeout: cdk.Duration.seconds(60), // Longer timeout for Bedrock API calls
      memorySize: 1024, // More memory for embedding processing
      deadLetterQueue: this.embeddingDLQ, // Configure DLQ
      deadLetterQueueEnabled: true,
      retryAttempts: 2, // Retry failed invocations 2 times before sending to DLQ
    });

    // Grant permissions for embedding function
    contentTable.grantReadWriteData(this.embeddingFunction);
    
    // Bedrock permissions for Titan Embeddings V2
    this.embeddingFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0`,
        ],
      })
    );

    // CloudWatch permissions for custom metrics
    this.embeddingFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
      })
    );

    // OpenSearch Indexing Lambda
    this.indexingFunction = new lambda.Function(this, 'IndexingFunction', {
      ...commonLambdaProps,
      functionName: `inquiry-growth-${envName}-indexing`,
      handler: 'index-opensearch.handler',
      code: lambda.Code.fromAsset('lambda/embeddings', {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash',
            '-c',
            'npm install && npm run build && cp -r dist/* /asset-output/',
          ],
        },
      }),
      description: 'OpenSearch vector indexing service',
      timeout: cdk.Duration.seconds(60), // Longer timeout for OpenSearch operations
      memorySize: 512,
      deadLetterQueue: this.indexingDLQ, // Configure DLQ
      deadLetterQueueEnabled: true,
      retryAttempts: 2, // Retry failed invocations 2 times before sending to DLQ
    });

    // Grant permissions for indexing function
    contentTable.grantReadData(this.indexingFunction);
    
    // OpenSearch permissions for indexing
    this.indexingFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'aoss:APIAccessAll', // OpenSearch Serverless API access
        ],
        resources: ['*'], // Will be scoped to specific collection in production
      })
    );

    // CloudWatch permissions for custom metrics
    this.indexingFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
      })
    );

    // Update embedding function with indexing Lambda ARN
    this.embeddingFunction.addEnvironment(
      'INDEXING_LAMBDA_ARN',
      this.indexingFunction.functionArn
    );

    // Grant embedding function permission to invoke indexing function
    this.indexingFunction.grantInvoke(this.embeddingFunction);

    // Search Service Lambda
    this.searchFunction = new lambda.Function(this, 'SearchFunction', {
      ...commonLambdaProps,
      functionName: `inquiry-growth-${envName}-search`,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Search Service - Event:', JSON.stringify(event));
          return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Search service placeholder' })
          };
        };
      `),
      description: 'Full-text search service',
    });

    // OpenSearch permissions (to be added when OpenSearch is configured)
    this.searchFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['es:*'],
        resources: ['*'],
      })
    );

    // Recommendation Service Lambda
    this.recommendationFunction = new lambda.Function(this, 'RecommendationFunction', {
      ...commonLambdaProps,
      functionName: `inquiry-growth-${envName}-recommendation`,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Recommendation Service - Event:', JSON.stringify(event));
          return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Recommendation service placeholder' })
          };
        };
      `),
      description: 'Personalized recommendation service',
    });

    contentTable.grantReadData(this.recommendationFunction);
    userProfilesTable.grantReadData(this.recommendationFunction);
    userEventsTable.grantReadData(this.recommendationFunction);

    // Event Service Lambda
    this.eventFunction = new lambda.Function(this, 'EventFunction', {
      ...commonLambdaProps,
      functionName: `inquiry-growth-${envName}-event`,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/events', {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash',
            '-c',
            'npm install && npm run build && cp -r dist/* /asset-output/ && cp -r node_modules /asset-output/',
          ],
        },
      }),
      description: 'Behavioral event tracking service with rate limiting',
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
    });

    kinesisStream.grantWrite(this.eventFunction);
    userEventsTable.grantReadWriteData(this.eventFunction);
    
    // CloudWatch permissions for custom metrics
    this.eventFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
      })
    );

    // ========================================
    // Event Processing Lambda with DLQ
    // ========================================

    // DLQ for Event Processing Lambda failures
    this.eventProcessingDLQ = new sqs.Queue(this, 'EventProcessingDLQ', {
      queueName: `inquiry-growth-${envName}-event-processing-dlq`,
      retentionPeriod: cdk.Duration.days(14), // Retain failed messages for 14 days
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    // Event Processing Lambda - Consumes from Kinesis and updates user metrics
    this.eventProcessingFunction = new lambda.Function(this, 'EventProcessingFunction', {
      ...commonLambdaProps,
      functionName: `inquiry-growth-${envName}-event-processing`,
      handler: 'process.handler',
      code: lambda.Code.fromAsset('lambda/events', {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash',
            '-c',
            'npm install && npm run build && cp -r dist/* /asset-output/ && cp -r node_modules /asset-output/',
          ],
        },
      }),
      description: 'Event processing service - updates user behavior metrics from Kinesis',
      timeout: cdk.Duration.seconds(60), // Longer timeout for batch processing
      memorySize: 512,
      reservedConcurrentExecutions: 10, // Limit concurrency to control DynamoDB write throughput
      retryAttempts: 2, // Retry failed invocations 2 times before sending to DLQ
    });

    // Grant permissions for event processing function
    userProfilesTable.grantReadWriteData(this.eventProcessingFunction);
    kinesisStream.grantRead(this.eventProcessingFunction);
    
    // CloudWatch permissions for custom metrics
    this.eventProcessingFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
      })
    );

    // Add Kinesis event source mapping with DLQ
    this.eventProcessingFunction.addEventSource(
      new lambdaEventSources.KinesisEventSource(kinesisStream, {
        batchSize: 100, // Process up to 100 records per batch
        maxBatchingWindow: cdk.Duration.seconds(5), // Wait up to 5 seconds to fill batch
        startingPosition: lambda.StartingPosition.LATEST,
        bisectBatchOnError: true, // Split batch on error to isolate failures
        retryAttempts: 3, // Retry failed batches 3 times
        maxRecordAge: cdk.Duration.hours(24), // Match Kinesis retention
        parallelizationFactor: 1, // Process one batch at a time per shard
        onFailure: new lambdaEventSources.SqsDlq(this.eventProcessingDLQ), // Send failed records to DLQ
        reportBatchItemFailures: true, // Enable partial batch failure reporting
      })
    );

    // Profile Service Lambda
    this.profileFunction = new lambda.Function(this, 'ProfileFunction', {
      ...commonLambdaProps,
      functionName: `inquiry-growth-${envName}-profile`,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Profile Service - Event:', JSON.stringify(event));
          return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Profile service placeholder' })
          };
        };
      `),
      description: 'User profile management service',
    });

    userProfilesTable.grantReadWriteData(this.profileFunction);

    // Authentication Lambda Functions
    // These functions handle user registration, login, logout, and token refresh

    // Register Function
    this.registerFunction = new lambda.Function(this, 'RegisterFunction', {
      ...commonLambdaProps,
      functionName: `inquiry-growth-${envName}-register`,
      handler: 'index.registerHandler',
      code: lambda.Code.fromAsset('lambda/auth', {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash',
            '-c',
            'npm install && npm run build && cp -r dist/* /asset-output/',
          ],
        },
      }),
      description: 'User registration service',
      environment: {
        ...commonLambdaProps.environment,
        RATE_LIMIT_TABLE: rateLimitTable.tableName,
        USER_POOL_ID: '', // Will be set by API stack
        USER_POOL_CLIENT_ID: '', // Will be set by API stack
        JWT_SECRET: 'inquiry-growth-jwt-secret-key-change-in-production', // Change in production
      },
    });

    rateLimitTable.grantReadWriteData(this.registerFunction);

    // Login Function
    this.loginFunction = new lambda.Function(this, 'LoginFunction', {
      ...commonLambdaProps,
      functionName: `inquiry-growth-${envName}-login`,
      handler: 'index.loginHandler',
      code: lambda.Code.fromAsset('lambda/auth', {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash',
            '-c',
            'npm install && npm run build && cp -r dist/* /asset-output/',
          ],
        },
      }),
      description: 'User login service',
      environment: {
        ...commonLambdaProps.environment,
        RATE_LIMIT_TABLE: rateLimitTable.tableName,
        USER_POOL_CLIENT_ID: '', // Will be set by API stack
        JWT_SECRET: 'inquiry-growth-jwt-secret-key-change-in-production', // Change in production
      },
    });

    rateLimitTable.grantReadWriteData(this.loginFunction);

    // Logout Function
    this.logoutFunction = new lambda.Function(this, 'LogoutFunction', {
      ...commonLambdaProps,
      functionName: `inquiry-growth-${envName}-logout`,
      handler: 'index.logoutHandler',
      code: lambda.Code.fromAsset('lambda/auth', {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash',
            '-c',
            'npm install && npm run build && cp -r dist/* /asset-output/',
          ],
        },
      }),
      description: 'User logout service',
      environment: {
        ...commonLambdaProps.environment,
        JWT_SECRET: 'inquiry-growth-jwt-secret-key-change-in-production', // Change in production
      },
    });

    // Refresh Token Function
    this.refreshFunction = new lambda.Function(this, 'RefreshFunction', {
      ...commonLambdaProps,
      functionName: `inquiry-growth-${envName}-refresh`,
      handler: 'index.refreshHandler',
      code: lambda.Code.fromAsset('lambda/auth', {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            'bash',
            '-c',
            'npm install && npm run build && cp -r dist/* /asset-output/',
          ],
        },
      }),
      description: 'Token refresh service',
      environment: {
        ...commonLambdaProps.environment,
        USER_POOL_CLIENT_ID: '', // Will be set by API stack
        JWT_SECRET: 'inquiry-growth-jwt-secret-key-change-in-production', // Change in production
      },
    });

    // Grant Cognito permissions to auth functions
    const cognitoPolicy = new iam.PolicyStatement({
      actions: [
        'cognito-idp:SignUp',
        'cognito-idp:InitiateAuth',
        'cognito-idp:GlobalSignOut',
        'cognito-idp:AdminSetUserPassword',
        'cognito-idp:AdminGetUser',
      ],
      resources: ['*'], // Will be scoped to specific user pool in API stack
    });

    this.registerFunction.addToRolePolicy(cognitoPolicy);
    this.loginFunction.addToRolePolicy(cognitoPolicy);
    this.logoutFunction.addToRolePolicy(cognitoPolicy);
    this.refreshFunction.addToRolePolicy(cognitoPolicy);

    // Outputs
    this.loginFunction.addToRolePolicy(cognitoPolicy);
    this.logoutFunction.addToRolePolicy(cognitoPolicy);
    this.refreshFunction.addToRolePolicy(cognitoPolicy);

    // Outputs
    new cdk.CfnOutput(this, 'ContentFunctionArn', {
      value: this.contentFunction.functionArn,
      description: 'Content function ARN',
      exportName: `${envName}-content-function-arn`,
    });

    new cdk.CfnOutput(this, 'EmbeddingFunctionArn', {
      value: this.embeddingFunction.functionArn,
      description: 'Embedding function ARN',
      exportName: `${envName}-embedding-function-arn`,
    });

    new cdk.CfnOutput(this, 'IndexingFunctionArn', {
      value: this.indexingFunction.functionArn,
      description: 'OpenSearch indexing function ARN',
      exportName: `${envName}-indexing-function-arn`,
    });

    new cdk.CfnOutput(this, 'SearchFunctionArn', {
      value: this.searchFunction.functionArn,
      description: 'Search function ARN',
      exportName: `${envName}-search-function-arn`,
    });

    new cdk.CfnOutput(this, 'RecommendationFunctionArn', {
      value: this.recommendationFunction.functionArn,
      description: 'Recommendation function ARN',
      exportName: `${envName}-recommendation-function-arn`,
    });

    new cdk.CfnOutput(this, 'EventFunctionArn', {
      value: this.eventFunction.functionArn,
      description: 'Event function ARN',
      exportName: `${envName}-event-function-arn`,
    });

    new cdk.CfnOutput(this, 'EventProcessingFunctionArn', {
      value: this.eventProcessingFunction.functionArn,
      description: 'Event processing function ARN',
      exportName: `${envName}-event-processing-function-arn`,
    });

    new cdk.CfnOutput(this, 'ProfileFunctionArn', {
      value: this.profileFunction.functionArn,
      description: 'Profile function ARN',
      exportName: `${envName}-profile-function-arn`,
    });

    new cdk.CfnOutput(this, 'RegisterFunctionArn', {
      value: this.registerFunction.functionArn,
      description: 'Register function ARN',
      exportName: `${envName}-register-function-arn`,
    });

    new cdk.CfnOutput(this, 'LoginFunctionArn', {
      value: this.loginFunction.functionArn,
      description: 'Login function ARN',
      exportName: `${envName}-login-function-arn`,
    });

    new cdk.CfnOutput(this, 'LogoutFunctionArn', {
      value: this.logoutFunction.functionArn,
      description: 'Logout function ARN',
      exportName: `${envName}-logout-function-arn`,
    });

    new cdk.CfnOutput(this, 'RefreshFunctionArn', {
      value: this.refreshFunction.functionArn,
      description: 'Refresh function ARN',
      exportName: `${envName}-refresh-function-arn`,
    });

    new cdk.CfnOutput(this, 'EmbeddingDLQUrl', {
      value: this.embeddingDLQ.queueUrl,
      description: 'Embedding DLQ URL',
      exportName: `${envName}-embedding-dlq-url`,
    });

    new cdk.CfnOutput(this, 'EmbeddingDLQArn', {
      value: this.embeddingDLQ.queueArn,
      description: 'Embedding DLQ ARN',
      exportName: `${envName}-embedding-dlq-arn`,
    });

    new cdk.CfnOutput(this, 'IndexingDLQUrl', {
      value: this.indexingDLQ.queueUrl,
      description: 'Indexing DLQ URL',
      exportName: `${envName}-indexing-dlq-url`,
    });

    new cdk.CfnOutput(this, 'IndexingDLQArn', {
      value: this.indexingDLQ.queueArn,
      description: 'Indexing DLQ ARN',
      exportName: `${envName}-indexing-dlq-arn`,
    });

    new cdk.CfnOutput(this, 'EventProcessingDLQUrl', {
      value: this.eventProcessingDLQ.queueUrl,
      description: 'Event Processing DLQ URL',
      exportName: `${envName}-event-processing-dlq-url`,
    });

    new cdk.CfnOutput(this, 'EventProcessingDLQArn', {
      value: this.eventProcessingDLQ.queueArn,
      description: 'Event Processing DLQ ARN',
      exportName: `${envName}-event-processing-dlq-arn`,
    });
  }
}
