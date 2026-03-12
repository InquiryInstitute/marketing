# Asset Upload Testing Guide

This document provides manual testing instructions for the S3 asset upload functionality.

## Prerequisites

1. Deploy the infrastructure with CDK
2. Create a test content item
3. Obtain a valid JWT token from Cognito

## Test Cases

### Test 1: Valid Image Upload (JPEG)

**Request**:
```bash
curl -X POST https://api.inquiry.institute/api/content/{content-id}/assets/upload-url \
  -H "Authorization: Bearer {jwt-token}" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test-image.jpg",
    "contentType": "image/jpeg",
    "fileSize": 1048576
  }'
```

**Expected Response**: 200 OK with presigned URL and CloudFront URL

**Validation**:
- Response contains `uploadUrl`, `assetUrl`, `key`, `expiresIn`
- `uploadUrl` is a valid S3 presigned URL
- `assetUrl` uses CloudFront domain
- `key` follows pattern: `content/{id}/assets/{timestamp}-test-image.jpg`

### Test 2: Upload File to S3

Using the presigned URL from Test 1:

```bash
curl -X PUT "{presigned-url}" \
  -H "Content-Type: image/jpeg" \
  --data-binary @test-image.jpg
```

**Expected Response**: 200 OK from S3

**Validation**:
- File uploads successfully
- No errors from S3

### Test 3: Access via CloudFront

```bash
curl -I "{cloudfront-url}"
```

**Expected Response**: 200 OK with image content

**Validation**:
- Image is accessible via CloudFront
- Content-Type header is correct
- Image displays in browser

### Test 4: Invalid File Type

**Request**:
```bash
curl -X POST https://api.inquiry.institute/api/content/{content-id}/assets/upload-url \
  -H "Authorization: Bearer {jwt-token}" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test.exe",
    "contentType": "application/x-msdownload",
    "fileSize": 1048576
  }'
```

**Expected Response**: 400 Bad Request

**Validation**:
- Error message indicates file type not allowed
- Lists supported file types

### Test 5: File Size Exceeds Limit (Image)

**Request**:
```bash
curl -X POST https://api.inquiry.institute/api/content/{content-id}/assets/upload-url \
  -H "Authorization: Bearer {jwt-token}" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "large-image.jpg",
    "contentType": "image/jpeg",
    "fileSize": 15728640
  }'
```

**Expected Response**: 400 Bad Request

**Validation**:
- Error message indicates file size exceeds 10MB limit

### Test 6: File Size Exceeds Limit (Video)

**Request**:
```bash
curl -X POST https://api.inquiry.institute/api/content/{content-id}/assets/upload-url \
  -H "Authorization: Bearer {jwt-token}" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "large-video.mp4",
    "contentType": "video/mp4",
    "fileSize": 125829120
  }'
```

**Expected Response**: 400 Bad Request

**Validation**:
- Error message indicates file size exceeds 100MB limit

### Test 7: MIME Type Mismatch

**Request**:
```bash
curl -X POST https://api.inquiry.institute/api/content/{content-id}/assets/upload-url \
  -H "Authorization: Bearer {jwt-token}" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test.jpg",
    "contentType": "image/png",
    "fileSize": 1048576
  }'
```

**Expected Response**: 400 Bad Request

**Validation**:
- Error message indicates content type doesn't match file extension

### Test 8: Content Not Found

**Request**:
```bash
curl -X POST https://api.inquiry.institute/api/content/non-existent-id/assets/upload-url \
  -H "Authorization: Bearer {jwt-token}" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test.jpg",
    "contentType": "image/jpeg",
    "fileSize": 1048576
  }'
```

**Expected Response**: 404 Not Found

**Validation**:
- Error message indicates content not found

### Test 9: Missing Authentication

**Request**:
```bash
curl -X POST https://api.inquiry.institute/api/content/{content-id}/assets/upload-url \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test.jpg",
    "contentType": "image/jpeg",
    "fileSize": 1048576
  }'
```

**Expected Response**: 401 Unauthorized

**Validation**:
- API Gateway rejects request without authentication

### Test 10: All Supported Image Types

Test each image type:
- JPEG: `test.jpg` / `image/jpeg`
- PNG: `test.png` / `image/png`
- GIF: `test.gif` / `image/gif`
- WebP: `test.webp` / `image/webp`

**Expected Response**: 200 OK for all types

### Test 11: All Supported Video Types

Test each video type:
- MP4: `test.mp4` / `video/mp4`
- WebM: `test.webm` / `video/webm`

**Expected Response**: 200 OK for all types

### Test 12: Presigned URL Expiration

1. Generate presigned URL
2. Wait 1 hour + 1 minute
3. Attempt to upload using expired URL

**Expected Response**: 403 Forbidden from S3

**Validation**:
- S3 rejects upload with expired presigned URL

## Automated Testing

For automated testing, create unit tests in `assets.test.ts`:

```typescript
import { generateUploadUrl } from './assets';
import { APIGatewayProxyEvent } from 'aws-lambda';

describe('Asset Upload', () => {
  test('validates file type', async () => {
    const event = createMockEvent({
      filename: 'test.exe',
      contentType: 'application/x-msdownload',
      fileSize: 1024,
    });
    
    const result = await generateUploadUrl(event);
    expect(result.statusCode).toBe(400);
  });
  
  test('validates file size', async () => {
    const event = createMockEvent({
      filename: 'large.jpg',
      contentType: 'image/jpeg',
      fileSize: 15 * 1024 * 1024, // 15MB
    });
    
    const result = await generateUploadUrl(event);
    expect(result.statusCode).toBe(400);
  });
  
  // Add more tests...
});
```

## Performance Testing

Test presigned URL generation performance:

```bash
# Generate 100 presigned URLs
for i in {1..100}; do
  time curl -X POST https://api.inquiry.institute/api/content/{content-id}/assets/upload-url \
    -H "Authorization: Bearer {jwt-token}" \
    -H "Content-Type: application/json" \
    -d '{
      "filename": "test-'$i'.jpg",
      "contentType": "image/jpeg",
      "fileSize": 1048576
    }'
done
```

**Expected Performance**:
- p95 latency < 500ms
- No errors
- Consistent response times

## Security Testing

1. **Test without authentication**: Should return 401
2. **Test with expired token**: Should return 401
3. **Test with invalid content ID**: Should return 404
4. **Test file type bypass**: Try uploading .exe as .jpg - should fail validation
5. **Test size limit bypass**: Try uploading oversized file - should fail validation

## Cleanup

After testing, clean up test assets:

```bash
aws s3 rm s3://inquiry-growth-dev-content-assets/content/{content-id}/assets/ --recursive
```

## Troubleshooting

### Issue: Presigned URL generation fails

**Check**:
- Lambda has S3 permissions
- Content bucket exists
- CloudFront domain is configured

### Issue: Upload to S3 fails

**Check**:
- Presigned URL hasn't expired
- Content-Type header matches request
- File size matches Content-Length header

### Issue: CloudFront URL not accessible

**Check**:
- CloudFront distribution is deployed
- Origin Access Control is configured
- File exists in S3

### Issue: 403 Forbidden from S3

**Check**:
- Presigned URL hasn't expired
- Bucket policy allows Lambda role
- Origin Access Control is configured correctly
