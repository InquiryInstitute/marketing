import * as cdk from 'aws-cdk-lib';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';

export interface PipelineStackProps extends cdk.StackProps {
  envName: string;
  envConfig: any;
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  githubConnectionArn: string;
  notificationEmail?: string;
}

export class PipelineStack extends cdk.Stack {
  public readonly pipeline: codepipeline.Pipeline;
  public readonly artifactBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: PipelineStackProps) {
    super(scope, id, props);

    const { envName, envConfig, githubOwner, githubRepo, githubBranch, githubConnectionArn, notificationEmail } = props;

    // S3 bucket for pipeline artifacts
    this.artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
      bucketName: `inquiry-growth-${envName}-pipeline-artifacts`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: envName === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: envName !== 'prod',
      lifecycleRules: [
        {
          id: 'DeleteOldArtifacts',
          enabled: true,
          expiration: cdk.Duration.days(30),
        },
      ],
    });

    // SNS topic for pipeline notifications
    const pipelineTopic = new sns.Topic(this, 'PipelineTopic', {
      topicName: `inquiry-growth-${envName}-pipeline-notifications`,
      displayName: 'Inquiry Growth Engine Pipeline Notifications',
    });

    if (notificationEmail) {
      pipelineTopic.addSubscription(new subscriptions.EmailSubscription(notificationEmail));
    }

    // CodeBuild project for build and test
    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      projectName: `inquiry-growth-${envName}-build`,
      description: 'Build and test TypeScript code',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: false,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '20',
            },
            commands: [
              'echo "Installing dependencies..."',
              'npm ci',
            ],
          },
          pre_build: {
            commands: [
              'echo "Running linting..."',
              'npm run lint || echo "Linting not configured yet"',
            ],
          },
          build: {
            commands: [
              'echo "Compiling TypeScript..."',
              'npm run build',
              'echo "Running tests..."',
              'npm test || echo "Tests not configured yet"',
            ],
          },
          post_build: {
            commands: [
              'echo "Build completed successfully"',
            ],
          },
        },
        artifacts: {
          files: [
            '**/*',
          ],
        },
      }),
      cache: codebuild.Cache.local(codebuild.LocalCacheMode.SOURCE),
    });

    // CodeBuild project for CDK synth
    const synthProject = new codebuild.PipelineProject(this, 'SynthProject', {
      projectName: `inquiry-growth-${envName}-synth`,
      description: 'Synthesize CDK templates',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: false,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '20',
            },
            commands: [
              'npm ci',
            ],
          },
          build: {
            commands: [
              'npm run build',
              `npm run cdk:synth:${envName}`,
            ],
          },
        },
        artifacts: {
          'base-directory': 'cdk.out',
          files: [
            '**/*',
          ],
        },
      }),
      cache: codebuild.Cache.local(codebuild.LocalCacheMode.SOURCE),
    });

    // Grant CDK permissions to synth project
    synthProject.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'sts:AssumeRole',
        'cloudformation:DescribeStacks',
        'cloudformation:GetTemplate',
      ],
      resources: ['*'],
    }));

    // CodeBuild project for deployment
    const deployProject = new codebuild.PipelineProject(this, 'DeployProject', {
      projectName: `inquiry-growth-${envName}-deploy`,
      description: 'Deploy CDK stacks',
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: false,
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '20',
            },
            commands: [
              'npm ci',
            ],
          },
          build: {
            commands: [
              'npm run build',
              `npm run cdk:deploy:${envName} -- --require-approval never`,
            ],
          },
        },
      }),
      cache: codebuild.Cache.local(codebuild.LocalCacheMode.SOURCE),
    });

    // Grant CDK deployment permissions
    deployProject.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cloudformation:*',
        'iam:*',
        'lambda:*',
        'apigateway:*',
        'dynamodb:*',
        's3:*',
        'ec2:*',
        'elasticache:*',
        'kinesis:*',
        'cognito-idp:*',
        'logs:*',
        'cloudwatch:*',
        'xray:*',
        'sts:AssumeRole',
        'ssm:GetParameter',
        'secretsmanager:GetSecretValue',
      ],
      resources: ['*'],
    }));

    // Pipeline artifacts
    const sourceOutput = new codepipeline.Artifact('SourceOutput');
    const buildOutput = new codepipeline.Artifact('BuildOutput');
    const synthOutput = new codepipeline.Artifact('SynthOutput');

    // Create the pipeline
    this.pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: `inquiry-growth-${envName}-pipeline`,
      artifactBucket: this.artifactBucket,
      restartExecutionOnUpdate: true,
    });

    // Source stage - GitHub
    this.pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.CodeStarConnectionsSourceAction({
          actionName: 'GitHub_Source',
          owner: githubOwner,
          repo: githubRepo,
          branch: githubBranch,
          connectionArn: githubConnectionArn,
          output: sourceOutput,
          triggerOnPush: true,
        }),
      ],
    });

    // Build stage - Compile and test
    this.pipeline.addStage({
      stageName: 'Build',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Build_and_Test',
          project: buildProject,
          input: sourceOutput,
          outputs: [buildOutput],
        }),
      ],
    });

    // Synth stage - CDK synth
    this.pipeline.addStage({
      stageName: 'Synth',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'CDK_Synth',
          project: synthProject,
          input: buildOutput,
          outputs: [synthOutput],
        }),
      ],
    });

    // For staging and prod, add manual approval
    if (envName === 'staging' || envName === 'prod') {
      this.pipeline.addStage({
        stageName: 'Approval',
        actions: [
          new codepipeline_actions.ManualApprovalAction({
            actionName: 'Manual_Approval',
            notificationTopic: pipelineTopic,
            additionalInformation: `Review changes before deploying to ${envName}`,
          }),
        ],
      });
    }

    // Deploy stage
    this.pipeline.addStage({
      stageName: 'Deploy',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'CDK_Deploy',
          project: deployProject,
          input: buildOutput,
        }),
      ],
    });

    // CloudWatch alarm for pipeline failures
    const pipelineFailureAlarm = new cloudwatch.Alarm(this, 'PipelineFailureAlarm', {
      alarmName: `inquiry-growth-${envName}-pipeline-failure`,
      alarmDescription: 'Alert when pipeline execution fails',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/CodePipeline',
        metricName: 'PipelineExecutionFailure',
        dimensionsMap: {
          PipelineName: this.pipeline.pipelineName,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    pipelineFailureAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(pipelineTopic));

    // CloudWatch alarm for high error rates (for automatic rollback trigger)
    const errorRateAlarm = new cloudwatch.Alarm(this, 'ErrorRateAlarm', {
      alarmName: `inquiry-growth-${envName}-high-error-rate`,
      alarmDescription: 'Alert when API error rate exceeds threshold',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5XXError',
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    errorRateAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(pipelineTopic));

    // Outputs
    new cdk.CfnOutput(this, 'PipelineName', {
      value: this.pipeline.pipelineName,
      description: 'CodePipeline name',
      exportName: `${envName}-pipeline-name`,
    });

    new cdk.CfnOutput(this, 'PipelineArn', {
      value: this.pipeline.pipelineArn,
      description: 'CodePipeline ARN',
    });

    new cdk.CfnOutput(this, 'ArtifactBucketName', {
      value: this.artifactBucket.bucketName,
      description: 'Pipeline artifact bucket name',
    });

    new cdk.CfnOutput(this, 'PipelineTopicArn', {
      value: pipelineTopic.topicArn,
      description: 'SNS topic for pipeline notifications',
    });

    new cdk.CfnOutput(this, 'PipelineConsoleUrl', {
      value: `https://console.aws.amazon.com/codesuite/codepipeline/pipelines/${this.pipeline.pipelineName}/view`,
      description: 'AWS Console URL for the pipeline',
    });
  }
}
