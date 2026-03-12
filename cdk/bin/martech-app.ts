#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Route53Stack } from '../lib/route53-stack';

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

// Stack naming convention: castalia-martech-{env}
const stackPrefix = `castalia-martech-${envName}`;

// Route 53 Stack - DNS and SSL for martech.castalia.institute
const route53Stack = new Route53Stack(app, `${stackPrefix}-route53`, {
  env,
  stackName: `${stackPrefix}-route53`,
  description: 'Route 53 and SSL configuration for Castalia Marketing',
  envName,
  envConfig,
  hostedZoneName: 'castalia.institute',
  domainName: 'martech.castalia.institute',
});

app.synth();
