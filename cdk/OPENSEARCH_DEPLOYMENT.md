# OpenSearch Serverless Deployment Guide

## Task 2.3: Deploy OpenSearch Serverless Cluster

This document provides step-by-step instructions for deploying the OpenSearch Serverless cluster for the Inquiry Growth Engine.

## Overview

The OpenSearch Serverless cluster provides:
- **Full-text search** across content (titles, descriptions, body text)
- **Vector similarity search** using 1536-dimension embeddings from AWS Bedrock Titan
- **Hybrid search** combining text and semantic search

## Prerequisites

- AWS CDK deployed (Task 1.1 completed)
- VPC and network infrastructure deployed (Task 1.2 completed)
- AWS CLI configured with appropriate credentials
- Account: 548217737835, Region: us-east-1

## Deployment Steps

### Step 1: Deploy the OpenSearch Serverless Collection

The collection is defined in `cdk/lib/data-stack.ts` and includes:
- Encryption policy (AWS-owned keys)
- Network policy (VPC access only)
- Data access policy (IAM-based permissions)
- Collection resource (SEARCH type)

Deploy the data stack:

```bash
# For dev environment
npm run cdk:deploy:dev

# For staging environment
npm run cdk:deploy:staging

# For production environment
npm run cdk:deploy:prod
```

The deployment will create:
- `inquiry-growth-{env}-content` collection
- Security policies for encryption and network access
- Data access policy for Lambda functions

**Expected Duration**: 5-10 minutes for collection to become ACTIVE

### Step 2: Verify Collection Status

Check the collection status in the AWS Console or via CLI:

```bash
aws opensearchserverless list-collections \
  --region us-east-1 \
  --query "collectionSummaries[?name=='inquiry-growth-dev-content']"
```

Wait until the status is `ACTIVE` before proceeding.

### Step 3: Get Collection Endpoint

Retrieve the collection endpoint from CloudFormation outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name inquiry-growth-dev-data \
  --region us-east-1 \
  --query "Stacks[0].Outputs[?OutputKey=='OpenSearchCollectionEndpoint'].OutputValue" \
  --output text
```

The endpoint will be in the format:
```
https://xxxxxx.us-east-1.aoss.amazonaws.com
```

### Step 4: Install Required Dependencies

Install the OpenSearch client and AWS SDK dependencies:

```bash
npm install @opensearch-project/opensearch @aws-sdk/client-cloudformation @aws-sdk/credential-provider-node
```

### Step 5: Create Index with Mapping

Run the index creation script:

```bash
# For dev environment
npx ts-node cdk/scripts/create-opensearch-index.ts dev

# For staging environment
npx ts-node cdk/scripts/create-opensearch-index.ts staging

# For production environment
npx ts-node cdk/scripts/create-opensearch-index.ts prod
```

This script will:
1. Fetch the collection endpoint from CloudFormation
2. Create the `content` index with proper mapping
3. Configure the k-NN vector field (1536 dimensions, HNSW algorithm)

**Expected Output**:
```
Setting up OpenSearch indexes for environment: dev
Region: us-east-1

Fetching OpenSearch collection endpoint...
Collection endpoint: https://xxxxxx.us-east-1.aoss.amazonaws.com

Creating content index...
Creating index 'content'...
✓ Index 'content' created successfully

✓ All indexes created successfully!
```

### Step 6: Verify Index Creation

Test the index by inserting a sample document:

```bash
curl -X POST "https://xxxxxx.us-east-1.aoss.amazonaws.com/content/_doc" \
  -H "Content-Type: application/json" \
  --aws-sigv4 "aws:amz:us-east-1:aoss" \
  -d '{
    "contentId": "test-001",
    "domain": "article",
    "title": "Test Article",
    "description": "This is a test article",
    "body": "Test content for verification",
    "topics": ["testing"],
    "state": "published",
    "publishedAt": "2024-01-01T00:00:00Z"
  }'
```

Query the document:

```bash
curl -X GET "https://xxxxxx.us-east-1.aoss.amazonaws.com/content/_search" \
  -H "Content-Type: application/json" \
  --aws-sigv4 "aws:amz:us-east-1:aoss" \
  -d '{
    "query": {
      "match": {
        "title": "test"
      }
    }
  }'
