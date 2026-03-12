import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface ApiStackProps extends cdk.StackProps {
  envName: string;
  envConfig: any;
  contentFunction: lambda.Function;
  searchFunction: lambda.Function;
  recommendationFunction: lambda.Function;
  eventFunction: lambda.Function;
  profileFunction: lambda.Function;
  registerFunction: lambda.Function;
  loginFunction: lambda.Function;
  logoutFunction: lambda.Function;
  refreshFunction: lambda.Function;
  userPoolId?: string;
  userPoolClientId?: string;
}

export class ApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const {
      envName,
      envConfig,
      contentFunction,
      searchFunction,
      recommendationFunction,
      eventFunction,
      profileFunction,
      registerFunction,
      loginFunction,
      logoutFunction,
      refreshFunction,
    } = props;

    // Cognito User Pool
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `inquiry-growth-${envName}-users`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: envName === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Cognito User Pool Client
    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `inquiry-growth-${envName}-client`,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
      accessTokenValidity: cdk.Duration.hours(24),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // Note: Lambda environment variables for USER_POOL_ID and USER_POOL_CLIENT_ID
    // are set in the compute stack with placeholder values.
    // After deployment, update the Lambda functions with actual values using AWS CLI:
    // aws lambda update-function-configuration --function-name <function-name> \
    //   --environment Variables={USER_POOL_ID=<pool-id>,USER_POOL_CLIENT_ID=<client-id>}

    // API Gateway
    this.api = new apigateway.RestApi(this, 'Api', {
      restApiName: `inquiry-growth-${envName}-api`,
      description: 'Inquiry Growth Engine API',
      deployOptions: {
        stageName: envName,
        tracingEnabled: true,
        metricsEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        throttlingRateLimit: 1000,
        throttlingBurstLimit: 2000,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // Cognito Authorizer
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'Authorizer', {
      cognitoUserPools: [this.userPool],
      authorizerName: 'CognitoAuthorizer',
    });

    // API Resources and Methods

    // /api
    const apiResource = this.api.root.addResource('api');

    // /api/auth - Authentication endpoints
    const authResource = apiResource.addResource('auth');

    // POST /api/auth/register
    authResource.addResource('register').addMethod(
      'POST',
      new apigateway.LambdaIntegration(registerFunction),
      {
        requestValidator: new apigateway.RequestValidator(this, 'RegisterValidator', {
          restApi: this.api,
          validateRequestBody: true,
        }),
      }
    );

    // POST /api/auth/login
    authResource.addResource('login').addMethod(
      'POST',
      new apigateway.LambdaIntegration(loginFunction),
      {
        requestValidator: new apigateway.RequestValidator(this, 'LoginValidator', {
          restApi: this.api,
          validateRequestBody: true,
        }),
      }
    );

    // POST /api/auth/logout
    authResource.addResource('logout').addMethod(
      'POST',
      new apigateway.LambdaIntegration(logoutFunction),
      {
        requestValidator: new apigateway.RequestValidator(this, 'LogoutValidator', {
          restApi: this.api,
          validateRequestBody: true,
        }),
      }
    );

    // POST /api/auth/refresh
    authResource.addResource('refresh').addMethod(
      'POST',
      new apigateway.LambdaIntegration(refreshFunction),
      {
        requestValidator: new apigateway.RequestValidator(this, 'RefreshValidator', {
          restApi: this.api,
          validateRequestBody: true,
        }),
      }
    );

    // /api/content
    const contentResource = apiResource.addResource('content');
    contentResource.addMethod('GET', new apigateway.LambdaIntegration(contentFunction));
    contentResource.addMethod('POST', new apigateway.LambdaIntegration(contentFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const contentIdResource = contentResource.addResource('{id}');
    contentIdResource.addMethod('GET', new apigateway.LambdaIntegration(contentFunction));
    contentIdResource.addMethod('PUT', new apigateway.LambdaIntegration(contentFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    contentIdResource.addMethod('DELETE', new apigateway.LambdaIntegration(contentFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // /api/content/{id}/assets/upload-url
    const assetsResource = contentIdResource.addResource('assets');
    const uploadUrlResource = assetsResource.addResource('upload-url');
    uploadUrlResource.addMethod('POST', new apigateway.LambdaIntegration(contentFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // /api/search
    const searchResource = apiResource.addResource('search');
    searchResource.addMethod('GET', new apigateway.LambdaIntegration(searchFunction));

    // /api/recommendations
    const recommendationsResource = apiResource.addResource('recommendations');
    recommendationsResource.addMethod('GET', new apigateway.LambdaIntegration(recommendationFunction));

    // /api/events
    const eventsResource = apiResource.addResource('events');
    eventsResource.addMethod('POST', new apigateway.LambdaIntegration(eventFunction));

    // /api/users/{id}/profile
    const usersResource = apiResource.addResource('users');
    const userIdResource = usersResource.addResource('{id}');
    const profileResource = userIdResource.addResource('profile');
    profileResource.addMethod('GET', new apigateway.LambdaIntegration(profileFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    profileResource.addMethod('PUT', new apigateway.LambdaIntegration(profileFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // /api/users/{id}/history
    const historyResource = userIdResource.addResource('history');
    historyResource.addMethod('GET', new apigateway.LambdaIntegration(profileFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'API Gateway URL',
      exportName: `${envName}-api-url`,
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `${envName}-user-pool-id`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `${envName}-user-pool-client-id`,
    });
  }
}
