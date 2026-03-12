/**
 * Quick validation test script
 * Run with: npx ts-node test-validation.ts
 */

import {
  createContentRequestSchema,
  canonicalEventSchema,
  userProfileSchema,
  validate,
  formatValidationErrors,
} from './index';

console.log('Testing Shared Types Validation\n');
console.log('='.repeat(50));

// Test 1: Valid article content
console.log('\n1. Testing valid article content...');
const validArticle = {
  domain: 'article',
  title: 'Test Article',
  description: 'A test article description',
  body: 'Article body content',
  author: '550e8400-e29b-41d4-a716-446655440000',
  topics: ['philosophy'],
  tags: ['test'],
  state: 'draft',
  readTime: 5,
};

const articleResult = validate(createContentRequestSchema, validArticle);
console.log('Result:', articleResult.success ? '✓ PASS' : '✗ FAIL');
if (!articleResult.success) {
  console.log('Errors:', formatValidationErrors(articleResult.errors));
}

// Test 2: Invalid article (missing required fields)
console.log('\n2. Testing invalid article (missing title)...');
const invalidArticle = {
  domain: 'article',
  description: 'A test article description',
  body: 'Article body content',
  author: '550e8400-e29b-41d4-a716-446655440000',
  topics: ['philosophy'],
};

const invalidArticleResult = validate(createContentRequestSchema, invalidArticle);
console.log('Result:', invalidArticleResult.success ? '✗ FAIL (should have failed)' : '✓ PASS (correctly rejected)');
if (!invalidArticleResult.success) {
  console.log('Errors:', formatValidationErrors(invalidArticleResult.errors));
}

// Test 3: Valid canonical event
console.log('\n3. Testing valid canonical event...');
const validEvent = {
  version: '2.0',
  eventId: '550e8400-e29b-41d4-a716-446655440001',
  eventType: 'view',
  timestamp: new Date().toISOString(),
  userId: '550e8400-e29b-41d4-a716-446655440000',
  sessionId: '660e8400-e29b-41d4-a716-446655440001',
  contentId: '770e8400-e29b-41d4-a716-446655440002',
  metadata: {
    userAgent: 'Mozilla/5.0',
    deviceType: 'desktop',
  },
};

const eventResult = validate(canonicalEventSchema, validEvent);
console.log('Result:', eventResult.success ? '✓ PASS' : '✗ FAIL');
if (!eventResult.success) {
  console.log('Errors:', formatValidationErrors(eventResult.errors));
}

// Test 4: Invalid event (missing contentId for view event)
console.log('\n4. Testing invalid event (missing contentId for view event)...');
const invalidEvent = {
  version: '2.0',
  eventId: '550e8400-e29b-41d4-a716-446655440001',
  eventType: 'view',
  timestamp: new Date().toISOString(),
  sessionId: '660e8400-e29b-41d4-a716-446655440001',
  metadata: {
    userAgent: 'Mozilla/5.0',
    deviceType: 'desktop',
  },
};

const invalidEventResult = validate(canonicalEventSchema, invalidEvent);
console.log('Result:', invalidEventResult.success ? '✗ FAIL (should have failed)' : '✓ PASS (correctly rejected)');
if (!invalidEventResult.success) {
  console.log('Errors:', formatValidationErrors(invalidEventResult.errors));
}

// Test 5: Valid user profile
console.log('\n5. Testing valid user profile...');
const validProfile = {
  userId: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  name: 'Test User',
  preferences: {
    topics: ['philosophy', 'science'],
    contentTypes: ['article'],
    emailFrequency: 'weekly',
  },
  behavior: {
    lastActive: Date.now(),
    totalViews: 10,
    totalPurchases: 0,
  },
  privacy: {
    trackingConsent: true,
    emailConsent: true,
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const profileResult = validate(userProfileSchema, validProfile);
console.log('Result:', profileResult.success ? '✓ PASS' : '✗ FAIL');
if (!profileResult.success) {
  console.log('Errors:', formatValidationErrors(profileResult.errors));
}

// Test 6: Invalid user profile (invalid email)
console.log('\n6. Testing invalid user profile (invalid email)...');
const invalidProfile = {
  ...validProfile,
  email: 'not-an-email',
};

const invalidProfileResult = validate(userProfileSchema, invalidProfile);
console.log('Result:', invalidProfileResult.success ? '✗ FAIL (should have failed)' : '✓ PASS (correctly rejected)');
if (!invalidProfileResult.success) {
  console.log('Errors:', formatValidationErrors(invalidProfileResult.errors));
}

console.log('\n' + '='.repeat(50));
console.log('Validation tests completed!\n');
