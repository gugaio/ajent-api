/* eslint-env jest */

const path = require('path');
const fs = require('fs');
const { describe, test, expect, beforeAll } = require('@jest/globals');
const dotenv = require('dotenv');
const { VertexAIClient } = require('./vertexai-client');

const envPath = path.join(process.cwd(), '.env');
const envResult = dotenv.config({ path: envPath });

if (envResult.error) {
  console.error('Error loading .env:', envResult.error);
}

const GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const GEMINI_PROJECT = process.env.AJENT_LLM_PROJECT || process.env.llmProject;
const GEMINI_LOCATION = process.env.AJENT_LLM_LOCATION || process.env.llmLocation || 'us-central1';
const GEMINI_MODEL = process.env.AJENT_LLM_MODEL || process.env.llmModel || 'gemini-2.0-flash-exp';

const hasCredentials = GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(GOOGLE_APPLICATION_CREDENTIALS);

const skipIfNoCredentials = hasCredentials ? test : test.skip;

describe('VertexAIClient E2E Tests', () => {
  let client;

  test('Environment check', () => {
    const envExists = fs.existsSync(envPath);
    console.log('   .env file exists:', envExists);
    console.log('   GOOGLE_APPLICATION_CREDENTIALS set:', !!GOOGLE_APPLICATION_CREDENTIALS);
    console.log('   Credentials file exists:', hasCredentials);
    console.log('   AJENT_LLM_PROJECT set:', !!GEMINI_PROJECT);
    console.log('   AJENT_LLM_LOCATION set:', !!GEMINI_LOCATION);
    console.log('   AJENT_LLM_MODEL set:', !!process.env.AJENT_LLM_MODEL);

    if (!envExists) {
      console.log('   ❌ .env file not found');
    }
    if (!hasCredentials) {
      console.log('   ❌ GOOGLE_APPLICATION_CREDENTIALS not set or file does not exist');
    }
    if (!GEMINI_PROJECT) {
      console.log('   ❌ AJENT_LLM_PROJECT not found in .env');
    }
  });

  beforeAll(() => {
    if (!hasCredentials) {
      console.log('⚠️  GOOGLE_APPLICATION_CREDENTIALS not set or file does not exist.');
      console.log('   Add your Google Cloud service account credentials to .env file to run these tests.');
      console.log('   Example: GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json');
    } else if (!GEMINI_PROJECT) {
      console.log('⚠️  AJENT_LLM_PROJECT not found in environment variables.');
      console.log('   Add your Google Cloud project ID to .env file.');
      console.log('   Example: AJENT_LLM_PROJECT=your-project-id');
    } else {
      console.log('✓ Credentials found, running E2E tests');
      client = new VertexAIClient({
        llmProject: GEMINI_PROJECT,
        llmLocation: GEMINI_LOCATION,
        llmModel: GEMINI_MODEL
      });
      client.validateConfig();
    }
  });

  describe('send() - Non-streaming requests', () => {
    skipIfNoCredentials('should successfully complete a simple chat request', async () => {
      const messages = [
        { role: 'user', content: 'Say "Hello, World!"' }
      ];

      const response = await client.send(messages, []);

      expect(response).toBeDefined();
      expect(response.role).toBe('assistant');
      expect(response.content).toBeDefined();
      expect(typeof response.content).toBe('string');
    }, 30000);

    skipIfNoCredentials('should handle tool definitions and return tool calls', async () => {
      const messages = [
        { role: 'user', content: 'What is the weather in Tokyo?' }
      ];

      const tools = [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get the current weather in a location',
            parameters: {
              type: 'object',
              properties: {
                location: {
                  type: 'string',
                  description: 'The city and state, e.g. San Francisco, CA'
                }
              },
              required: ['location']
            }
          }
        }
      ];

      const response = await client.send(messages, tools);

      expect(response).toBeDefined();
      expect(response.role).toBe('assistant');
      expect(response.tool_calls || response.content).toBeDefined();
    }, 30000);

    skipIfNoCredentials('should handle multiple messages in conversation', async () => {
      const messages = [
        { role: 'user', content: 'My name is Alice.' },
        { role: 'model', content: 'Nice to meet you, Alice!' },
        { role: 'user', content: 'What is my name?' }
      ];

      const response = await client.send(messages, []);

      expect(response.content).toBeDefined();
      expect(typeof response.content).toBe('string');
    }, 30000);

    skipIfNoCredentials('should handle custom model parameter', async () => {
      const messages = [
        { role: 'user', content: 'Say "test"' }
      ];

      const response = await client.send(messages, [], GEMINI_MODEL);

      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
    }, 30000);
  });

  describe('stream() - Streaming requests', () => {
    skipIfNoCredentials('should stream content chunks correctly', async () => {
      const messages = [
        { role: 'user', content: 'Count from 1 to 5' }
      ];

      const stream = await client.stream(messages, []);
      const chunks = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      
      const finalChunk = chunks[chunks.length - 1];
      expect(finalChunk.type).toBe('finish');
      expect(finalChunk.finish_reason).toBeDefined();
      expect(finalChunk.final_content).toBeDefined();
    }, 30000);

    skipIfNoCredentials('should accumulate all content in final_content', async () => {
      const messages = [
        { role: 'user', content: 'Write a short poem about coding' }
      ];

      const stream = await client.stream(messages, []);
      const chunks = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const contentChunks = chunks.filter(c => c.type === 'content');
      expect(contentChunks.length).toBeGreaterThan(0);

      const finalChunk = chunks[chunks.length - 1];
      expect(finalChunk.final_content).toBeDefined();
      expect(finalChunk.final_content.length).toBeGreaterThan(0);
    }, 30000);

    skipIfNoCredentials('should stream tool calls when tools are provided', async () => {
      const messages = [
        { role: 'user', content: 'What is 2 + 2?' }
      ];

      const tools = [
        {
          type: 'function',
          function: {
            name: 'calculator',
            description: 'Perform mathematical calculations',
            parameters: {
              type: 'object',
              properties: {
                expression: { type: 'string' }
              },
              required: ['expression']
            }
          }
        }
      ];

      const stream = await client.stream(messages, tools);
      const chunks = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[chunks.length - 1].type).toBe('finish');
    }, 30000);
  });

  describe('Error Handling', () => {
    skipIfNoCredentials('should handle invalid project gracefully', async () => {
      const badClient = new VertexAIClient({
        llmProject: 'invalid-project-id-12345',
        llmLocation: GEMINI_LOCATION,
        llmModel: GEMINI_MODEL,
        enableRetry: false
      });
      badClient.validateConfig();

      const messages = [
        { role: 'user', content: 'Hello' }
      ];

      await expect(badClient.send(messages, [])).rejects.toThrow();
    }, 30000);
  });
});
