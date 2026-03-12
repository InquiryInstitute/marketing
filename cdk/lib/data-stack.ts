import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as opensearchserverless from 'aws-cdk-lib/aws-opensearchserverless';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface DataStackProps extends cdk.StackProps {
  envName: string;
  envConfig: any;
  vpc: ec2.Vpc;
  redisSecurityGroup: ec2.SecurityGroup;
}

export class DataStack extends cdk.Stack {
  public readonly contentTable: dynamodb.Table;
  public readonly userProfilesTable: dynamodb.Table;
  public readonly userEventsTable: dynamodb.Table;
  public readonly rateLimitTable: dynamodb.Table;
  public readonly contentBucket: s3.Bucket;
  public readonly eventArchiveBucket: s3.Bucket;
  public readonly contentDistribution: cloudfront.Distribution;
  public readonly kinesisStream: kinesis.Stream;
  public readonly cacheCluster: elasticache.CfnCacheCluster;
  public readonly openSearchCollection: opensearchserverless.CfnCollection;
  public readonly openSearchCollectionEndpoint: string;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    const { envName, envConfig, vpc, redisSecurityGroup } = props;

    // DynamoDB Table: Content
    this.contentTable = new dynamodb.Table(this, 'ContentTable', {
      tableName: `inquiry-growth-${envName}-content`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: envName === 'prod',
      removalPolicy: envName === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // GSI: domain-publishedAt-index
    this.contentTable.addGlobalSecondaryIndex({
      indexName: 'domain-publishedAt-index',
      partitionKey: { name: 'domain', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'publishedAt', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // DynamoDB Table: User Profiles
    this.userProfilesTable = new dynamodb.Table(this, 'UserProfilesTable', {
      tableName: `inquiry-growth-${envName}-user-profiles`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: envName === 'prod',
      removalPolicy: envName === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // DynamoDB Table: User Events
    this.userEventsTable = new dynamodb.Table(this, 'UserEventsTable', {
      tableName: `inquiry-growth-${envName}-user-events`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'ttl',
      pointInTimeRecovery: envName === 'prod',
      removalPolicy: envName === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // GSI: sessionId-timestamp-index
    this.userEventsTable.addGlobalSecondaryIndex({
      indexName: 'sessionId-timestamp-index',
      partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // DynamoDB Table: Rate Limits
    // Used for authentication rate limiting and account lockout
    this.rateLimitTable = new dynamodb.Table(this, 'RateLimitTable', {
      tableName: `inquiry-growth-${envName}-rate-limits`,
      partitionKey: { name: 'identifier', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'ttl',
      removalPolicy: envName === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // S3 Bucket: Content Assets
    this.contentBucket = new s3.Bucket(this, 'ContentBucket', {
      bucketName: `inquiry-growth-${envName}-content-assets`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      removalPolicy: envName === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: envName !== 'prod',
    });

    // S3 Bucket: Event Archive
    this.eventArchiveBucket = new s3.Bucket(this, 'EventArchiveBucket', {
      bucketName: `inquiry-growth-${envName}-event-archive`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      lifecycleRules: [
        {
          id: 'TransitionToGlacier',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ],
      removalPolicy: envName === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: envName !== 'prod',
    });

    // CloudFront Distribution for Content Assets
    this.contentDistribution = new cloudfront.Distribution(this, 'ContentDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.contentBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      comment: `Content assets CDN for ${envName}`,
      enabled: true,
    });

    // Kinesis Stream: Event Stream
    // Configured for real-time event ingestion with 24-hour retention
    this.kinesisStream = new kinesis.Stream(this, 'EventStream', {
      streamName: `inquiry-growth-${envName}-events`,
      shardCount: 1,
      retentionPeriod: cdk.Duration.hours(24), // 24-hour retention as per requirements
      encryption: kinesis.StreamEncryption.MANAGED,
      // CloudWatch metrics are enabled by default for Kinesis streams
      // Metrics include: IncomingBytes, IncomingRecords, OutgoingBytes, OutgoingRecords,
      // WriteProvisionedThroughputExceeded, ReadProvisionedThroughputExceeded, etc.
    });

    // ElastiCache Redis: Cache Cluster
    // Create parameter group for allkeys-lru eviction policy
    const cacheParameterGroup = new elasticache.CfnParameterGroup(this, 'CacheParameterGroup', {
      cacheParameterGroupFamily: 'redis7',
      description: 'Parameter group for Redis cache with allkeys-lru eviction',
      properties: {
        'maxmemory-policy': 'allkeys-lru', // Evict any key using LRU when memory limit reached
      },
    });

    const cacheSubnetGroup = new elasticache.CfnSubnetGroup(this, 'CacheSubnetGroup', {
      description: 'Subnet group for Redis cache',
      subnetIds: vpc.privateSubnets.map(subnet => subnet.subnetId),
      cacheSubnetGroupName: `inquiry-growth-${envName}-cache`,
    });

    this.cacheCluster = new elasticache.CfnCacheCluster(this, 'CacheCluster', {
      cacheNodeType: 'cache.t3.micro',
      engine: 'redis',
      engineVersion: '7.1',
      numCacheNodes: 1,
      clusterName: `inquiry-growth-${envName}-cache`,
      cacheSubnetGroupName: cacheSubnetGroup.cacheSubnetGroupName,
      vpcSecurityGroupIds: [redisSecurityGroup.securityGroupId],
      cacheParameterGroupName: cacheParameterGroup.ref,
      // Disable persistence (cache-only mode)
      snapshotRetentionLimit: 0, // No snapshots
      // Note: AOF persistence is disabled by default for cache.t3.micro
      preferredMaintenanceWindow: 'sun:05:00-sun:06:00',
      autoMinorVersionUpgrade: true,
    });

    this.cacheCluster.addDependency(cacheSubnetGroup);
    this.cacheCluster.addDependency(cacheParameterGroup);

    // OpenSearch Serverless: Content Search and Vector Similarity
    // Create encryption policy
    const encryptionPolicy = new opensearchserverless.CfnSecurityPolicy(this, 'OpenSearchEncryptionPolicy', {
      name: `inquiry-growth-${envName}-encryption`,
      type: 'encryption',
      policy: JSON.stringify({
        Rules: [
          {
            ResourceType: 'collection',
            Resource: [`collection/inquiry-growth-${envName}-content`]
          }
        ],
        AWSOwnedKey: true
      })
    });

    // Create network policy for VPC access
    const networkPolicy = new opensearchserverless.CfnSecurityPolicy(this, 'OpenSearchNetworkPolicy', {
      name: `inquiry-growth-${envName}-network`,
      type: 'network',
      policy: JSON.stringify([
        {
          Rules: [
            {
              ResourceType: 'collection',
              Resource: [`collection/inquiry-growth-${envName}-content`]
            },
            {
              ResourceType: 'dashboard',
              Resource: [`collection/inquiry-growth-${envName}-content`]
            }
          ],
          AllowFromPublic: false,
          SourceVPCEs: [] // Will be configured for Lambda VPC access
        }
      ])
    });

    // Create data access policy (will be updated with Lambda role ARNs later)
    const dataAccessPolicy = new opensearchserverless.CfnAccessPolicy(this, 'OpenSearchDataAccessPolicy', {
      name: `inquiry-growth-${envName}-data-access`,
      type: 'data',
      policy: JSON.stringify([
        {
          Rules: [
            {
              ResourceType: 'collection',
              Resource: [`collection/inquiry-growth-${envName}-content`],
              Permission: [
                'aoss:CreateCollectionItems',
                'aoss:UpdateCollectionItems',
                'aoss:DescribeCollectionItems'
              ]
            },
            {
              ResourceType: 'index',
              Resource: [`index/inquiry-growth-${envName}-content/*`],
              Permission: [
                'aoss:CreateIndex',
                'aoss:UpdateIndex',
                'aoss:DescribeIndex',
                'aoss:ReadDocument',
                'aoss:WriteDocument'
              ]
            }
          ],
          Principal: [
            // Account root - will be refined with specific Lambda roles in compute stack
            `arn:aws:iam::${this.account}:root`
          ]
        }
      ])
    });

    // Create OpenSearch Serverless collection
    this.openSearchCollection = new opensearchserverless.CfnCollection(this, 'OpenSearchCollection', {
      name: `inquiry-growth-${envName}-content`,
      type: 'SEARCH', // SEARCH type supports both full-text and vector search
      description: `Content search and vector similarity for ${envName} environment`,
    });

    this.openSearchCollection.addDependency(encryptionPolicy);
    this.openSearchCollection.addDependency(networkPolicy);
    this.openSearchCollection.addDependency(dataAccessPolicy);

    // Store the collection endpoint for use by Lambda functions
    this.openSearchCollectionEndpoint = this.openSearchCollection.attrCollectionEndpoint;

    // Outputs
    new cdk.CfnOutput(this, 'ContentTableName', {
      value: this.contentTable.tableName,
      description: 'Content DynamoDB table name',
      exportName: `${envName}-content-table`,
    });

    new cdk.CfnOutput(this, 'UserProfilesTableName', {
      value: this.userProfilesTable.tableName,
      description: 'User Profiles DynamoDB table name',
      exportName: `${envName}-user-profiles-table`,
    });

    new cdk.CfnOutput(this, 'UserEventsTableName', {
      value: this.userEventsTable.tableName,
      description: 'User Events DynamoDB table name',
      exportName: `${envName}-user-events-table`,
    });

    new cdk.CfnOutput(this, 'RateLimitTableName', {
      value: this.rateLimitTable.tableName,
      description: 'Rate Limit DynamoDB table name',
      exportName: `${envName}-rate-limit-table`,
    });

    new cdk.CfnOutput(this, 'ContentBucketName', {
      value: this.contentBucket.bucketName,
      description: 'Content assets S3 bucket name',
      exportName: `${envName}-content-bucket`,
    });

    new cdk.CfnOutput(this, 'EventArchiveBucketName', {
      value: this.eventArchiveBucket.bucketName,
      description: 'Event archive S3 bucket name',
      exportName: `${envName}-event-archive-bucket`,
    });

    new cdk.CfnOutput(this, 'ContentDistributionDomain', {
      value: this.contentDistribution.distributionDomainName,
      description: 'CloudFront distribution domain for content assets',
      exportName: `${envName}-content-cdn-domain`,
    });

    new cdk.CfnOutput(this, 'ContentDistributionId', {
      value: this.contentDistribution.distributionId,
      description: 'CloudFront distribution ID',
      exportName: `${envName}-content-cdn-id`,
    });

    new cdk.CfnOutput(this, 'KinesisStreamName', {
      value: this.kinesisStream.streamName,
      description: 'Event Kinesis stream name',
      exportName: `${envName}-kinesis-stream`,
    });

    new cdk.CfnOutput(this, 'CacheEndpoint', {
      value: this.cacheCluster.attrRedisEndpointAddress,
      description: 'Redis cache endpoint',
      exportName: `${envName}-cache-endpoint`,
    });

    new cdk.CfnOutput(this, 'CachePort', {
      value: this.cacheCluster.attrRedisEndpointPort,
      description: 'Redis cache port',
      exportName: `${envName}-cache-port`,
    });

    new cdk.CfnOutput(this, 'OpenSearchCollectionEndpoint', {
      value: this.openSearchCollectionEndpoint,
      description: 'OpenSearch Serverless collection endpoint',
      exportName: `${envName}-opensearch-endpoint`,
    });

    new cdk.CfnOutput(this, 'OpenSearchCollectionArn', {
      value: this.openSearchCollection.attrArn,
      description: 'OpenSearch Serverless collection ARN',
      exportName: `${envName}-opensearch-arn`,
    });

    new cdk.CfnOutput(this, 'OpenSearchCollectionId', {
      value: this.openSearchCollection.attrId,
      description: 'OpenSearch Serverless collection ID',
      exportName: `${envName}-opensearch-id`,
    });
  }
}
