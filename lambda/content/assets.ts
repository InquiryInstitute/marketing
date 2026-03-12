/**
 * Content Assets Handler
 * POST /api/content/:id/assets/upload-url
 * Requirements: Req 1.7 (Content assets in S3)
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ErrorResponse } from './types';

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CONTENT_TABLE = process.env.CONTENT_TABLE!;
const CONTENT_BUCKET = process.env.CONTENT_BUCKET!;
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN!;

/**
 * Allowed file types and their MIME types
 */
const ALLOWED_FILE_TYPES: Record<string, { mimeTypes: string[]; maxSize: number }> = {
  // Images: max 10MB
  jpg: { mimeTypes: ['image/jpeg'], maxSize: 10 * 1024 * 1024 },
  jpeg: { mimeTypes: ['image/jpeg'], maxSize: 10 * 1024 * 1024 },
  png: { mimeTypes: ['image/png'], maxSize: 10 * 1024 * 1024 },
  gif: { mimeTypes: ['image/gif'], maxSize: 10 * 1024 * 1024 },
  webp: { mimeTypes: ['image/webp'], maxSize: 10 * 1024 * 1024 },
  // Videos: max 100MB
  mp4: { mimeTypes: ['video/mp4'], maxSize: 100 * 1024 * 1024 },
  webm: { mimeTypes: ['video/webm'], maxSize: 100 * 1024 * 1024 },
};

/**
 * Asset upload request
 */
interface AssetUploadRequest {
  filename: string;
  contentType: string;
  fileSize: number;
}

/**
 * Asset upload response
 */
interface AssetUploadResponse {
  uploadUrl: string;
  assetUrl: string;
  key: string;
  expiresIn: number;
}

/**
 * Validate file extension
 */
function getFileExtension(filename: string): string | null {
  const parts = filename.toLowerCase().split('.');
  if (parts.length < 2) {
    return null;
  }
  return parts[parts.length - 1];
}

/**
 * Validate asset upload request
 */
function validateAssetRequest(body: any): { valid: boolean; error?: ErrorResponse; data?: AssetUploadRequest } {
  const errors: Array<{ field: string; message: string }> = [];

  // Validate filename
  if (!body.filename || typeof body.filename !== 'string') {
    errors.push({ field: 'filename', message: 'Filename is required and must be a string' });
  }

  // Validate contentType
  if (!body.contentType || typeof body.contentType !== 'string') {
    errors.push({ field: 'contentType', message: 'Content type is required and must be a string' });
  }

  // Validate fileSize
  if (typeof body.fileSize !== 'number' || body.fileSize <= 0) {
    errors.push({ field: 'fileSize', message: 'File size is required and must be a positive number' });
  }

  if (errors.length > 0) {
    return {
      valid: false,
      error: {
        error: 'ValidationError',
        message: 'Invalid asset upload request',
        fields: errors,
      },
    };
  }

  // Validate file extension
  const extension = getFileExtension(body.filename);
  if (!extension || !ALLOWED_FILE_TYPES[extension]) {
    return {
      valid: false,
      error: {
        error: 'ValidationError',
        message: `File type not allowed. Supported types: ${Object.keys(ALLOWED_FILE_TYPES).join(', ')}`,
      },
    };
  }

  // Validate MIME type matches extension
  const allowedConfig = ALLOWED_FILE_TYPES[extension];
  if (!allowedConfig.mimeTypes.includes(body.contentType)) {
    return {
      valid: false,
      error: {
        error: 'ValidationError',
        message: `Content type ${body.contentType} does not match file extension ${extension}`,
      },
    };
  }

  // Validate file size
  if (body.fileSize > allowedConfig.maxSize) {
    const maxSizeMB = allowedConfig.maxSize / (1024 * 1024);
    return {
      valid: false,
      error: {
        error: 'ValidationError',
        message: `File size exceeds maximum allowed size of ${maxSizeMB}MB for ${extension} files`,
      },
    };
  }

  return {
    valid: true,
    data: {
      filename: body.filename,
      contentType: body.contentType,
      fileSize: body.fileSize,
    },
  };
}

/**
 * Generate presigned URL for asset upload
 */
export async function generateUploadUrl(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Generate upload URL request');

  try {
    // Get content ID from path
    const contentId = event.pathParameters?.id;
    if (!contentId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'BadRequest',
          message: 'Content ID is required',
        } as ErrorResponse),
      };
    }

    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'BadRequest',
          message: 'Request body is required',
        } as ErrorResponse),
      };
    }

    const body = JSON.parse(event.body);

    // Validate request
    const validation = validateAssetRequest(body);
    if (!validation.valid) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validation.error),
      };
    }

    const requestData = validation.data!;

    // Verify content exists
    const contentResult = await docClient.send(
      new GetCommand({
        TableName: CONTENT_TABLE,
        Key: { id: contentId },
      })
    );

    if (!contentResult.Item) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'NotFound',
          message: 'Content not found',
        } as ErrorResponse),
      };
    }

    // Generate S3 key with content-id prefix
    // Format: content/{contentId}/assets/{timestamp}-{filename}
    const timestamp = Date.now();
    const sanitizedFilename = requestData.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `content/${contentId}/assets/${timestamp}-${sanitizedFilename}`;

    // Generate presigned URL for PUT operation
    const command = new PutObjectCommand({
      Bucket: CONTENT_BUCKET,
      Key: key,
      ContentType: requestData.contentType,
      ContentLength: requestData.fileSize,
    });

    const expiresIn = 3600; // 1 hour
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });

    // Generate CloudFront URL for asset access
    const assetUrl = `https://${CLOUDFRONT_DOMAIN}/${key}`;

    console.log('Generated upload URL for content:', contentId, 'key:', key);

    const response: AssetUploadResponse = {
      uploadUrl,
      assetUrl,
      key,
      expiresIn,
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    console.error('Generate upload URL error:', error);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'InternalServerError',
        message: 'Failed to generate upload URL',
      } as ErrorResponse),
    };
  }
}
