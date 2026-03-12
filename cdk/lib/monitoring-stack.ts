import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface MonitoringStackProps extends cdk.StackProps {
  envName: string;
  envConfig: any;
  api: apigateway.RestApi;
  contentFunction: lambda.Function;
  embeddingFunction: lambda.Function;
  indexingFunction: lambda.Function;
  searchFunction: lambda.Function;
  recommendationFunction: lambda.Function;
  eventFunction: lambda.Function;
  profileFunction: lambda.Function;
  contentTable: dynamodb.Table;
  userProfilesTable: dynamodb.Table;
  userEventsTable: dynamodb.Table;
  kinesisStream: kinesis.Stream;
  contentBucket: s3.Bucket;
  eventArchiveBucket: s3.Bucket;
  embeddingDLQ: sqs.Queue;
  indexingDLQ: sqs.Queue;
  pagerDutyIntegrationUrl?: string; // Optional PagerDuty integration URL
}

export class MonitoringStack extends cdk.Stack {
  public readonly alarmTopic: sns.Topic;
  public readonly dashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const {
      envName,
      envConfig,
      api,
      contentFunction,
      embeddingFunction,
      indexingFunction,
      searchFunction,
      recommendationFunction,
      eventFunction,
      profileFunction,
      contentTable,
      userProfilesTable,
      userEventsTable,
      kinesisStream,
      contentBucket,
      eventArchiveBucket,
      embeddingDLQ,
      indexingDLQ,
      pagerDutyIntegrationUrl,
    } = props;

    // ========================================
    // SNS Topics for Alarms
    // ========================================

    // Critical alarms topic (for PagerDuty integration)
    this.alarmTopic = new sns.Topic(this, 'CriticalAlarmTopic', {
      topicName: `inquiry-growth-${envName}-critical-alarms`,
      displayName: 'Inquiry Growth Engine Critical Alarms',
    });

    // Warning alarms topic (for email notifications)
    const warningAlarmTopic = new sns.Topic(this, 'WarningAlarmTopic', {
      topicName: `inquiry-growth-${envName}-warning-alarms`,
      displayName: 'Inquiry Growth Engine Warning Alarms',
    });

    // PagerDuty integration via HTTPS subscription
    if (pagerDutyIntegrationUrl) {
      this.alarmTopic.addSubscription(
        new sns_subscriptions.UrlSubscription(pagerDutyIntegrationUrl, {
          protocol: sns.SubscriptionProtocol.HTTPS,
        })
      );
    }

    // ========================================
    // CloudWatch Dashboard
    // ========================================

