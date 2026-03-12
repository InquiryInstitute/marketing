/**
 * Content Validation Utilities
 * Requirements: Req 1.4, 1.5 (Content validation)
 */

import { CreateContentRequest, UpdateContentRequest, ErrorResponse } from './types';

/**
 * Validate markdown syntax (basic check)
 */
function isValidMarkdown(text: string): boolean {
  // Basic markdown validation - check for common issues
  // More sophisticated validation could be added later
  
  // Check for unclosed code blocks
  const codeBlockMatches = text.match(/```/g);
  if (codeBlockMatches && codeBlockMatches.length % 2 !== 0) {
    return false;
  }

  return true;
}

/**
 * Validate create content request
 */
export function validateCreateRequest(data: any): {
  valid: boolean;
  error?: ErrorResponse;
  data?: CreateContentRequest;
} {
  const errors: Array<{ field: string; message: string }> = [];

  // Required fields
  if (!data.domain || typeof data.domain !== 'string') {
    errors.push({ field: 'domain', message: 'Domain is required and must be a string' });
  } else if (!['article', 'course', 'product', 'event'].includes(data.domain)) {
    errors.push({ field: 'domain', message: 'Domain must be one of: article, course, product, event' });
  }

  if (!data.title || typeof data.title !== 'string') {
    errors.push({ field: 'title', message: 'Title is required and must be a string' });
  } else if (data.title.length < 1 || data.title.length > 500) {
    errors.push({ field: 'title', message: 'Title must be between 1 and 500 characters' });
  }

  if (!data.description || typeof data.description !== 'string') {
    errors.push({ field: 'description', message: 'Description is required and must be a string' });
  } else if (data.description.length < 1 || data.description.length > 2000) {
    errors.push({ field: 'description', message: 'Description must be between 1 and 2000 characters' });
  }

  if (!data.body || typeof data.body !== 'string') {
    errors.push({ field: 'body', message: 'Body is required and must be a string' });
  } else if (data.body.length < 1) {
    errors.push({ field: 'body', message: 'Body cannot be empty' });
  } else if (!isValidMarkdown(data.body)) {
    errors.push({ field: 'body', message: 'Body contains invalid markdown syntax' });
  }

  if (!data.author || typeof data.author !== 'string') {
    errors.push({ field: 'author', message: 'Author is required and must be a string' });
  }

  if (!data.topics || !Array.isArray(data.topics)) {
    errors.push({ field: 'topics', message: 'Topics is required and must be an array' });
  } else if (data.topics.length < 1) {
    errors.push({ field: 'topics', message: 'At least one topic is required' });
  } else if (data.topics.length > 10) {
    errors.push({ field: 'topics', message: 'Maximum 10 topics allowed' });
  } else if (!data.topics.every((t: any) => typeof t === 'string')) {
    errors.push({ field: 'topics', message: 'All topics must be strings' });
  }

  // Optional fields
  if (data.tags !== undefined) {
    if (!Array.isArray(data.tags)) {
      errors.push({ field: 'tags', message: 'Tags must be an array' });
    } else if (data.tags.length > 20) {
      errors.push({ field: 'tags', message: 'Maximum 20 tags allowed' });
    } else if (!data.tags.every((t: any) => typeof t === 'string')) {
      errors.push({ field: 'tags', message: 'All tags must be strings' });
    }
  }

  if (data.state !== undefined) {
    if (!['draft', 'published', 'archived'].includes(data.state)) {
      errors.push({ field: 'state', message: 'State must be one of: draft, published, archived' });
    }
  }

  if (data.readTime !== undefined) {
    if (typeof data.readTime !== 'number' || data.readTime < 1) {
      errors.push({ field: 'readTime', message: 'Read time must be a positive number' });
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      error: {
        error: 'ValidationError',
        message: 'Request validation failed',
        fields: errors,
      },
    };
  }

  return {
    valid: true,
    data: {
      domain: data.domain,
      title: data.title,
      description: data.description,
      body: data.body,
      author: data.author,
      topics: data.topics,
      tags: data.tags || [],
      state: data.state || 'draft',
      readTime: data.readTime,
    },
  };
}

/**
 * Validate update content request
 */
export function validateUpdateRequest(data: any): {
  valid: boolean;
  error?: ErrorResponse;
  data?: UpdateContentRequest;
} {
  const errors: Array<{ field: string; message: string }> = [];

  // All fields are optional for update
  if (data.title !== undefined) {
    if (typeof data.title !== 'string') {
      errors.push({ field: 'title', message: 'Title must be a string' });
    } else if (data.title.length < 1 || data.title.length > 500) {
      errors.push({ field: 'title', message: 'Title must be between 1 and 500 characters' });
    }
  }

  if (data.description !== undefined) {
    if (typeof data.description !== 'string') {
      errors.push({ field: 'description', message: 'Description must be a string' });
    } else if (data.description.length < 1 || data.description.length > 2000) {
      errors.push({ field: 'description', message: 'Description must be between 1 and 2000 characters' });
    }
  }

  if (data.body !== undefined) {
    if (typeof data.body !== 'string') {
      errors.push({ field: 'body', message: 'Body must be a string' });
    } else if (data.body.length < 1) {
      errors.push({ field: 'body', message: 'Body cannot be empty' });
    } else if (!isValidMarkdown(data.body)) {
      errors.push({ field: 'body', message: 'Body contains invalid markdown syntax' });
    }
  }

  if (data.topics !== undefined) {
    if (!Array.isArray(data.topics)) {
      errors.push({ field: 'topics', message: 'Topics must be an array' });
    } else if (data.topics.length < 1) {
      errors.push({ field: 'topics', message: 'At least one topic is required' });
    } else if (data.topics.length > 10) {
      errors.push({ field: 'topics', message: 'Maximum 10 topics allowed' });
    } else if (!data.topics.every((t: any) => typeof t === 'string')) {
      errors.push({ field: 'topics', message: 'All topics must be strings' });
    }
  }

  if (data.tags !== undefined) {
    if (!Array.isArray(data.tags)) {
      errors.push({ field: 'tags', message: 'Tags must be an array' });
    } else if (data.tags.length > 20) {
      errors.push({ field: 'tags', message: 'Maximum 20 tags allowed' });
    } else if (!data.tags.every((t: any) => typeof t === 'string')) {
      errors.push({ field: 'tags', message: 'All tags must be strings' });
    }
  }

  if (data.state !== undefined) {
    if (!['draft', 'published', 'archived'].includes(data.state)) {
      errors.push({ field: 'state', message: 'State must be one of: draft, published, archived' });
    }
  }

  if (data.readTime !== undefined) {
    if (typeof data.readTime !== 'number' || data.readTime < 1) {
      errors.push({ field: 'readTime', message: 'Read time must be a positive number' });
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      error: {
        error: 'ValidationError',
        message: 'Request validation failed',
        fields: errors,
      },
    };
  }

  const updateData: UpdateContentRequest = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.body !== undefined) updateData.body = data.body;
  if (data.topics !== undefined) updateData.topics = data.topics;
  if (data.tags !== undefined) updateData.tags = data.tags;
  if (data.state !== undefined) updateData.state = data.state;
  if (data.readTime !== undefined) updateData.readTime = data.readTime;

  return {
    valid: true,
    data: updateData,
  };
}
