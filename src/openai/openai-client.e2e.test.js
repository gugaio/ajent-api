/* eslint-env jest */

const path = require('path');
const fs = require('fs');
const { describe, test, expect, beforeAll } = require('@jest/globals');
const dotenv = require('dotenv');
const { OpenAIClient } = require('./openai-client');

const envPath = path.join(process.cwd(), '.env');
const envResult = dotenv.config({ path: envPath });

if (envResult.error) {
  console.error('Error loading .env:', envResult.error);
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.llmToken;

const skipIfNoApiKey = OPENAI_API_KEY ? test : test.skip;

describe('OpenAIClient E2E Tests', () => {
  let client;

  test('Environment check', () => {
    const envExists = fs.existsSync(envPath);
    console.log('   .env file exists:', envExists);
    console.log('   OPENAI_API_KEY set:', !!process.env.OPENAI_API_KEY);
    console.log('   llmToken set:', !!process.env.llmToken);
    console.log('   API key found:', !!OPENAI_API_KEY);

    if (!envExists) {
      console.log('   ❌ .env file not found');
    }
    if (!OPENAI_API_KEY) {
      console.log('   ❌ No API key found in .env');
    }
  });

  beforeAll(() => {
    if (!OPENAI_API_KEY) {
      console.log('⚠️  OPENAI_API_KEY or llmToken not found in environment variables.');
      console.log('   Add your API key to .env file to run these tests.');
      console.log('   Example: OPENAI_API_KEY=sk-...');
    } else {
      console.log('✓ API key found, running E2E tests');
      client = new OpenAIClient({
        llmToken: OPENAI_API_KEY,
        model: 'gpt-5-nano'
      });
      client.validateConfig();
    }
  });

  describe('send() - Non-streaming requests', () => {
    skipIfNoApiKey('should successfully complete a simple chat request', async () => {
      const messages = [
        { role: 'user', content: 'Say "Hello, World!"' }
      ];

      const response = await client.send(messages, []);

      expect(response).toBeDefined();
      expect(response.role).toBe('assistant');
      expect(response.content).toBeDefined();
      expect(typeof response.content).toBe('string');
    });

    skipIfNoApiKey('should handle tool definitions and return tool calls', async () => {
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
    });

    skipIfNoApiKey('should handle multiple messages in conversation', async () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'My name is Alice.' },
        { role: 'assistant', content: 'Nice to meet you, Alice!' },
        { role: 'user', content: 'What is my name?' }
      ];

      const response = await client.send(messages, []);

      expect(response.content).toBeDefined();
      expect(typeof response.content).toBe('string');
    });

    skipIfNoApiKey('should handle custom model parameter', async () => {
      const messages = [
        { role: 'user', content: 'Say "test"' }
      ];

      const response = await client.send(messages, [], 'gpt-5-nano');

      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
    });
  });

  describe('stream() - Streaming requests', () => {
    skipIfNoApiKey('should stream content chunks correctly', async () => {
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
    });

    skipIfNoApiKey('should accumulate all content in final_content', async () => {
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
    }, 10000);

    skipIfNoApiKey('should stream tool calls when tools are provided', async () => {
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
    });
  });

  describe('Error Handling', () => {
    skipIfNoApiKey('should handle invalid API key gracefully', async () => {
      const badClient = new OpenAIClient({
        llmToken: 'invalid-key-12345',
        model: 'gpt-5-nano',
        enableRetry: false
      });
      badClient.validateConfig();

      const messages = [
        { role: 'user', content: 'Hello' }
      ];

      await expect(badClient.send(messages, [])).rejects.toThrow();
    });
  });
});
