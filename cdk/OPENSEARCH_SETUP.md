# OpenSearch Serverless Setup Guide

## Overview

This guide explains the OpenSearch Serverless configuration for the Inquiry Growth Engine. The collection is used for both full-text search and vector similarity search (k-NN) for content recommendations.

## Collection Configuration

**Collection Name**: `inquiry-growth-{env}-content`
**Type**: SEARCH (supports both full-text and vector search)
**Endpoint**: Available via CloudFormation output `OpenSearchCollectionEndpoint`

## Security Policies

### 1. Encryption Policy
- Uses AWS-owned keys for encryption at rest
- Applied to the content collection

### 2. Network Policy
- Configured for VPC access (private access only)
- No public access allowed
- Lambda functions will access via VPC endpoints

### 3. Data Access Policy
- Grants permissions to account root (will be refined with specific Lambda roles)
- Permissions include:
  - Collection: Create, Update, Describe
  - Index: Create, Update, Describe, Read, Write

## Index Mapping Configuration

After the collection is deployed, you need to create the index with the proper mapping. This must be done via the OpenSearch API.

### Content Index Mapping

The content index supports both full-text search and vector similarity search with a 1536-dimension embedding field.

```json
{
  "settings": {
    "index": {
      "knn": true,
      "knn.algo_param.ef_search": 512
    }
  },
  "mappings": {
    "properties": {
      "contentId": {
        "type": "keyword"
      },
      "domain": {
        "type": "keyword"
      },
      "title": {
        "type": "text",
        "analyzer": "english",
        "fields": {
          "keyword": {
            "type": "keyword"
          }
        }
      },
      "description": {
        "type": "text",
        "analyzer": "english"
      },
      "body": {
        "type": "text",
        "analyzer": "english"
      },
      "topics": {
        "type": "keyword"
      },
      "tags": {
        "type": "keyword"
      },
      "author": {
        "type": "keyword"
      },
      "state": {
        "type": "keyword"
      },
      "publishedAt": {
        "type": "date"
      },
      "embedding": {
        "type": "knn_vector",
        "dimension": 1536,
        "method": {
          "name": "hnsw",
          "engine": "faiss",
          "space_type": "cosinesimil",
          "parameters": {
            "ef_construction": 512,
            "m": 16
          }
        }
      }
    }
  }
}
```

### Creating the Index

Use the AWS SDK or curl to create the index:

```bash
# Get the collection endpoint from CloudFormation outputs
COLLECTION_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name InquiryGrowthDataStack-dev \
  --query "Stacks[0].Outputs[?OutputKey=='OpenSearchCollectionEndpoint'].OutputValue" \
  --output text)

# Create the index with mapping
curl -X PUT "${COLLECTION_ENDPOINT}/content" \
  -H "Content-Type: application/json" \
  --aws-sigv4 "aws:amz:us-east-1:aoss" \
  -d @content-index-mapping.json
```

Or use the AWS SDK for JavaScript:

```typescript
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';

const client = new Client({
  ...AwsSigv4Signer({
    region: 'us-east-1',
    service: 'aoss',
  }),
  node: process.env.OPENSEARCH_ENDPOINT,
});

await client.indices.create({
  index: 'content',
  body: {
    settings: {
      index: {
        knn: true,
        knn: {
          algo_param: {
            ef_search: 512
          }
        }
      }
    },
    mappings: {
      // ... mapping from above
    }
  }
});
```

## Vector Search Configuration

### HNSW Algorithm Parameters

- **dimension**: 1536 (matches AWS Bedrock Titan Embeddings V2)
- **engine**: faiss (Facebook AI Similarity Search)
- **space_type**: cosinesimil (cosine similarity for semantic search)
- **ef_construction**: 512 (higher = better recall, slower indexing)
- **m**: 16 (number of bi-directional links, balance between recall and memory)

### Performance Characteristics

- **Search Latency**: < 200ms (p95) for k-NN queries
- **Index Update Latency**: < 5 seconds for new documents
- **Capacity**: Designed for 10,000+ documents in Phase 1

## Usage Examples

### Full-Text Search

```json
POST /content/_search
{
  "query": {
    "bool": {
      "must": [{
        "multi_match": {
          "query": "artificial intelligence ethics",
          "fields": ["title^3", "description^2", "body"],
          "type": "best_fields",
          "fuzziness": "AUTO"
        }
      }],
      "filter": [
        {"term": {"state": "published"}},
        {"term": {"domain": "article"}}
      ]
    }
  },
  "highlight": {
    "fields": {
      "title": {},
      "description": {},
      "body": {
        "fragment_size": 150,
        "number_of_fragments": 1
      }
    }
  },
  "size": 20
}
```

### Vector Similarity Search (k-NN)

```json
POST /content/_search
{
  "query": {
    "bool": {
      "must": [{
        "knn": {
          "embedding": {
            "vector": [0.123, 0.456, ...], // 1536-dim vector
            "k": 20
          }
        }
      }],
      "filter": [
        {"term": {"state": "published"}}
      ]
    }
  },
  "size": 20
}
```

### Hybrid Search (Text + Vector)

```json
POST /content/_search
{
  "query": {
    "bool": {
      "should": [
        {
          "multi_match": {
            "query": "machine learning",
            "fields": ["title^3", "description^2", "body"],
            "boost": 0.4
          }
        },
        {
          "knn": {
            "embedding": {
              "vector": [0.123, 0.456, ...],
              "k": 20,
              "boost": 0.6
            }
          }
        }
      ],
      "filter": [
        {"term": {"state": "published"}}
      ],
      "minimum_should_match": 1
    }
  },
  "size": 20
}
```

## Monitoring

Monitor the following metrics in CloudWatch:

- **SearchRate**: Number of search requests per second
- **SearchLatency**: Time to execute search queries
- **IndexingRate**: Number of documents indexed per second
- **IndexingLatency**: Time to index documents
- **2xx/4xx/5xx**: HTTP response codes

## Cost Optimization

OpenSearch Serverless pricing is based on:
- **OCU (OpenSearch Compute Units)**: $0.24/hour per OCU
- **Storage**: $0.024/GB per month

Estimated costs for Phase 1:
- 2 OCUs for search workload: ~$350/month
- 10,000 documents × 50KB avg: ~$12/month storage
- **Total**: ~$362/month (well within $800 budget)

## Troubleshooting

### Index Creation Fails
- Verify the collection is in ACTIVE state
- Check IAM permissions for the principal creating the index
- Ensure the data access policy includes the necessary permissions

### Search Queries Timeout
- Check if ef_search parameter is too high (reduce for faster queries)
- Verify the collection has sufficient OCUs allocated
- Review CloudWatch metrics for throttling

### Vector Search Returns Poor Results
- Verify embeddings are normalized (unit vectors)
- Check that space_type is set to "cosinesimil"
- Ensure the embedding dimension matches (1536)

## Next Steps

1. Deploy the CDK stack to create the collection
2. Wait for the collection to reach ACTIVE state (5-10 minutes)
3. Create the content index with the mapping above
4. Test index creation with a sample document
5. Implement Lambda functions for indexing and search
6. Configure Lambda IAM roles in the data access policy

## References

- [OpenSearch Serverless Documentation](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless.html)
- [k-NN Plugin Documentation](https://opensearch.org/docs/latest/search-plugins/knn/index/)
- [AWS Bedrock Titan Embeddings](https://docs.aws.amazon.com/bedrock/latest/userguide/titan-embedding-models.html)