```

## Configuration Details

### Collection Configuration

- **Name**: `inquiry-growth-{env}-content`
- **Type**: SEARCH (supports both full-text and vector search)
- **Encryption**: AWS-owned keys
- **Network Access**: VPC-only (no public access)

### Index Mapping

The `content` index includes:

**Text Fields** (for full-text search):
- `title` (text, English analyzer, boosted 3x)
- `description` (text, English analyzer, boosted 2x)
- `body` (text, English analyzer)

**Keyword Fields** (for filtering):
- `contentId`, `domain`, `state`, `author`
- `topics`, `tags` (arrays)

**Date Fields**:
- `publishedAt` (date)

**Vector Field** (for similarity search):
- `embedding` (knn_vector, 1536 dimensions)
  - Algorithm: HNSW (Hierarchical Navigable Small World)
  - Engine: FAISS (Facebook AI Similarity Search)
  - Space Type: Cosine Similarity
  - Parameters: ef_construction=512, m=16

### Access Policies

**Data Access Policy** grants permissions to:
- Account root (will be refined with specific Lambda roles)
- Permissions: Create, Update, Describe, Read, Write

**Network Policy**:
- No public access
- VPC endpoints will be configured for Lambda access

## Next Steps

After successful deployment:

1. **Update Lambda IAM Roles** (Task 5.1, 7.1, 10.2)
   - Add OpenSearch permissions to Lambda execution roles
   - Update data access policy with specific Lambda role ARNs

2. **Implement Indexing Lambda** (Task 7.1)
   - Trigger on content publication
   - Index content with full-text fields
   - Generate and store embeddings

3. **Implement Search Lambda** (Task 7.2)
   - Full-text search endpoint
   - Result highlighting and pagination

4. **Implement Vector Search Lambda** (Task 10.2)
   - k-NN similarity search
   - User embedding generation
   - Recommendation scoring

## Monitoring

Monitor the collection in CloudWatch:

```bash
# View collection metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/AOSS \
  --metric-name SearchRate \
  --dimensions Name=CollectionName,Value=inquiry-growth-dev-content \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-02T00:00:00Z \
  --period 3600 \
  --statistics Average
```

Key metrics to monitor:
- **SearchRate**: Requests per second
- **SearchLatency**: Query response time
- **IndexingRate**: Documents indexed per second
- **IndexingLatency**: Time to index documents

## Cost Estimation

OpenSearch Serverless pricing:
- **OCU (OpenSearch Compute Units)**: $0.24/hour per OCU
- **Storage**: $0.024/GB per month

Estimated costs for Phase 1:
- 2 OCUs for search workload: ~$350/month
- 10,000 documents × 50KB avg: ~$12/month storage
- **Total**: ~$362/month

## Troubleshooting

### Collection Creation Fails

**Issue**: Collection stuck in CREATING state
**Solution**: 
- Check CloudFormation events for errors
- Verify IAM permissions for CDK deployment role
- Ensure security policies are valid JSON

### Index Creation Fails

**Issue**: "Unauthorized" error when creating index
**Solution**:
- Verify the collection is in ACTIVE state
- Check data access policy includes your IAM principal
- Ensure AWS credentials are configured correctly

### Search Queries Timeout

**Issue**: Queries take longer than 500ms
**Solution**:
- Reduce `ef_search` parameter (currently 512)
- Check collection OCU allocation
- Review query complexity and filters

### Vector Search Returns Poor Results

**Issue**: Recommendations are not relevant
**Solution**:
- Verify embeddings are normalized (unit vectors)
- Check `space_type` is set to "cosinesimil"
- Ensure embedding dimension is 1536
- Review user embedding generation logic

## References

- [OpenSearch Serverless Documentation](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless.html)
- [k-NN Plugin Documentation](https://opensearch.org/docs/latest/search-plugins/knn/index/)
- [AWS Bedrock Titan Embeddings](https://docs.aws.amazon.com/bedrock/latest/userguide/titan-embedding-models.html)
- [Design Document](../.kiro/specs/inquiry-growth-engine/design.md)
- [Requirements Document](../.kiro/specs/inquiry-growth-engine/requirements.md)

## Task Completion Checklist

- [x] OpenSearch Serverless collection defined in CDK
- [x] Encryption policy configured
- [x] Network policy configured (VPC access)
- [x] Data access policy configured
- [x] Collection resource created
- [x] CloudFormation outputs added
- [x] Index mapping documented
- [x] Index creation script created
- [x] Deployment guide created
- [ ] Collection deployed to dev environment
- [ ] Index created with proper mapping
- [ ] Sample document indexed and queried
- [ ] Lambda IAM roles updated with OpenSearch permissions

## Validation

To validate the deployment:

1. ✓ Collection is in ACTIVE state
2. ✓ Index exists with correct mapping
3. ✓ Sample document can be indexed
4. ✓ Full-text search returns results
5. ✓ Vector field accepts 1536-dimension embeddings
6. ✓ CloudFormation outputs are accessible

Once all validation steps pass, Task 2.3 is complete!
