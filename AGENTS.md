# AGENTS.md

This file provides guidelines and commands for agentic coding assistants working on this repository.

## Build, Lint, and Test Commands

```bash
# Run all tests
npm test

# Run a single test file
npm test -- path/to/test/file.test.js

# Run tests matching a pattern
npm test -- --testNamePattern="pattern"

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Start the development server
npm start

# Run example server
npm run start:example

# Lint (currently no-op - ESLint configured but script is empty)
npm run lint
```

## Code Style Guidelines

### Module System
- Use **CommonJS** (`require`/`module.exports`) throughout the codebase
- Start all files with `'use strict';` directive
- Use relative paths for internal imports: `require('./utils/logger')`
- Use absolute paths for packages: `require('express')`

### Naming Conventions
- **Classes**: PascalCase (`LLMClient`, `OpenAIClient`)
- **Functions/Methods**: camelCase (`send`, `_executeWithRetry`)
- **Private methods**: Prefix with underscore (`_sendImplementation`, `_isRetryableError`)
- **Constants**: UPPER_SNAKE_CASE (rare, prefer const declarations)
- **Variables**: camelCase (`retryConfig`, `maxRetries`)

### File Structure
- `src/index.js` - Main entry point, exports public API
- `src/api/` - Express server and routing logic
- `src/llm/` - LLM client abstractions and factory
- `src/openai/` - OpenAI-specific implementation
- `src/gemini/` - Vertex AI/Gemini-specific implementation
- `src/utils/` - Utility modules (logger, converters)
- Test files co-located: `filename.test.js` or `filename.e2e.test.js`

### Class Design Patterns
- Use ES6 classes with `class` keyword
- Extend base classes: `class OpenAIClient extends LLMClient`
- Implement abstract methods that throw errors if not overridden
- Constructor pattern: call `super(config)` first
- Separate public API from private implementation with underscore prefix

### Error Handling
- Use `try-catch` blocks around async operations
- Throw descriptive Error objects with messages
- Check HTTP status codes: `error.status || error.code`
- Log errors using the Logger utility
- Distinguish retryable errors (429, 500-504) from non-retryable (400, 401, etc.)
- Return error responses gracefully rather than throwing in production contexts

### JSDoc Documentation
- Add JSDoc comments to public methods and constructors
- Document parameters with `@param {Type} name description`
- Document return values with `@returns {Type} description`
- Add brief descriptions for non-trivial methods

### Testing Patterns
- Use **Jest** as the test framework
- Mock dependencies using `jest.mock()` before imports
- Use `beforeEach` to reset state and mocks
- Write descriptive test names: `should retry on rate limit error and succeed`
- Group tests with `describe()` blocks
- Use `expect()` assertions for verification
- Create test classes that extend the base class for testing

### Async/Await
- Use `async/await` for all asynchronous code
- Prefer async generators for streaming: `[Symbol.asyncIterator]: async function* ()`
- Handle async iterator iteration: `for await (const chunk of stream)`
- Wrap async calls in try-catch blocks

### Logging
- Import Logger utility: `const Logger = require('../utils/logger')`
- Use appropriate log levels:
  - `Logger.info()` - General information
  - `Logger.warn()` - Warning messages (retries, deprecations)
  - `Logger.error()` - Error conditions
  - `Logger.debug()` - Debug information
- Include context in log messages, not just error objects

### Response Serialization
- Use `ResponseSerializer.serializeMessage()` to normalize responses
- Serialize all outgoing responses to maintain consistency
- Return standardized response format with `role`, `content` fields

### HTTP API Patterns
- Use Express.js for HTTP server
- Define routes with `router.post('/path', handler)`
- Validate payloads with middleware before route handlers
- Use `res.sendError()` helper for error responses
- Return JSON responses with `res.json()`
- Use Server-Sent Events (SSE) for streaming: `res.write('data: {...}\n\n')`

### Configuration
- Pass configuration objects to constructors
- Use environment variables for sensitive data: `process.env.AJENT_LLM_TOKEN`
- Provide default values with `||` operator
- Validate configuration in constructor or separate `validateConfig()` method

### Import Ordering
1. Node.js built-in modules (`require('path')`)
2. External packages (`require('express')`)
3. Internal modules (`require('./utils/logger')`)

### Environment Variables
- `AJENT_LLM_TOKEN` - API token for OpenAI or other LLM providers
- `AJENT_LLM_PROJECT` - Project ID for Vertex AI/Gemini
- `AJENT_LLM_LOCATION` - Region/location for Vertex AI
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to Google Cloud service account JSON

### Common Patterns
- Factory pattern for creating LLM clients (`LLMFactory.createClient()`)
- Middleware composition with hook wrappers for request/response/error handling
- Async generators for streaming responses with `Symbol.asyncIterator`
- Exponential backoff with jitter for retry logic
- Response serialization for consistent output format across providers

### Code Organization Tips
- Keep implementation details private with underscore prefix
- Separate concerns: routing vs. business logic vs. data access
- Use descriptive variable names that explain their purpose
- Avoid mixing languages in comments (stick to English)
- Group related constants together at the top of files