# Requirements Document: Inquiry Growth Engine (Asterion)

## Introduction

The Inquiry Growth Engine (codename: Asterion) is an AWS-leveraged, AI-driven marketing and recommendation system for Inquiry Institute designed to scale to millions of users. The system publishes AI-assisted content at high volume across multiple domains (articles, courses, products, events), personalizes recommendations based on real-time behavioral learning, converts traffic through multi-channel distribution, and preserves institutional quality through governance mechanisms.

## Requirement Priorities

Requirements are prioritized using the MoSCoW method:

- **P0 (Must Have)**: Critical for MVP launch. System cannot function without these.
- **P1 (Should Have)**: Important for initial success. Deliver in Phase 1 if possible.
- **P2 (Could Have)**: Valuable enhancements. Deliver in Phase 2 based on learnings.
- **P3 (Won't Have Initially)**: Future considerations. Defer until product-market fit is proven.

## Success Metrics

The system's success will be measured by:

1. **User Engagement**: 30% increase in content consumption per user within 6 months
2. **Conversion Rate**: 5% conversion rate from free to paid content
3. **Content Velocity**: Publish 50 pieces of quality content per week (vs. current 10)
4. **Recommendation CTR**: 15% click-through rate on personalized recommendations
5. **Cost Efficiency**: Content production cost < $50 per piece (including AI costs)
6. **System Reliability**: 99.9% uptime for core services

## Cost Constraints

- **Phase 1 Budget**: $10,000/month AWS infrastructure
- **AI API Costs**: < $2,000/month for Bedrock usage
- **Target at Scale**: < $0.50 per active user per month

## Phased Delivery

### Phase 1: Core Content & Recommendations (Months 1-3)
- Single-domain content publishing (articles only)
- Basic behavioral tracking
- Simple recommendation engine (rules + vector similarity)
- Web-only distribution
- Manual content review

**Success Criteria**: 10,000 active users, 15% recommendation CTR, 20 articles/week

### Phase 2: Multi-Domain & AI Assistance (Months 4-6)
- Multi-domain content (courses, products, events)
- AI-assisted content creation
- Enhanced recommendations (add graph layer)
- Email distribution
- Automated quality scoring

**Success Criteria**: 50,000 active users, 5% conversion rate, 50 pieces/week

### Phase 3: Scale & Intelligence (Months 7-12)
- Multi-agent orchestration
- Learned ranking models
- Faculty persona agents
- Social media distribution
- Advanced personalization

**Success Criteria**: 100,000+ active users, system scales to target load

## Glossary

- **Asterion**: Internal codename for the Inquiry Growth Engine
- **Content_Publisher**: System component responsible for publishing content across multiple domains
- **Recommendation_Engine**: System component that generates personalized content recommendations
- **Multi_Agent_System**: Orchestration system managing specialized AI agents for different tasks
- **Signal_Agent**: Agent that monitors and interprets user behavioral signals
- **Editorial_Agent**: Agent that assists with content creation and curation
- **Distribution_Agent**: Agent that manages multi-channel content distribution
- **Governance_Agent**: Agent that ensures content quality and institutional standards
- **User_Graph**: Graph database representing relationships between users, content, and topics
- **Canonical_Event**: Standardized event format for tracking user interactions
- **Personalization_Service**: Service that customizes user experience based on preferences and behavior
- **Content_Domain**: Category of content (articles, courses, products, events)
- **Distribution_Channel**: Medium for content delivery (web, email, social media)
- **Behavioral_Signal**: User interaction data used for learning and personalization
- **Recommendation_Layer**: One of four recommendation strategies (rules, graph, vector, learned)
- **Faculty_Persona**: AI agent representing institutional expertise in specific domains
- **Event_Stream**: Real-time flow of canonical events through the system
- **RAG_System**: Retrieval-Augmented Generation system for AI content assistance
- **Ranking_Model**: Machine learning model that orders recommendations by relevance

## Requirements

### Requirement 1: Content Publishing System (P0 - Phase 1)

**User Story:** As a content manager, I want to publish articles with metadata, so that users can discover and consume content.

**Business Value:** Core capability enabling all other features. Without content, there's no system.

**Cost Impact:** ~$500/month (DynamoDB + S3 + CloudFront)

#### Acceptance Criteria

1. THE Content_Publisher SHALL support publishing to article domain
2. WHEN content is published, THE Content_Publisher SHALL assign a unique identifier (UUID)
3. WHEN content is published, THE Content_Publisher SHALL record metadata including title, description, author, topics, and publication timestamp
4. THE Content_Publisher SHALL validate required fields (title, description, body) before publication
5. IF content validation fails, THEN THE Content_Publisher SHALL return HTTP 400 with field-level error details
6. THE Content_Publisher SHALL store content in DynamoDB with GSI on publishedAt for chronological queries
7. THE Content_Publisher SHALL store content assets (images) in S3 with CloudFront CDN
8. THE Content_Publisher SHALL support content states: draft, published, archived

#### Phase 2 Extensions
- Support for course, product, and event domains
- Scheduled publication
- Content expiration dates

#### Non-Functional Requirements
- Publication latency: < 1 second (p95)
- Storage cost: < $0.01 per article
- Availability: 99.9%

### Requirement 2: Behavioral Event Tracking (P0 - Phase 1)

**User Story:** As a data analyst, I want to capture user interactions with content, so that the system can learn user preferences.

**Business Value:** Foundation for personalization. Without behavioral data, recommendations are random.

**Cost Impact:** ~$1,500/month at 100K events/day (Kinesis + Lambda + DynamoDB)

#### Acceptance Criteria

1. WHEN a user views content, THE Signal_Agent SHALL capture a view event
2. WHEN a user clicks a recommendation, THE Signal_Agent SHALL capture a click event
3. THE Canonical_Event SHALL include: eventId (UUID), eventType, userId (nullable), contentId, sessionId, timestamp
4. THE Canonical_Event SHALL include device context: userAgent, deviceType (mobile/tablet/desktop)
5. WHEN a Canonical_Event is captured, THE Signal_Agent SHALL publish it to Kinesis stream within 500 milliseconds
6. THE Event_Processor SHALL write events to DynamoDB for user history queries
7. THE Event_Processor SHALL update user behavior metrics (total views, last active timestamp)
8. IF event capture fails, THEN THE client SDK SHALL buffer events in localStorage and retry on next page load

#### Phase 2 Extensions
- Additional event types: share, purchase, completion
- Real-time event processing (< 100ms)
- Session replay capabilities

#### Non-Functional Requirements
- Event capture success rate: > 99%
- Processing throughput: 1,000 events/second (Phase 1), 10,000 events/second (Phase 3)
- Event retention: 7 days in hot storage, 7 years in S3 archive
- Privacy: IP addresses hashed, no PII in events

#### Error Handling
- Network failures: Client-side buffering with exponential backoff
- Validation failures: Log error, drop event, alert if error rate > 1%
- Processing failures: Dead letter queue after 3 retries

### Requirement 3: Content Search (P0 - Phase 1)

**User Story:** As a user, I want to search for content by keywords, so that I can find specific information quickly.

**Business Value:** Essential for content discovery. Users need to find content beyond recommendations.

**Cost Impact:** ~$800/month (OpenSearch Serverless at 10K documents)

#### Acceptance Criteria

1. THE Search_Service SHALL provide full-text search across article titles, descriptions, and body text
2. THE Search_Service SHALL use AWS OpenSearch Serverless for indexing and querying
3. WHEN a user submits a search query, THE Search_Service SHALL return results within 500 milliseconds (p95)
4. THE Search_Service SHALL rank results by BM25 relevance score
5. THE Search_Service SHALL return result snippets with query term highlighting
6. THE Search_Service SHALL support fuzzy matching for queries with typos (edit distance ≤ 2)
7. WHEN content is published, THE Search_Service SHALL index it within 5 seconds
8. THE Search_Service SHALL return top 20 results per query

#### Phase 2 Extensions
- Faceted search (filter by topic, date, content type)
- Search suggestions (autocomplete)
- Semantic search using embeddings

#### Non-Functional Requirements
- Search latency: < 500ms (p95)
- Index update latency: < 5 seconds
- Search availability: 99.9%

#### Example Query
```
Query: "artificial intelligence ethics"
Returns: Articles containing these terms, ranked by relevance
Highlights: "...discusses <em>artificial intelligence</em> and <em>ethics</em>..."
```

### Requirement 4: Two-Layer Recommendation Engine (P0 - Phase 1)

**User Story:** As a user, I want to receive personalized content recommendations, so that I can discover relevant content efficiently.

**Business Value:** Core differentiation. Personalization drives engagement and conversion.

**Cost Impact:** ~$1,200/month (OpenSearch vector search + Lambda compute)

**Design Decision:** Start with 2 proven approaches (rules + vector similarity) rather than 4 unvalidated layers. Add graph and learned layers in Phase 2/3 based on performance data.

#### Acceptance Criteria

1. THE Recommendation_Engine SHALL implement rules-based layer for explicit user preferences
2. THE Recommendation_Engine SHALL implement vector similarity layer using content embeddings
3. WHEN generating recommendations, THE Recommendation_Engine SHALL combine results from both layers
4. THE Recommendation_Engine SHALL apply diversity constraint: maximum 40% from single topic
5. WHEN a user requests recommendations, THE Recommendation_Engine SHALL return 10 results within 500 milliseconds (p95)
6. THE Recommendation_Engine SHALL cache recommendations in Redis with 5-minute TTL
7. THE Recommendation_Engine SHALL log all recommendations for A/B testing analysis
8. THE Recommendation_Engine SHALL provide explanation for each recommendation

#### Rules-Based Layer (Weight: 40%)
- User explicitly favorited topics → boost content with those topics
- User's recent views → exclude already-viewed content
- Trending content (high engagement last 7 days) → boost by 20%
- Implementation: DynamoDB queries with score calculation

#### Vector Similarity Layer (Weight: 60%)
- Generate embedding for user's recent interactions (average of last 10 viewed articles)
- Find content with highest cosine similarity to user embedding
- Implementation: OpenSearch k-NN search with HNSW index

#### Recommendation Scoring
```
final_score = (rules_score * 0.4) + (vector_score * 0.6)
Apply diversity penalty if topic over-represented
Sort by final_score descending
```

#### Phase 2 Extensions
- Graph-based layer (collaborative filtering)
- Learned ranking layer (Amazon Personalize)
- Real-time personalization based on session behavior

#### Non-Functional Requirements
- Recommendation latency: < 500ms (p95)
- Cache hit rate: > 80%
- Diversity score: > 0.6 (Shannon entropy across topics)
- Explanation clarity: > 70% user satisfaction (survey)

#### A/B Testing Plan
- Control: Random recommendations
- Treatment: Two-layer personalized recommendations
- Metric: Click-through rate
- Sample size: 10,000 users per cohort
- Duration: 2 weeks
- Success threshold: 20% CTR improvement

### Requirement 5: Content Embedding Generation (P0 - Phase 1)

**User Story:** As a recommendation engineer, I want vector embeddings for all content, so that I can compute semantic similarity for recommendations.

**Business Value:** Enables vector similarity recommendations. Critical for Phase 1 recommendation engine.

**Cost Impact:** ~$200/month (Bedrock embeddings: $0.0001 per 1K tokens, ~50K articles = $5 + storage)

#### Acceptance Criteria

1. WHEN content is published, THE Embedding_Service SHALL generate a vector embedding within 10 seconds
2. THE Embedding_Service SHALL use AWS Bedrock Titan Embeddings model (1536 dimensions)
3. THE Embedding_Service SHALL create embedding from concatenated title + description + first 500 words of body
4. THE Embedding_Service SHALL store embeddings in OpenSearch vector index with HNSW algorithm
5. WHEN querying for similar content, THE Embedding_Service SHALL use cosine similarity metric
6. THE Embedding_Service SHALL return top-20 similar content items within 200 milliseconds
7. IF embedding generation fails, THEN THE system SHALL retry 3 times with exponential backoff, then alert
8. THE Embedding_Service SHALL batch process embeddings (up to 25 per request) to reduce API costs

#### Phase 2 Extensions
- Fine-tuned embeddings on institutional content
- Multi-modal embeddings (text + images)
- Embedding model versioning and migration

#### Non-Functional Requirements
- Embedding generation latency: < 10 seconds per article
- Similarity search latency: < 200ms (p95)
- Embedding cost: < $0.001 per article
- Model: Titan Embeddings V2 (1536-dim, $0.0001 per 1K tokens)

#### Cost Calculation
```
50,000 articles × 1,000 tokens avg × $0.0001 per 1K tokens = $5 one-time
New articles: 50/week × 1,000 tokens × $0.0001 = $0.005/week
Storage: 50K articles × 1536 dims × 4 bytes = 307 MB (negligible)
```

### Requirement 6: User Authentication (P0 - Phase 1)

**User Story:** As a user, I want secure authentication, so that my account and preferences are protected.

**Business Value:** Required for personalization and paid content access.

**Cost Impact:** ~$300/month (Cognito: $0.0055 per MAU for first 50K users)

#### Acceptance Criteria

1. THE Auth_Service SHALL support email/password authentication
2. THE Auth_Service SHALL use AWS Cognito for user management
3. WHEN a user registers, THE Auth_Service SHALL require email verification
4. WHEN a user authenticates, THE Auth_Service SHALL issue JWT token with 24-hour expiration
5. THE Auth_Service SHALL enforce password requirements: minimum 12 characters, 1 uppercase, 1 lowercase, 1 number
6. WHEN a user fails authentication 5 times, THE Auth_Service SHALL lock account for 15 minutes
7. THE Auth_Service SHALL support password reset via email
8. THE Auth_Service SHALL log all authentication attempts for security audit

#### Phase 2 Extensions
- Social authentication (Google, Apple)
- Multi-factor authentication
- Role-based access control for admin functions

#### Non-Functional Requirements
- Authentication latency: < 500ms (p95)
- Token validation latency: < 50ms (cached)
- Availability: 99.95%
- Security: Passwords hashed with bcrypt (cost factor 12)

#### Cost Calculation
```
10,000 MAU × $0.0055 = $55/month (Phase 1)
50,000 MAU × $0.0055 = $275/month (Phase 2)
100,000 MAU × $0.0050 = $500/month (Phase 3, volume discount)
```

### Requirement 7: User Profile Management (P0 - Phase 1)

**User Story:** As a user, I want to set my content preferences, so that I receive relevant recommendations.

**Business Value:** Enables rules-based recommendations and respects user control.

**Cost Impact:** Included in DynamoDB costs (~$100/month for 100K users)

#### Acceptance Criteria

1. THE Profile_Service SHALL store user preferences in DynamoDB
2. THE Profile_Service SHALL support preference categories: favorite topics, content types, email frequency
3. WHEN a user updates preferences, THE Profile_Service SHALL apply changes to future recommendations immediately
4. THE Profile_Service SHALL cache active user profiles in Redis with 10-minute TTL
5. WHEN a user signs in, THE Profile_Service SHALL load profile within 200 milliseconds (p95)
6. THE Profile_Service SHALL track behavioral metrics: last active, total views, total purchases
7. THE Profile_Service SHALL support privacy controls: opt-out of behavioral tracking, opt-out of emails
8. WHERE a user opts out of tracking, THE system SHALL provide non-personalized recommendations

#### User Profile Schema
```typescript
interface UserProfile {
  userId: string;              // Cognito user ID
  email: string;
  name: string;
  preferences: {
    topics: string[];          // e.g., ["philosophy", "science"]
    contentTypes: string[];    // e.g., ["article", "course"]
    emailFrequency: "daily" | "weekly" | "never";
  };
  behavior: {
    lastActive: Date;
    totalViews: number;
    totalPurchases: number;
  };
  privacy: {
    trackingConsent: boolean;
    emailConsent: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

#### Phase 2 Extensions
- Advanced segmentation for targeting
- A/B test cohort assignment
- Data export (GDPR compliance)

#### Non-Functional Requirements
- Profile load latency: < 200ms (p95)
- Cache hit rate: > 90%
- Update latency: < 300ms

### Requirement 8: AI-Assisted Content Creation (P1 - Phase 2)

**User Story:** As a content creator, I want AI assistance for drafting articles, so that I can produce content more efficiently.

**Business Value:** Increases content velocity from 10 to 50 pieces/week. Critical for scaling.

**Cost Impact:** ~$1,500/month (Bedrock Claude: $3 per 1M input tokens, $15 per 1M output tokens)

**Design Decision:** Single-purpose AI assistant, not multi-agent system. Defer agent orchestration to Phase 3.

#### Acceptance Criteria

1. THE Editorial_Assistant SHALL use AWS Bedrock Claude 3.5 Sonnet for content generation
2. WHEN a creator provides a topic and outline, THE Editorial_Assistant SHALL generate article draft within 30 seconds
3. THE Editorial_Assistant SHALL generate drafts of 800-1200 words
4. THE Editorial_Assistant SHALL use RAG to ground content in existing institutional articles
5. THE RAG_System SHALL retrieve top-5 relevant articles from OpenSearch vector index
6. THE Editorial_Assistant SHALL include inline citations to source articles
7. THE Editorial_Assistant SHALL flag AI-generated content with metadata: `aiAssisted: true, model: "claude-3.5-sonnet"`
8. ALL AI-generated content SHALL require human review before publication

#### RAG Implementation
```
1. User provides topic: "Ethics of AI in Healthcare"
2. Generate query embedding from topic
3. Search OpenSearch for top-5 similar articles
4. Construct prompt:
   - System: "You are an expert writer for Inquiry Institute..."
   - Context: Retrieved article excerpts
   - User: Topic and outline
5. Generate draft with Claude 3.5 Sonnet
6. Return draft with citations
```

#### Quality Controls
- Human review required (no auto-publish)
- Plagiarism check against source articles (> 80% similarity = reject)
- Readability score (Flesch-Kincaid grade level 10-12)
- Institutional style guide compliance (manual review)

#### Phase 3 Extensions
- Multi-agent workflow (Editorial + Governance agents)
- Automated fact-checking
- SEO optimization suggestions

#### Non-Functional Requirements
- Generation latency: < 30 seconds (p95)
- Cost per draft: < $0.50
- Quality: 70% of drafts publishable with minor edits (measured by editor survey)

#### Cost Calculation
```
50 articles/week × 4 weeks = 200 articles/month
Input: 5 articles × 1000 tokens + 200 token prompt = 5,200 tokens
Output: 1,000 tokens
Cost per article: (5,200 × $3 + 1,000 × $15) / 1M = $0.03
Total: 200 × $0.03 = $6/month (well under budget)
```

### Requirement 9: Email Distribution (P1 - Phase 2)

**User Story:** As a marketing manager, I want to send personalized email campaigns, so that I can engage users via email.

**Business Value:** Email drives 30% of content traffic. Critical for user retention.

**Cost Impact:** ~$400/month (SES: $0.10 per 1K emails, 100K emails/month = $10 + infrastructure)

#### Acceptance Criteria

1. THE Email_Service SHALL support creating email campaigns with subject, body template, and audience segment
2. THE Email_Service SHALL use AWS SES for email delivery
3. WHEN sending a campaign, THE Email_Service SHALL personalize emails with user name and recommended content
4. THE Email_Service SHALL support scheduling campaigns for future delivery
5. THE Email_Service SHALL track email metrics: sent, delivered, opened, clicked, bounced
6. THE Email_Service SHALL respect user email preferences (frequency, opt-out)
7. WHEN a user unsubscribes, THE Email_Service SHALL honor opt-out within 1 hour
8. THE Email_Service SHALL rate-limit sending to 14 emails/second (SES default limit)

#### Email Template Example
```
Subject: Your weekly reading from Inquiry Institute

Hi {{user.name}},

Based on your interests in {{user.topics}}, here are this week's top articles:

{{#each recommendations}}
- {{this.title}} ({{this.readTime}} min read)
  {{this.description}}
  [Read more]({{this.url}})
{{/each}}

[Update preferences] | [Unsubscribe]
```

#### Audience Segmentation
- Active users (viewed content in last 7 days)
- Inactive users (no activity in 30 days)
- Topic-based (users interested in specific topics)
- Behavioral (users who clicked recommendations)

#### Phase 3 Extensions
- A/B testing of subject lines
- Send-time optimization
- Social media distribution

#### Non-Functional Requirements
- Delivery rate: > 95%
- Open rate target: > 20%
- Click rate target: > 5%
- Bounce rate: < 2%
- Unsubscribe rate: < 0.5%

#### Cost Calculation
```
50,000 users × 2 emails/month = 100,000 emails
SES: 100K × $0.10/1K = $10/month
Lambda processing: negligible
Total: ~$10/month
```

### Requirement 10: Content Versioning (P1 - Phase 2)

**User Story:** As a content manager, I want to track content changes over time, so that I can review history and revert changes if needed.

**Business Value:** Enables collaborative editing and quality control. Reduces risk of content errors.

**Cost Impact:** ~$200/month (DynamoDB storage for versions)

#### Acceptance Criteria

1. WHEN content is modified, THE Content_Publisher SHALL create new version record
2. THE Content_Publisher SHALL preserve previous version with metadata: author, timestamp, change description
3. THE Content_Publisher SHALL support viewing version history (list of all versions)
4. THE Content_Publisher SHALL support comparing two versions (diff view)
5. THE Content_Publisher SHALL support reverting to previous version
6. THE Content_Publisher SHALL maintain audit trail of all content operations
7. THE audit trail SHALL include: operation type (create/update/delete), user, timestamp, content ID
8. THE system SHALL retain versions indefinitely (storage is cheap)

#### Non-Functional Requirements
- Version creation latency: < 500ms
- Version history query: < 300ms
- Storage cost: ~$0.25 per GB per month (DynamoDB)

---

### Requirement 11: Analytics Dashboard (P1 - Phase 2)

**User Story:** As a business analyst, I want to view key performance metrics, so that I can monitor system health and user engagement.

**Business Value:** Data-driven decision making. Identifies what's working and what needs improvement.

**Cost Impact:** ~$500/month (CloudWatch + QuickSight)

#### Acceptance Criteria

1. THE Analytics_Dashboard SHALL display key metrics: active users, content views, recommendation CTR, conversion rate
2. THE Analytics_Dashboard SHALL update metrics every 5 minutes
3. THE Analytics_Dashboard SHALL support time range filtering: last 24 hours, 7 days, 30 days, custom
4. THE Analytics_Dashboard SHALL display metric trends (% change vs. previous period)
5. THE Analytics_Dashboard SHALL support segmentation by content domain and user segment
6. THE Analytics_Dashboard SHALL provide alerting when metrics exceed thresholds
7. WHEN CTR drops below 10%, THE system SHALL send alert to product team
8. THE Analytics_Dashboard SHALL use AWS QuickSight for visualization

#### Key Metrics
- Daily Active Users (DAU)
- Content views per user
- Recommendation CTR
- Search usage rate
- Email open/click rates
- Content publication rate
- AI assistance usage rate

#### Non-Functional Requirements
- Dashboard load time: < 3 seconds
- Metric freshness: < 5 minutes
- Availability: 99%

---

### Requirement 12: A/B Testing Framework (P2 - Phase 2)

**User Story:** As a product manager, I want to run controlled experiments, so that I can validate hypotheses and optimize features.

**Business Value:** De-risks product decisions. Enables data-driven optimization.

**Cost Impact:** ~$300/month (DynamoDB for experiment data)

#### Acceptance Criteria

1. THE Experiment_Service SHALL support creating A/B test experiments with control and treatment groups
2. THE Experiment_Service SHALL randomly assign users to cohorts (50/50 split)
3. THE Experiment_Service SHALL maintain consistent cohort assignment across sessions
4. THE Experiment_Service SHALL track experiment metrics by cohort
5. THE Experiment_Service SHALL calculate statistical significance using chi-square test
6. THE Experiment_Service SHALL support experiment duration limits (auto-conclude after 30 days)
7. THE Experiment_Service SHALL prevent users from being in multiple experiments simultaneously
8. WHEN experiment reaches statistical significance (p < 0.05), THE system SHALL notify product team

#### Example Experiment
```
Experiment: "Two-layer vs. Random Recommendations"
Control: Random recommendations
Treatment: Two-layer personalized recommendations
Metric: Click-through rate
Sample size: 10,000 users per cohort
Duration: 14 days
Success threshold: 20% CTR improvement
```

#### Non-Functional Requirements
- Cohort assignment latency: < 50ms
- Experiment isolation: 100% (no cross-contamination)

---

### Requirement 13: Rate Limiting (P0 - Phase 1)

**User Story:** As a system architect, I want to protect the system from overload, so that it remains available during traffic spikes.

**Business Value:** Prevents abuse and ensures fair resource allocation. Protects against DDoS.

**Cost Impact:** Included in API Gateway costs

#### Acceptance Criteria

1. THE API_Gateway SHALL implement rate limiting for all API endpoints
2. THE API_Gateway SHALL enforce limit of 100 requests per minute per authenticated user
3. THE API_Gateway SHALL enforce limit of 20 requests per minute per IP address for unauthenticated requests
4. WHEN rate limit is exceeded, THE API_Gateway SHALL return HTTP 429 with Retry-After header
5. THE API_Gateway SHALL use token bucket algorithm for rate limiting
6. THE API_Gateway SHALL prioritize authenticated requests over anonymous during high load
7. THE API_Gateway SHALL log rate limit violations
8. WHEN violation rate exceeds 5%, THE system SHALL alert operations team

#### Rate Limits by Endpoint
- GET /api/content: 100/min per user
- GET /api/recommendations: 20/min per user
- POST /api/events: 200/min per user (higher for tracking)
- POST /api/search: 50/min per user
- POST /api/content: 10/min per user (content creation)

#### Non-Functional Requirements
- Rate limit enforcement latency: < 10ms
- False positive rate: < 0.1%

---

### Requirement 14: Monitoring and Alerting (P0 - Phase 1)

**User Story:** As a DevOps engineer, I want comprehensive system monitoring, so that I can detect and resolve issues quickly.

**Business Value:** Reduces downtime. Enables proactive issue resolution.

**Cost Impact:** ~$400/month (CloudWatch + X-Ray)

#### Acceptance Criteria

1. THE system SHALL collect metrics for all components (Lambda, API Gateway, DynamoDB, OpenSearch)
2. THE system SHALL use AWS CloudWatch for metrics collection and visualization
3. THE system SHALL collect distributed traces for API requests using AWS X-Ray
4. THE system SHALL aggregate logs in CloudWatch Logs
5. WHEN error rate exceeds 1%, THE system SHALL trigger PagerDuty alert
6. WHEN API latency p95 exceeds 1 second, THE system SHALL trigger alert
7. WHEN DynamoDB throttling occurs, THE system SHALL trigger alert
8. THE system SHALL provide service health dashboard showing component status (green/yellow/red)

#### Key Metrics
- API request rate and latency (p50, p95, p99)
- Error rate by endpoint
- Lambda invocation count, duration, errors
- DynamoDB read/write capacity utilization
- OpenSearch query latency
- Kinesis stream throughput
- Cache hit rate

#### Alert Thresholds
- Error rate > 1%: Page on-call engineer
- API latency p95 > 1s: Warning alert
- DynamoDB throttling: Warning alert
- Lambda cold start rate > 10%: Info alert

#### Non-Functional Requirements
- Metric collection latency: < 1 minute
- Alert delivery latency: < 2 minutes
- Dashboard load time: < 3 seconds

### Requirement 15: GDPR Compliance (P1 - Phase 2)

**User Story:** As a user, I want control over my personal data, so that my privacy rights are respected.

**Business Value:** Legal compliance. Required for EU users. Builds trust.

**Cost Impact:** ~$500/month (engineering time for data export/deletion workflows)

**Design Decision:** Implement data deletion as logical deletion with 90-day purge, not immediate physical deletion. This balances GDPR compliance with system integrity.

#### Acceptance Criteria

1. THE system SHALL provide user data export in JSON format within 48 hours of request
2. THE data export SHALL include: profile, preferences, content history, email history
3. THE system SHALL support user data deletion upon request
4. WHEN a user requests deletion, THE system SHALL logically delete data within 48 hours and physically purge within 90 days
5. THE system SHALL obtain explicit consent before collecting behavioral data (cookie banner)
6. THE system SHALL provide clear privacy policy describing data collection and usage
7. THE system SHALL support user opt-out of behavioral tracking (respects Do Not Track)
8. THE system SHALL encrypt personal data at rest (AES-256) and in transit (TLS 1.3)

#### Data Deletion Strategy
```
Immediate (< 48 hours):
- Mark user profile as deleted
- Stop all email communications
- Remove from recommendation system
- Anonymize user ID in future events

Delayed (90 days):
- Purge user profile from DynamoDB
- Delete historical events from S3
- Remove graph edges
- Retain aggregated analytics (no PII)
```

#### Challenges and Solutions
- **Challenge**: Deleting user from graph breaks recommendations for other users
- **Solution**: Replace user node with anonymous placeholder, preserve edge weights

- **Challenge**: Event streams are immutable
- **Solution**: Anonymize userId in events, don't delete events (legal under GDPR)

#### Non-Functional Requirements
- Data export generation: < 48 hours
- Deletion completion: < 48 hours (logical), < 90 days (physical)
- Compliance: GDPR Article 17 (Right to Erasure)

---

### Requirement 16: Multi-Domain Content (P2 - Phase 2)

**User Story:** As a content manager, I want to publish courses, products, and events in addition to articles, so that I can offer diverse content types.

**Business Value:** Expands content offerings. Enables monetization through courses and products.

**Cost Impact:** ~$300/month (additional DynamoDB tables and indexes)

**Design Decision:** Defer to Phase 2. Prove value with articles first, then expand.

#### Acceptance Criteria

1. THE Content_Publisher SHALL support course domain with lessons, duration, difficulty
2. THE Content_Publisher SHALL support product domain with price, inventory, purchase flow
3. THE Content_Publisher SHALL support event domain with date, location, registration
4. WHEN publishing non-article content, THE system SHALL validate domain-specific required fields
5. THE Recommendation_Engine SHALL support cross-domain recommendations
6. THE Search_Service SHALL support filtering by content domain
7. THE Analytics_Dashboard SHALL segment metrics by content domain

#### Domain-Specific Fields
```typescript
interface Course extends Content {
  domain: 'course';
  lessons: Array<{title: string; duration: number}>;
  totalDuration: number;  // minutes
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  price?: number;
}

interface Product extends Content {
  domain: 'product';
  price: number;
  inventory: number;
  shippingRequired: boolean;
}

interface Event extends Content {
  domain: 'event';
  eventDate: Date;
  location: string;
  capacity: number;
  registrationUrl: string;
}
```

---

### Requirement 17: Graph-Based Recommendations (P2 - Phase 3)

**User Story:** As a user, I want recommendations based on what similar users enjoyed, so that I discover content through collaborative filtering.

**Business Value:** Improves recommendation quality. Addresses cold-start problem for new content.

**Cost Impact:** ~$800/month (OpenSearch graph queries)

**Design Decision:** Defer to Phase 3. Validate two-layer approach first, then add graph layer if needed.

#### Acceptance Criteria

1. THE Recommendation_Engine SHALL implement graph-based layer using user-content-topic graph
2. THE User_Graph SHALL store user nodes, content nodes, and topic nodes in OpenSearch
3. THE User_Graph SHALL create edges when users interact with content (viewed, purchased)
4. WHEN generating graph recommendations, THE system SHALL find similar users (shared interests)
5. THE system SHALL recommend content that similar users engaged with
6. THE graph layer SHALL contribute 30% weight to final recommendation score
7. THE system SHALL update graph edges in near-real-time (< 5 seconds)

#### Graph Query Example
```
Find recommendations for user123:
1. Find users with similar interests (shared topic edges)
2. Find content those users engaged with
3. Exclude content user123 already viewed
4. Rank by edge weight (engagement strength)
5. Return top 20 candidates
```

---

### Requirement 18: Learned Ranking Model (P3 - Phase 3)

**User Story:** As a user, I want recommendations that improve over time based on my behavior, so that the system learns my preferences.

**Business Value:** Maximizes recommendation quality. Competitive differentiation.

**Cost Impact:** ~$2,000/month (Amazon Personalize)

**Design Decision:** Defer to Phase 3. Requires significant training data (100K+ interactions). Not viable for MVP.

#### Acceptance Criteria

1. THE Recommendation_Engine SHALL implement learned layer using Amazon Personalize
2. THE Ranking_Model SHALL train on historical interaction data (views, clicks, purchases)
3. THE Ranking_Model SHALL incorporate user features, content features, and contextual features
4. THE Ranking_Model SHALL retrain weekly or when performance degrades below 0.7 AUC
5. THE learned layer SHALL contribute 40% weight to final recommendation score
6. THE system SHALL A/B test learned model against baseline before full rollout

#### Training Requirements
- Minimum 100,000 interactions
- Minimum 1,000 users
- Minimum 1,000 content items
- Training time: 2-4 hours
- Retraining frequency: Weekly

---

### Requirement 19: Faculty Persona Agents (P3 - Phase 3)

**User Story:** As a user, I want to interact with AI agents representing institutional expertise, so that I can receive authoritative guidance in specific domains.

**Business Value:** Differentiates from generic AI chatbots. Embodies institutional knowledge.

**Cost Impact:** ~$3,000/month (Bedrock API costs for conversational AI)

**Design Decision:** Defer to Phase 3. High cost, unproven ROI. Validate core features first.

#### Acceptance Criteria

1. THE system SHALL support Faculty_Persona agents for key domains (philosophy, science, arts)
2. EACH Faculty_Persona SHALL use RAG to ground responses in institutional content
3. WHEN a user queries a Faculty_Persona, THE agent SHALL respond within 5 seconds
4. THE Faculty_Persona SHALL provide source citations for factual claims
5. THE Faculty_Persona SHALL acknowledge knowledge limitations and suggest human experts
6. THE system SHALL track interaction quality metrics (user satisfaction, citation accuracy)

---

### Requirement 20: Multi-Agent Orchestration (P3 - Phase 3)

**User Story:** As a system architect, I want specialized AI agents to handle different tasks, so that the system can scale efficiently.

**Business Value:** Enables complex workflows. Separates concerns.

**Cost Impact:** ~$1,000/month (Step Functions + additional Bedrock usage)

**Design Decision:** Defer to Phase 3. Single-purpose AI assistant (Req 8) sufficient for Phase 2. Add orchestration when workflows become complex.

#### Acceptance Criteria

1. THE Multi_Agent_System SHALL orchestrate Editorial_Agent, Governance_Agent, Distribution_Agent
2. THE Multi_Agent_System SHALL use AWS Step Functions for workflow coordination
3. WHEN an agent completes a task, THE system SHALL trigger dependent agents via EventBridge
4. IF an agent fails, THE system SHALL execute error handling workflow and alert operations
5. THE system SHALL log all agent interactions for audit

#### Example Workflow
```
Content Publication Workflow:
1. Creator submits draft
2. Editorial Agent enhances content
3. Governance Agent reviews quality
4. If approved: Publish content
5. Distribution Agent sends email campaign
6. Track engagement metrics
```

---

### Requirement 21: Disaster Recovery (P2 - Phase 2)

**User Story:** As a system architect, I want disaster recovery capabilities, so that the system can recover from catastrophic failures.

**Business Value:** Protects against data loss. Ensures business continuity.

**Cost Impact:** ~$600/month (cross-region replication, backups)

#### Acceptance Criteria

1. THE system SHALL maintain automated daily backups of DynamoDB tables with 30-day retention
2. THE system SHALL replicate data across multiple AWS availability zones
3. THE system SHALL support recovery point objective (RPO) of 4 hours
4. THE system SHALL support recovery time objective (RTO) of 8 hours
5. THE system SHALL maintain disaster recovery runbook with step-by-step procedures
6. THE system SHALL test backup restoration quarterly to verify integrity
7. THE system SHALL use AWS Backup for centralized backup management

#### Backup Strategy
- DynamoDB: Point-in-time recovery (35-day retention)
- S3: Versioning enabled, cross-region replication
- OpenSearch: Automated snapshots (daily, 14-day retention)

---

## Deferred Requirements (P3 - Future)

The following requirements are valuable but deferred until product-market fit is proven:

### Requirement 22: Social Media Distribution
- Automated posting to Twitter, LinkedIn, Facebook
- Engagement tracking
- Cost: ~$500/month
- Rationale: Email is higher ROI, focus there first

### Requirement 23: Advanced Search Features
- Faceted search, autocomplete, semantic search
- Cost: ~$400/month
- Rationale: Basic search sufficient for Phase 1

### Requirement 24: Content Moderation
- Automated detection of inappropriate content
- User reporting and review workflow
- Cost: ~$800/month
- Rationale: Not needed until user-generated content

### Requirement 25: Mobile Apps
- Native iOS and Android apps
- Push notifications
- Cost: ~$5,000/month (development + infrastructure)
- Rationale: Mobile web sufficient for Phase 1-2

### Requirement 26: Advanced Analytics
- Cohort analysis, funnel analysis, retention curves
- Cost: ~$1,000/month
- Rationale: Basic analytics sufficient for Phase 1-2

### Requirement 27: Internationalization
- Multi-language support
- Localized content
- Cost: ~$2,000/month
- Rationale: English-only for Phase 1-2

### Requirement 28: Public API for Developers
- RESTful API with documentation
- API key management
- Cost: ~$500/month
- Rationale: No external developers yet

### Requirement 29: Recommendation Explanations
- Human-readable explanations for recommendations
- Cost: ~$300/month
- Rationale: Nice-to-have, not critical for MVP

### Requirement 30: Content Scheduling
- Schedule content publication for future dates
- Cost: ~$200/month
- Rationale: Manual scheduling sufficient for Phase 1

---arse it into a Canonical_Event object
## Technical Requirements

### Requirement 22: Canonical Event Schema (P0 - Phase 1)

**User Story:** As a system integrator, I want a standardized event format, so that all components process events consistently.

**Business Value:** Ensures data quality. Enables reliable analytics and personalization.

#### Event Schema v2.0
```typescript
interface CanonicalEvent {
  version: '2.0';
  eventId: string;               // UUID v4
  eventType: 'view' | 'click' | 'search' | 'purchase';
  timestamp: string;             // ISO 8601
  userId?: string;               // Null for anonymous
  sessionId: string;             // UUID v4
  contentId?: string;            // UUID v4
  metadata: {
    userAgent: string;
    deviceType: 'mobile' | 'tablet' | 'desktop';
    referrer?: string;
    ipHash?: string;             // SHA-256 hash for privacy
  };
}
```

#### Acceptance Criteria

1. THE Event_Validator SHALL validate events against JSON Schema
2. IF validation fails, THE system SHALL return HTTP 400 with field-level errors
3. THE Event_Validator SHALL support schema versions 1.0 and 2.0 for backward compatibility
4. THE system SHALL reject events with unknown schema versions
5. ALL event timestamps SHALL be in UTC
6. ALL event IDs SHALL be UUID v4 format

#### Validation Rules
- eventId: Required, UUID v4
- eventType: Required, enum
- timestamp: Required, ISO 8601, not future
- userId: Optional, UUID v4
- sessionId: Required, UUID v4
- contentId: Required for view/click events

---

### Requirement 23: API Specification (P0 - Phase 1)

**User Story:** As a frontend developer, I want a documented API, so that I can integrate with the backend.

**Business Value:** Enables frontend development. Reduces integration errors.

#### Core API Endpoints

```
Authentication:
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh

Content:
GET    /api/content?domain=article&limit=20&offset=0
GET    /api/content/:id
POST   /api/content (authenticated, admin only)
PUT    /api/content/:id (authenticated, admin only)

Search:
GET    /api/search?q=query&limit=20

Recommendations:
GET    /api/recommendations?userId=:id&count=10

Events:
POST   /api/events

User Profile:
GET    /api/users/:id/profile (authenticated)
PUT    /api/users/:id/profile (authenticated)
GET    /api/users/:id/history (authenticated)
```

#### API Standards
- RESTful design
- JSON request/response bodies
- JWT authentication (Bearer token)
- HTTP status codes: 200 (success), 400 (validation), 401 (unauthorized), 404 (not found), 429 (rate limit), 500 (server error)
- Pagination: limit/offset query parameters
- Versioning: /api/v1/ prefix (future-proofing)

---

### Requirement 24: Performance Targets (P0 - Phase 1)

**User Story:** As a user, I want fast page loads and responsive interactions, so that I have a smooth experience.

**Business Value:** User satisfaction. Reduces bounce rate.

#### Performance Targets

| Operation | Target (p95) | Rationale |
|-----------|--------------|-----------|
| Content page load | < 2 seconds | Industry standard for content sites |
| Search query | < 500ms | Users expect instant search |
| Recommendation load | < 500ms | Part of page load, must be fast |
| Event capture | < 200ms | Shouldn't block user interaction |
| Authentication | < 500ms | Infrequent operation, can be slower |
| Profile update | < 300ms | User expects immediate feedback |

#### Scalability Targets

| Metric | Phase 1 | Phase 2 | Phase 3 |
|--------|---------|---------|---------|
| Registered users | 10,000 | 50,000 | 100,000+ |
| Concurrent users | 500 | 2,500 | 5,000+ |
| Events/second | 100 | 500 | 1,000+ |
| Content items | 1,000 | 5,000 | 10,000+ |

#### Acceptance Criteria

1. THE system SHALL meet performance targets at Phase 1 scale
2. THE system SHALL conduct load testing before each phase launch
3. THE system SHALL use auto-scaling to handle traffic spikes
4. THE system SHALL maintain 99.9% uptime (43 minutes downtime/month)

---

### Requirement 25: Security Requirements (P0 - Phase 1)

**User Story:** As a security engineer, I want the system to follow security best practices, so that user data is protected.

**Business Value:** Protects user trust. Prevents data breaches.

#### Acceptance Criteria

1. THE system SHALL encrypt all data in transit using TLS 1.3
2. THE system SHALL encrypt sensitive data at rest using AES-256
3. THE system SHALL hash passwords using bcrypt with cost factor 12
4. THE system SHALL sanitize all user inputs to prevent XSS attacks
5. THE system SHALL use parameterized queries to prevent SQL injection
6. THE system SHALL implement CORS policies to prevent unauthorized access
7. THE system SHALL log all authentication attempts and admin actions
8. THE system SHALL conduct security audits quarterly

#### Security Controls
- API Gateway: Rate limiting, request validation
- Lambda: Least privilege IAM roles
- DynamoDB: Encryption at rest, VPC endpoints
- S3: Bucket policies, encryption, versioning
- Secrets Manager: API keys, database credentials
- CloudTrail: Audit logging for all AWS API calls

---

## Summary

This revised requirements document defines 25 core requirements organized into 3 phases:

**Phase 1 (P0 - Months 1-3): MVP**
- 14 requirements
- Budget: $10,000/month
- Goal: Prove core value with 10,000 users

**Phase 2 (P1 - Months 4-6): Growth**
- 7 additional requirements
- Budget: $15,000/month
- Goal: Scale to 50,000 users, 5% conversion

**Phase 3 (P2/P3 - Months 7-12): Scale**
- 4 additional requirements
- Budget: $25,000/month
- Goal: 100,000+ users, advanced AI features

**Deferred (Future):**
- 10 requirements postponed until product-market fit proven

Each requirement includes:
- Priority and phase
- Business value and cost impact
- Clear acceptance criteria
- Design decisions and rationale
- Non-functional requirements
- Cost calculations where applicable

The phased approach enables incremental delivery, validates assumptions early, and manages risk by deferring expensive features until core value is proven.
