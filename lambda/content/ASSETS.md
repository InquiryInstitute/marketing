# Content Assets Upload

This document describes the S3 asset upload functionality for content.

## Overview

The asset upload system allows authenticated users to upload images and videos to S3 for use in content. It uses presigned URLs for secure, direct-to-S3 uploads.

**Requirements**: Req 1.7 (Content assets in S3)

## Architecture

1. Client requests presigned URL from API
2. API validates request and generates presigned URL
3. Client uploads file directly to S3 using presigned URL
4. Client receives CloudFront URL for accessing the asset

## API Endpoint

### POST /api/content/:id/assets/upload-url

Generate a presigned URL for uploading an asset to S3.

**Authentication**: Required (Cognito JWT)

**Request Body**:
```json
{
  "filename": "hero-image.jpg",
  "contentType": "image/jpeg",
  "fileSize": 2048576
}
```

**Response** (200 OK):
```json
{
  "uploadUrl": "https://inquiry-growth-dev-content-assets.s3.amazonaws.com/content/...",
  "assetUrl": "https://d1234567890.cloudfront.net/content/abc-123/assets/1234567890-hero-image.jpg",
  "key": "content/abc-123/assets/1234567890-hero-image.jpg",
  "expiresIn": 3600
}
```

**Error Responses**:
- 400 Bad Request: Invalid request or file type not allowed
- 404 Not Found: Content ID does not exist
- 500 Internal Server Error: Failed to generate upload URL

## Supported File Types

### Images (max 10MB)
- JPEG (.jpg, .jpeg) - image/jpeg
- PNG (.png) - image/png
- GIF (.gif) - image/gif
- WebP (.webp) - image/webp

### Videos (max 100MB)
- MP4 (.mp4) - video/mp4
- WebM (.webm) - video/webm

## S3 Storage Structure

Assets are stored with the following key pattern:
```
content/{contentId}/assets/{timestamp}-{filename}
```

Example:
```
content/abc-123-def-456/assets/1709740800000-hero-image.jpg
```

## CloudFront Distribution

Assets are served through CloudFront CDN for optimal performance:
- HTTPS only (redirects HTTP to HTTPS)
- Compression enabled
- Caching optimized for static assets
- Global edge locations (PriceClass 100)

## Validation

The system validates:
1. **File extension**: Must match allowed types
2. **MIME type**: Must match file extension
3. **File size**: Must not exceed limits for file type
4. **Content exists**: Content ID must exist in database

## Security

- Presigned URLs expire after 1 hour
- S3 bucket is private (no public access)
- CloudFront uses Origin Access Control (OAC)
- All uploads require authentication
- File type and size validation prevents abuse

## Usage Example

### 1. Request Presigned URL

```bash
curl -X POST https://api.inquiry.institute/api/content/abc-123/assets/upload-url \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "hero-image.jpg",
    "contentType": "image/jpeg",
    "fileSize": 2048576
  }'
```

### 2. Upload File to S3

```bash
curl -X PUT "<presigned-url>" \
  -H "Content-Type: image/jpeg" \
  -H "Content-Length: 2048576" \
  --data-binary @hero-image.jpg
```

### 3. Use CloudFront URL

The `assetUrl` from step 1 can now be used in content:
```markdown
![Hero Image](https://d1234567890.cloudfront.net/content/abc-123/assets/1709740800000-hero-image.jpg)
```

## Implementation Details

### Lambda Function: `lambda/content/assets.ts`

Key functions:
- `generateUploadUrl()`: Main handler for presigned URL generation
- `validateAssetRequest()`: Validates upload request
- `getFileExtension()`: Extracts and validates file extension

### Environment Variables

- `CONTENT_TABLE`: DynamoDB table name for content
- `CONTENT_BUCKET`: S3 bucket name for assets
- `CLOUDFRONT_DOMAIN`: CloudFront distribution domain

### IAM Permissions

The Lambda function requires:
- `s3:PutObject` on content bucket
- `dynamodb:GetItem` on content table

## Cost Considerations

**S3 Storage**:
- Standard storage: ~$0.023 per GB/month
- Estimated: 100GB = $2.30/month

**CloudFront**:
- Data transfer: $0.085 per GB (first 10TB)
- Requests: $0.0075 per 10,000 requests
- Estimated: 1TB transfer = $85/month

**Total estimated cost**: ~$87/month for 100GB storage + 1TB transfer

## Future Enhancements

Phase 2 considerations:
- Image optimization (resize, compress)
- Thumbnail generation
- Video transcoding
- Asset metadata tracking
- Asset deletion/cleanup
- Multi-part upload for large files
