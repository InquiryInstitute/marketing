import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface NetworkStackProps extends cdk.StackProps {
  envName: string;
  envConfig: any;
}

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;
  public readonly openSearchSecurityGroup: ec2.SecurityGroup;
  public readonly redisSecurityGroup: ec2.SecurityGroup;
  public readonly dataSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { envName, envConfig } = props;

    // VPC with public and private subnets across 3 AZs
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `inquiry-growth-${envName}-vpc`,
      ipAddresses: ec2.IpAddresses.cidr(envConfig.vpcCidr || '10.0.0.0/16'),
      maxAzs: 3, // High availability across 3 AZs
      natGateways: envConfig.enableNatGateway ? 3 : 0, // One NAT Gateway per AZ for HA
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: envConfig.enableNatGateway 
            ? ec2.SubnetType.PRIVATE_WITH_EGRESS 
            : ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // Security group for Lambda functions
    this.lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: `inquiry-growth-${envName}-lambda-sg`,
      description: 'Security group for Lambda functions with least-privilege access',
      allowAllOutbound: true, // Lambda needs internet access via NAT Gateway
    });

    // Security group for OpenSearch Serverless
    this.openSearchSecurityGroup = new ec2.SecurityGroup(this, 'OpenSearchSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: `inquiry-growth-${envName}-opensearch-sg`,
      description: 'Security group for OpenSearch Serverless',
      allowAllOutbound: false,
    });

    // Allow Lambda to access OpenSearch on HTTPS (port 443)
    this.openSearchSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(443),
      'Allow Lambda HTTPS access to OpenSearch'
    );

    // Security group for Redis (ElastiCache)
    this.redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: `inquiry-growth-${envName}-redis-sg`,
      description: 'Security group for ElastiCache Redis',
      allowAllOutbound: false,
    });

    // Allow Lambda to access Redis on port 6379
    this.redisSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(6379),
      'Allow Lambda access to Redis'
    );

    // Security group for data layer (general purpose)
    this.dataSecurityGroup = new ec2.SecurityGroup(this, 'DataSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: `inquiry-growth-${envName}-data-sg`,
      description: 'Security group for data layer resources',
      allowAllOutbound: false,
    });

    // Allow Lambda to access data layer
    this.dataSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.allTraffic(),
      'Allow Lambda access to data layer'
    );

    // VPC Endpoints for AWS services (reduce NAT Gateway costs)
    // Gateway endpoints (no additional cost)
    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });

    this.vpc.addGatewayEndpoint('DynamoDBEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });

    // Outputs
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: `${envName}-vpc-id`,
    });

    new cdk.CfnOutput(this, 'VpcCidr', {
      value: this.vpc.vpcCidrBlock,
      description: 'VPC CIDR block',
    });

    new cdk.CfnOutput(this, 'LambdaSecurityGroupId', {
      value: this.lambdaSecurityGroup.securityGroupId,
      description: 'Lambda Security Group ID',
      exportName: `${envName}-lambda-sg-id`,
    });

    new cdk.CfnOutput(this, 'OpenSearchSecurityGroupId', {
      value: this.openSearchSecurityGroup.securityGroupId,
      description: 'OpenSearch Security Group ID',
      exportName: `${envName}-opensearch-sg-id`,
    });

    new cdk.CfnOutput(this, 'RedisSecurityGroupId', {
      value: this.redisSecurityGroup.securityGroupId,
      description: 'Redis Security Group ID',
      exportName: `${envName}-redis-sg-id`,
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value: this.vpc.privateSubnets.map(subnet => subnet.subnetId).join(','),
      description: 'Private Subnet IDs',
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value: this.vpc.publicSubnets.map(subnet => subnet.subnetId).join(','),
      description: 'Public Subnet IDs',
    });

    new cdk.CfnOutput(this, 'AvailabilityZones', {
      value: this.vpc.availabilityZones.join(','),
      description: 'Availability Zones',
    });
  }
}
