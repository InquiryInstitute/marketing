#!/usr/bin/env ts-node

/**
 * Script to create OpenSearch Serverless index with proper mapping
 * 
 * Usage:
 *   ts-node scripts/create-opensearch-index.ts <env>
 * 
 * Example:
 *   ts-node scripts/create-opensearch-index.ts dev
 */

import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';

const REGION = 'us-east-1';

interface IndexMapping {
  settings: {
    index: {
      knn: boolean;
      'knn.algo_param.ef_search': number;
    };
  };
  mappings: {
    properties: Record<string, any>;
  };
}

const CONTENT_INDEX_MAPPING: IndexMapping = {
  settings: {
    index: {
      knn: true,
      'knn.algo_param.ef_search': 512,
    },
  },
  mappings: {
    properties: {
      contentId: {
        type: 'keyword',
      },
      domain: {
        type: 'keyword',
      },
      title: {
        type: 'text',
        analyzer: 'english',
        fields: {
          keyword: {
            type: 'keyword',
          },
        },
      },
      description: {
        type: 'text',
        analyzer: 'english',
      },
      body: {
        type: 'text',
        analyzer: 'english',
      },
      topics: {
        type: 'keyword',
      },
      tags: {
        type: 'keyword',
      },
      author: {
        type: 'keyword',
      },
      state: {
        type: 'keyword',
      },
      publishedAt: {
        type: 'date',
      },
      embedding: {
        type: 'knn_vector',
        dimension: 1536,
        method: {
          name: 'hnsw',
          engine: 'faiss',
          space_type: 'cosinesimil',
          parameters: {
            ef_construction: 512,
            m: 16,
          },
        },
      },
    },
  },
};

async function getCollectionEndpoint(env: string): Promise<string> {
  const cfnClient = new CloudFormationClient({ region: REGION });
  const stackName = `InquiryGrowthDataStack-${env}`;

  try {
    const response = await cfnClient.send(
      new DescribeStacksCommand({ StackName: stackName })
    );

    const stack = response.Stacks?.[0];
    if (!stack) {
      throw new Error(`Stack ${stackName} not found`);
    }

    const output = stack.Outputs?.find(
      (o: any) => o.OutputKey === 'OpenSearchCollectionEndpoint'
    );

    if (!output?.OutputValue) {
      throw new Error('OpenSearchCollectionEndpoint output not found');
    }

    return output.OutputValue;
  } catch (error) {
    console.error('Error fetching collection endpoint:', error);
    throw error;
  }
}

async function createIndex(endpoint: string, indexName: string, mapping: IndexMapping) {
  const client = new Client({
    ...AwsSigv4Signer({
      region: REGION,
      service: 'aoss',
      getCredentials: () => {
        const credentialsProvider = defaultProvider();
        return credentialsProvider();
      },
    }),
    node: endpoint,
  });

  try {
    // Check if index already exists
    const exists = await client.indices.exists({ index: indexName });

    if (exists.body) {
      console.log(`Index '${indexName}' already exists. Skipping creation.`);
      return;
    }

    // Create the index
    console.log(`Creating index '${indexName}'...`);
    const response = await client.indices.create({
      index: indexName,
      body: mapping,
    });

    if (response.body.acknowledged) {
      console.log(`✓ Index '${indexName}' created successfully`);
    } else {
      console.error('Index creation was not acknowledged:', response.body);
    }
  } catch (error: any) {
    console.error(`Error creating index '${indexName}':`, error.message);
    if (error.meta?.body) {
      console.error('Error details:', JSON.stringify(error.meta.body, null, 2));
    }
    throw error;
  }
}

async function main() {
  const env = process.argv[2];

  if (!env) {
    console.error('Usage: ts-node scripts/create-opensearch-index.ts <env>');
    console.error('Example: ts-node scripts/create-opensearch-index.ts dev');
    process.exit(1);
  }

  console.log(`Setting up OpenSearch indexes for environment: ${env}`);
  console.log('Region:', REGION);

  try {
    // Get the collection endpoint from CloudFormation
    console.log('\nFetching OpenSearch collection endpoint...');
    const endpoint = await getCollectionEndpoint(env);
    console.log('Collection endpoint:', endpoint);

    // Create the content index
    console.log('\nCreating content index...');
    await createIndex(endpoint, 'content', CONTENT_INDEX_MAPPING);

    console.log('\n✓ All indexes created successfully!');
    console.log('\nNext steps:');
    console.log('1. Test the index by inserting a sample document');
    console.log('2. Verify search functionality');
    console.log('3. Test vector similarity search with embeddings');
  } catch (error) {
    console.error('\n✗ Setup failed:', error);
    process.exit(1);
  }
}

main();