    this.dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `inquiry-growth-${envName}-system-health`,
    });

    // ========================================
    // API Gateway Metrics & Alarms
    // ========================================

    const apiRequestMetric = new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: 'Count',
      dimensionsMap: {
        ApiName: api.restApiName,
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const api4xxErrorMetric = new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '4XXError',
      dimensionsMap: {
        ApiName: api.restApiName,
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const api5xxErrorMetric = new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '5XXError',
      dimensionsMap: {
        ApiName: api.restApiName,
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });

    const apiLatencyMetric = new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: 'Latency',
      dimensionsMap: {
        ApiName: api.restApiName,
      },
      statistic: 'p95',
      period: cdk.Duration.minutes(5),
    });

    // API Error Rate Alarm (>1% error rate triggers critical alert)
    const apiErrorRateAlarm = new cloudwatch.Alarm(this, 'ApiErrorRateAlarm', {
      alarmName: `${envName}-api-error-rate-critical`,
      alarmDescription: 'API error rate exceeds 1% - Critical',
      metric: new cloudwatch.MathExpression({
        expression: '(errors / requests) * 100',
        usingMetrics: {
          errors: api5xxErrorMetric,
          requests: apiRequestMetric,
        },
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1, // 1% error rate
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    apiErrorRateAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));

    // API Latency Alarm (p95 > 1 second)
    const apiLatencyAlarm = new cloudwatch.Alarm(this, 'ApiLatencyAlarm', {
      alarmName: `${envName}-api-latency-p95`,
      alarmDescription: 'API latency p95 exceeds 1 second',
      metric: apiLatencyMetric,
      threshold: 1000, // 1 second in milliseconds
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    apiLatencyAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(warningAlarmTopic));

    // ========================================
    // Lambda Metrics & Alarms
    // ========================================

    const functions = [
      { name: 'Content', func: contentFunction },
      { name: 'Embedding', func: embeddingFunction },
      { name: 'Indexing', func: indexingFunction },
      { name: 'Search', func: searchFunction },
      { name: 'Recommendation', func: recommendationFunction },
      { name: 'Event', func: eventFunction },
      { name: 'Profile', func: profileFunction },
    ];

    functions.forEach(({ name, func }) => {
      // Lambda Error Alarm
      const errorAlarm = new cloudwatch.Alarm(this, `${name}ErrorAlarm`, {
        alarmName: `${envName}-${name.toLowerCase()}-errors`,
        alarmDescription: `${name} Lambda function error count exceeds threshold`,
        metric: func.metricErrors({
          period: cdk.Duration.minutes(5),
        }),
        threshold: 10,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      errorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));

      // Lambda Throttle Alarm
      const throttleAlarm = new cloudwatch.Alarm(this, `${name}ThrottleAlarm`, {
        alarmName: `${envName}-${name.toLowerCase()}-throttles`,
        alarmDescription: `${name} Lambda function is being throttled`,
        metric: func.metricThrottles({
          period: cdk.Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      throttleAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(warningAlarmTopic));

      // Lambda Duration Alarm (p95 > 5 seconds indicates performance issues)
      const durationAlarm = new cloudwatch.Alarm(this, `${name}DurationAlarm`, {
        alarmName: `${envName}-${name.toLowerCase()}-duration`,
        alarmDescription: `${name} Lambda function duration p95 exceeds 5 seconds`,
        metric: func.metricDuration({
          statistic: 'p95',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 5000, // 5 seconds in milliseconds
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      durationAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(warningAlarmTopic));
    });

    // ========================================
    // Embedding Pipeline Specific Alarms
    // ========================================

    // Embedding Failure Rate Alarm (> 5%)
    const embeddingFailureRateAlarm = new cloudwatch.Alarm(this, 'EmbeddingFailureRateAlarm', {
      alarmName: `${envName}-embedding-failure-rate`,
      alarmDescription: 'Embedding generation failure rate exceeds 5%',
      metric: new cloudwatch.MathExpression({
        expression: '(errors / invocations) * 100',
        usingMetrics: {
          errors: embeddingFunction.metricErrors({ period: cdk.Duration.minutes(5) }),
          invocations: embeddingFunction.metricInvocations({ period: cdk.Duration.minutes(5) }),
        },
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5, // 5% failure rate
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    embeddingFailureRateAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));

    // Indexing Failure Rate Alarm (> 5%)
    const indexingFailureRateAlarm = new cloudwatch.Alarm(this, 'IndexingFailureRateAlarm', {
      alarmName: `${envName}-indexing-failure-rate`,
      alarmDescription: 'OpenSearch indexing failure rate exceeds 5%',
      metric: new cloudwatch.MathExpression({
        expression: '(errors / invocations) * 100',
        usingMetrics: {
          errors: indexingFunction.metricErrors({ period: cdk.Duration.minutes(5) }),
          invocations: indexingFunction.metricInvocations({ period: cdk.Duration.minutes(5) }),
        },
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5, // 5% failure rate
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    indexingFailureRateAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));

    // Embedding Latency Alarm (p95 > 15 seconds)
    const embeddingLatencyAlarm = new cloudwatch.Alarm(this, 'EmbeddingLatencyAlarm', {
      alarmName: `${envName}-embedding-latency-p95`,
      alarmDescription: 'Embedding generation latency p95 exceeds 15 seconds',
      metric: embeddingFunction.metricDuration({
        statistic: 'p95',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 15000, // 15 seconds in milliseconds
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    embeddingLatencyAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(warningAlarmTopic));

    // Indexing Latency Alarm (p95 > 10 seconds)
    const indexingLatencyAlarm = new cloudwatch.Alarm(this, 'IndexingLatencyAlarm', {
      alarmName: `${envName}-indexing-latency-p95`,
      alarmDescription: 'OpenSearch indexing latency p95 exceeds 10 seconds',
      metric: indexingFunction.metricDuration({
        statistic: 'p95',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10000, // 10 seconds in milliseconds
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    indexingLatencyAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(warningAlarmTopic));

    // Embedding DLQ Message Count Alarm (> 0 messages)
    const embeddingDLQAlarm = new cloudwatch.Alarm(this, 'EmbeddingDLQAlarm', {
      alarmName: `${envName}-embedding-dlq-messages`,
      alarmDescription: 'Embedding DLQ has messages - permanent failures detected',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/SQS',
        metricName: 'ApproximateNumberOfMessagesVisible',
        dimensionsMap: {
          QueueName: embeddingDLQ.queueName,
        },
        statistic: 'Maximum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    embeddingDLQAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));

    // Indexing DLQ Message Count Alarm (> 0 messages)
    const indexingDLQAlarm = new cloudwatch.Alarm(this, 'IndexingDLQAlarm', {
      alarmName: `${envName}-indexing-dlq-messages`,
      alarmDescription: 'Indexing DLQ has messages - permanent failures detected',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/SQS',
        metricName: 'ApproximateNumberOfMessagesVisible',
        dimensionsMap: {
          QueueName: indexingDLQ.queueName,
        },
        statistic: 'Maximum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    indexingDLQAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));

    // ========================================
    // DynamoDB Metrics & Alarms
    // ========================================

    const tables = [
      { name: 'Content', table: contentTable },
      { name: 'UserProfiles', table: userProfilesTable },
      { name: 'UserEvents', table: userEventsTable },
    ];

    tables.forEach(({ name, table }) => {
      // DynamoDB Throttle Alarm
      const throttleAlarm = new cloudwatch.Alarm(this, `DynamoDB${name}ThrottleAlarm`, {
        alarmName: `${envName}-dynamodb-${name.toLowerCase()}-throttles`,
        alarmDescription: `DynamoDB ${name} table is being throttled`,
        metric: table.metricUserErrors({
          period: cdk.Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      throttleAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(warningAlarmTopic));

      // DynamoDB System Errors Alarm
      const systemErrorAlarm = new cloudwatch.Alarm(this, `DynamoDB${name}SystemErrorAlarm`, {
        alarmName: `${envName}-dynamodb-${name.toLowerCase()}-system-errors`,
        alarmDescription: `DynamoDB ${name} table has system errors`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/DynamoDB',
          metricName: 'SystemErrors',
          dimensionsMap: {
            TableName: table.tableName,
          },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 5,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      systemErrorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));
    });

    // ========================================
    // Kinesis Metrics & Alarms
    // ========================================

    // Kinesis Iterator Age Alarm (indicates processing lag)
    const kinesisIteratorAgeAlarm = new cloudwatch.Alarm(this, 'KinesisIteratorAgeAlarm', {
      alarmName: `${envName}-kinesis-iterator-age`,
      alarmDescription: 'Kinesis stream processing is lagging behind',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Kinesis',
        metricName: 'GetRecords.IteratorAgeMilliseconds',
        dimensionsMap: {
          StreamName: kinesisStream.streamName,
        },
        statistic: 'Maximum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 60000, // 1 minute lag
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    kinesisIteratorAgeAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(warningAlarmTopic));

    // Kinesis Write Throughput Exceeded Alarm
    const kinesisThrottleAlarm = new cloudwatch.Alarm(this, 'KinesisThrottleAlarm', {
      alarmName: `${envName}-kinesis-write-throttle`,
      alarmDescription: 'Kinesis stream write throughput exceeded',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Kinesis',
        metricName: 'WriteProvisionedThroughputExceeded',
        dimensionsMap: {
          StreamName: kinesisStream.streamName,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    kinesisThrottleAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));

    // ========================================
    // S3 Metrics & Alarms
    // ========================================

    // S3 4xx Error Alarm for content bucket
    const s3ErrorAlarm = new cloudwatch.Alarm(this, 'S3ContentBucket4xxAlarm', {
      alarmName: `${envName}-s3-content-4xx-errors`,
      alarmDescription: 'S3 content bucket has high 4xx error rate',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/S3',
        metricName: '4xxErrors',
        dimensionsMap: {
          BucketName: contentBucket.bucketName,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 50,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    s3ErrorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(warningAlarmTopic));

    // ========================================
    // Dashboard Widgets
    // ========================================

    // Row 1: API Gateway Overview
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway - Request Count',
        left: [apiRequestMetric],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway - Error Rates',
        left: [api4xxErrorMetric, api5xxErrorMetric],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway - Latency (p50, p95, p99)',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Latency',
            dimensionsMap: { ApiName: api.restApiName },
            statistic: 'p50',
            label: 'p50',
          }),
          apiLatencyMetric.with({ label: 'p95' }),
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Latency',
            dimensionsMap: { ApiName: api.restApiName },
            statistic: 'p99',
            label: 'p99',
          }),
        ],
        width: 8,
        height: 6,
      })
    );

    // Row 2: Lambda Functions Overview
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda - Invocations',
        left: functions.map(({ func, name }) =>
          func.metricInvocations().with({ label: name })
        ),
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda - Errors',
        left: functions.map(({ func, name }) =>
          func.metricErrors().with({ label: name })
        ),
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda - Duration (p95)',
        left: functions.map(({ func, name }) =>
          func.metricDuration({ statistic: 'p95' }).with({ label: name })
        ),
        width: 8,
        height: 6,
      })
    );

    // Row 3: Lambda Throttles and Concurrent Executions
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda - Throttles',
        left: functions.map(({ func, name }) =>
          func.metricThrottles().with({ label: name })
        ),
        width: 12,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda - Concurrent Executions',
        left: [
          lambda.Function.metricAllConcurrentExecutions({
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
        height: 6,
      })
    );

    // Row 4: DynamoDB Metrics
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB - Read Capacity Units',
        left: tables.map(({ table, name }) =>
          table.metricConsumedReadCapacityUnits().with({ label: name })
        ),
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB - Write Capacity Units',
        left: tables.map(({ table, name }) =>
          table.metricConsumedWriteCapacityUnits().with({ label: name })
        ),
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB - User Errors (Throttles)',
        left: tables.map(({ table, name }) =>
          table.metricUserErrors().with({ label: name })
        ),
        width: 8,
        height: 6,
      })
    );

    // Row 5: Kinesis Stream Metrics
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Kinesis - Incoming Records',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Kinesis',
            metricName: 'IncomingRecords',
            dimensionsMap: { StreamName: kinesisStream.streamName },
            statistic: 'Sum',
          }),
        ],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Kinesis - Iterator Age (Processing Lag)',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Kinesis',
            metricName: 'GetRecords.IteratorAgeMilliseconds',
            dimensionsMap: { StreamName: kinesisStream.streamName },
            statistic: 'Maximum',
          }),
        ],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Kinesis - Write Throughput Exceeded',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Kinesis',
            metricName: 'WriteProvisionedThroughputExceeded',
            dimensionsMap: { StreamName: kinesisStream.streamName },
            statistic: 'Sum',
          }),
        ],
        width: 8,
        height: 6,
      })
    );

    // Row 6: Embedding Pipeline Metrics
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Embedding Pipeline - Invocations',
        left: [
          embeddingFunction.metricInvocations().with({ label: 'Embedding' }),
          indexingFunction.metricInvocations().with({ label: 'Indexing' }),
        ],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Embedding Pipeline - Errors',
        left: [
          embeddingFunction.metricErrors().with({ label: 'Embedding' }),
          indexingFunction.metricErrors().with({ label: 'Indexing' }),
        ],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Embedding Pipeline - Duration (p95)',
        left: [
          embeddingFunction.metricDuration({ statistic: 'p95' }).with({ label: 'Embedding' }),
          indexingFunction.metricDuration({ statistic: 'p95' }).with({ label: 'Indexing' }),
        ],
        width: 8,
        height: 6,
      })
    );

    // Row 7: Embedding Pipeline DLQ and Custom Metrics
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Embedding Pipeline - DLQ Messages',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'ApproximateNumberOfMessagesVisible',
            dimensionsMap: { QueueName: embeddingDLQ.queueName },
            statistic: 'Maximum',
            label: 'Embedding DLQ',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'ApproximateNumberOfMessagesVisible',
            dimensionsMap: { QueueName: indexingDLQ.queueName },
            statistic: 'Maximum',
            label: 'Indexing DLQ',
          }),
        ],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Embedding Generation - Success Rate',
        left: [
          new cloudwatch.Metric({
            namespace: `InquiryGrowth/${envName}`,
            metricName: 'EmbeddingGenerationSuccess',
            dimensionsMap: {
              Environment: envName,
              Service: 'Embeddings',
            },
            statistic: 'Sum',
          }),
        ],
        width: 8,
        height: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Embedding Generation - Retry Count',
        left: [
          new cloudwatch.Metric({
            namespace: `InquiryGrowth/${envName}`,
            metricName: 'EmbeddingRetryCount',
            dimensionsMap: {
              Environment: envName,
              Service: 'Embeddings',
            },
            statistic: 'Sum',
          }),
        ],
        width: 8,
        height: 6,
      })
    );

    // Row 8: System Health Status
    this.dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'API Error Rate (%)',
        metrics: [
          new cloudwatch.MathExpression({
            expression: '(errors / requests) * 100',
            usingMetrics: {
              errors: api5xxErrorMetric,
              requests: apiRequestMetric,
            },
          }),
        ],
        width: 6,
        height: 4,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Total Lambda Errors',
        metrics: functions.map(({ func }) => func.metricErrors()),
        width: 6,
        height: 4,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'DynamoDB Throttles',
        metrics: tables.map(({ table }) => table.metricUserErrors()),
        width: 6,
        height: 4,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Kinesis Processing Lag (ms)',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/Kinesis',
            metricName: 'GetRecords.IteratorAgeMilliseconds',
            dimensionsMap: { StreamName: kinesisStream.streamName },
            statistic: 'Maximum',
          }),
        ],
        width: 6,
        height: 4,
      })
    );

    // ========================================
    // X-Ray Tracing Configuration
    // ========================================

    // Note: X-Ray tracing is already enabled on Lambda functions via tracing: lambda.Tracing.ACTIVE
    // in compute-stack.ts. API Gateway tracing is enabled via tracingEnabled: true in api-stack.ts.
    // This provides distributed tracing across all services.

    // Add X-Ray service map widget to dashboard
    this.dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `## X-Ray Distributed Tracing

X-Ray tracing is enabled for all Lambda functions and API Gateway.

**View Service Map:**
- [X-Ray Service Map](https://console.aws.amazon.com/xray/home?region=${this.region}#/service-map)
- [X-Ray Traces](https://console.aws.amazon.com/xray/home?region=${this.region}#/traces)

**Key Features:**
- End-to-end request tracing
- Service dependency visualization
- Performance bottleneck identification
- Error and fault analysis`,
        width: 24,
        height: 4,
      })
    );

    // ========================================
    // Outputs
    // ========================================

    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.dashboard.dashboardName}`,
      description: 'CloudWatch Dashboard URL',
    });

    new cdk.CfnOutput(this, 'CriticalAlarmTopicArn', {
      value: this.alarmTopic.topicArn,
      description: 'SNS Topic ARN for critical alarms (PagerDuty)',
      exportName: `${envName}-critical-alarm-topic-arn`,
    });

    new cdk.CfnOutput(this, 'WarningAlarmTopicArn', {
      value: warningAlarmTopic.topicArn,
      description: 'SNS Topic ARN for warning alarms',
      exportName: `${envName}-warning-alarm-topic-arn`,
    });

    new cdk.CfnOutput(this, 'XRayServiceMapUrl', {
      value: `https://console.aws.amazon.com/xray/home?region=${this.region}#/service-map`,
      description: 'X-Ray Service Map URL',
    });

    new cdk.CfnOutput(this, 'XRayTracesUrl', {
      value: `https://console.aws.amazon.com/xray/home?region=${this.region}#/traces`,
      description: 'X-Ray Traces URL',
    });
  }
}
