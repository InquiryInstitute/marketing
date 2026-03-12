# Content Service Lambda Functions

This directory contains the Lambda functions for the Content Service, which handles content publishing, retrieval, and management.

## Requirements

Implements **Requirement 1: Content Publishing System (P0 - Phase 1)**

## Endpoints

### POST /api/content
Create new content (article, course, product, or event).

**Request Body:**
```json
{
  "domain": "article",
  "title": "Introduction to Philosophy",
  "description": "A beginner's guide to philosophical thinking",
  "body": "# Introduction\n\nPhilosophy is...",
  "author": "user-uuid",
  "topics": ["philosophy", "education"],
  "tags": ["beginner", "featured"],
  "state": "draft",
  "readTime": 5
}
```

**Response:** 201 Created
```json
{
  "id": "content-uuid",
  "domain": "article",
  "title": "Introduction to Philosophy",
  "description": "A beginner's guide to philosophical thinking",
  "body": "# Introduction\n\nPhilosophy is...",
  "author": "user-uuid",
  "topics": ["philosophy", "education"],
  "tags": ["beginner", "featured"],
  "state": "draft",
  "version": 1,
  "createdAt": 1234567890,
  "updatedAt": 1234567890,
  "readTime": 5
}
```

### GET /api/content/:id
Retrieve a single content item by ID.

**Response:** 200 OK
```json
{
  "id": "content-uuid",
  "domain": "article",
  "title": "Introduction to Philosophy",
  ...
}
```

### GET /api/content
List content with pagination and filtering.

**Query Parameters:**
- `domain` (optional): Filter by domain (article, course, product, event)
- `state` (optional): Filter by state (draft, published, archived)
- `limit` (optional): Number of items per page (default: 20, max: 100)
- `offset` (optional): Number of items to skip (default: 0)

**Response:** 200 OK
```json
{
  "items": [...],
  "total": 50,
  "limit": 20,
  "offset": 0,
  "hasMore": true,
  "lastEvaluatedKey": "..."
}
```

### PUT /api/content/:id
Update existing content (admin only).

**Headers:**
- `x-admin-user: true` (temporary - will be replaced with JWT auth)

**Request Body:**
```json
{
  "title": "Updated Title",
  "state": "published"
}
```

**Response:** 200 OK
```json
{
  "id": "content-uuid",
  "title": "Updated Title",
  "state": "published",
  "version": 2,
  "publishedAt": 1234567890,
  "updatedAt": 1234567890,
  ...
}
```

### POST /api/content/:id/assets/upload-url
Generate a presigned URL for uploading assets (images, videos) to S3.

**Authentication:** Required (Cognito JWT)

**Request Body:**
```json
{
  "filename": "hero-image.jpg",
  "contentType": "image/jpeg",
  "fileSize": 2048576
}
```

**Response:** 200 OK
```json
{
  "uploadUrl": "https://inquiry-growth-dev-content-assets.s3.amazonaws.com/...",
  "assetUrl": "https://d1234567890.cloudfront.net/content/abc-123/assets/1709740800000-hero-image.jpg",
  "key": "content/abc-123/assets/1709740800000-hero-image.jpg",
  "expiresIn": 3600
}
```

**Supported File Types:**
- Images (max 10MB): jpg, jpeg, png, gif, webp
- Videos (max 100MB): mp4, webm

See [ASSETS.md](./ASSETS.md) for detailed documentation on asset uploads.

## Validation

The service validates:
- **Required fields**: title, description, body, author, topics
- **Field lengths**: title (1-500), description (1-2000), body (min 1)
- **Array limits**: topics (1-10), tags (max 20)
- **Markdown syntax**: Basic validation for code blocks
- **State transitions**: Automatically sets `publishedAt` when publishing
- **Version incrementing**: Increments version on each update

## Error Responses

All errors return a consistent format:

```json
{
  "error": "ValidationError",
  "message": "Request validation failed",
  "fields": [
    {
      "field": "title",
      "message": "Title is required and must be a string"
    }
  ]
}
```

## Environment Variables

- `CONTENT_TABLE`: DynamoDB table name for content storage
- `CONTENT_BUCKET`: S3 bucket name for content assets
- `CLOUDFRONT_DOMAIN`: CloudFront distribution domain for asset delivery
- `AWS_REGION`: AWS region (default: us-east-1)

## Development

### Build
```bash
npm run build
```

### Clean
```bash
npm run clean
```

## Implementation Notes

1. **State Management**: Content can be in `draft`, `published`, or `archived` state. The `publishedAt` timestamp is automatically set when content transitions to `published`.

2. **Versioning**: Each update increments the `version` number, enabling future version tracking features.

3. **Pagination**: The list endpoint uses DynamoDB's GSI (`domain-publishedAt-index`) for efficient queries when filtering by domain and published state. Otherwise, it uses scan operations.

4. **Admin Authorization**: Currently uses a temporary header-based check (`x-admin-user`). This will be replaced with JWT-based authorization in the API Gateway integration.

5. **Markdown Validation**: Basic validation checks for unclosed code blocks. More sophisticated validation can be added as needed.

## Future Enhancements

- Integration with embedding generation service (Task 5.1)
- Integration with OpenSearch for full-text indexing (Task 7.1)
- JWT-based admin authorization
- Content versioning and history (Phase 2)
- Multi-domain support enhancements (Phase 2)
