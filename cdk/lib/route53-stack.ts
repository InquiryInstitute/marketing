import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface Route53StackProps extends cdk.StackProps {
  envName: string;
  envConfig: any;
  hostedZoneName: string;
  domainName: string;
}

export class Route53Stack extends cdk.Stack {
  public readonly hostedZone: route53.IHostedZone;
  public readonly certificate: acm.Certificate;
  public readonly distribution: cloudfront.CloudFrontWebDistribution;

  constructor(scope: Construct, id: string, props: Route53StackProps) {
    super(scope, id, props);

    const { envName, envConfig, hostedZoneName, domainName } = props;

    // ========================================
    // Hosted Zone
    // ========================================

    // Check if hosted zone exists (import if it does)
    const existingZone = route53.HostedZone.fromHostedZoneAttributes(this, 'ExistingHostedZone', {
      hostedZoneId: envConfig.hostedZoneId || 'UNKNOWN',
      zoneName: hostedZoneName,
    });

    // Create hosted zone if it doesn't exist
    this.hostedZone = envConfig.hostedZoneId
      ? existingZone
      : new route53.HostedZone(this, 'HostedZone', {
          zoneName: hostedZoneName,
        });

    // ========================================
    // SSL Certificate
    // ========================================

    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: domainName,
      subjectAlternativeNames: [`*.${hostedZoneName}`],
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
      certificateName: `castalia-${envName}-certificate`,
    });

    // ========================================
    // S3 Bucket for Static Site
    // ========================================

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: domainName,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      publicReadAccess: true,
      removalPolicy: envName === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: envName !== 'prod',
    });

    // ========================================
    // CloudFront Distribution
    // ========================================

    this.distribution = new cloudfront.CloudFrontWebDistribution(this, 'Distribution', {
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: siteBucket,
          },
          behaviors: [{ isDefaultBehavior: true }],
        },
      ],
      errorConfigurations: [
        {
          errorCode: 404,
          responseCode: 200,
          responsePagePath: '/index.html',
        },
        {
          errorCode: 403,
          responseCode: 200,
          responsePagePath: '/index.html',
        },
      ],
      viewerCertificate: cloudfront.ViewerCertificate.fromAcmCertificate(
        this.certificate,
        {
          aliases: [domainName, `www.${domainName}`],
          securityPolicy: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
          sslMethod: cloudfront.SslMethod.SNI,
        }
      ),
    });

    // ========================================
    // DNS Records
    // ========================================

    // A record for root domain
    new route53.ARecord(this, 'RootDomainRecord', {
      zone: this.hostedZone,
      recordName: domainName,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
    });

    // A record for www subdomain
    new route53.ARecord(this, 'WwwDomainRecord', {
      zone: this.hostedZone,
      recordName: `www.${domainName}`,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
    });

    // ========================================
    // Outputs
    // ========================================

    new cdk.CfnOutput(this, 'SiteBucketName', {
      value: siteBucket.bucketName,
      description: 'S3 Bucket Name for Static Site',
      exportName: `${envName}-site-bucket-name`,
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront Distribution ID',
      exportName: `${envName}-cloudfront-distribution-id`,
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionDomain', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront Distribution Domain Name',
      exportName: `${envName}-cloudfront-distribution-domain`,
    });

    new cdk.CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description: 'SSL Certificate ARN',
      exportName: `${envName}-certificate-arn`,
    });

    new cdk.CfnOutput(this, 'HostedZoneId', {
      value: this.hostedZone.hostedZoneId,
      description: 'Route 53 Hosted Zone ID',
      exportName: `${envName}-hosted-zone-id`,
    });

    new cdk.CfnOutput(this, 'SiteUrl', {
      value: `https://${domainName}`,
      description: 'Site URL',
    });
  }
}
