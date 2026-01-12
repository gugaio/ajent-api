'use strict';

jest.resetModules();

const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../utils/logger', () => mockLogger);

const mockSerializeMessage = jest.fn((msg) => ({ serialized: true, ...msg }));
jest.mock('../llm/response-serializer', () => ({
  ResponseSerializer: { serializeMessage: mockSerializeMessage },
}));

const mockConvertTools = jest.fn(() => []);
const mockConvertMessages = jest.fn(() => ({ systemInstruction: null, contents: [] }));
jest.mock('../utils/vertexai-converters', () => ({
  convertTools: mockConvertTools,
  convertMessages: mockConvertMessages,
}));

const mockGenerateContent = jest.fn();
const mockGenerateContentStream = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({
  generateContent: mockGenerateContent,
  generateContentStream: mockGenerateContentStream,
}));

const mockVertexAI = jest.fn().mockImplementation(() => ({
  getGenerativeModel: mockGetGenerativeModel,
}));

jest.mock('@google-cloud/vertexai', () => ({
  VertexAI: mockVertexAI,
}));

const { VertexAIClient } = require('./vertexai-client');
const { LLMClient } = require('../llm/llm-client');

const { describe, test, expect, beforeEach } = require('@jest/globals');

describe('VertexAIClient', () => {
  const config = {
    llmProject: 'test-project',
    llmLocation: 'us-central1',
    llmModel: 'gemini-test'
  };
  let client;

  beforeEach(() => {
    jest.clearAllMocks();
    console.log = jest.fn();
    console.error = jest.fn();
    client = new VertexAIClient(config);

  test('should extend LLMClient', () => {
    expect(client).toBeInstanceOf(LLMClient);

  test('validateConfig throws when llmProject is missing', () => {
    expect(() => {
      new VertexAIClient({ llmLocation: 'us-central1', llmModel: 'gemini-test' });
    }).toThrow('VertexAIClient requires a valid configuration with a project ID.');

  test('validateConfig does not throw when llmProject is provided', () => {
    expect(() => {
      new VertexAIClient({
        llmProject: 'valid-project',
        llmLocation: 'us-central1',
        llmModel: 'gemini-test'
    }).not.toThrow();

  test('constructor adds custom retryable error patterns', () => {
    expect(client._customRetryPatterns).toContain('vertex ai quota exceeded');
    expect(client._customRetryPatterns).toContain('gemini rate limit');
    expect(client._customRetryPatterns).toContain('resource exhausted');

  test('serializeResponse uses ResponseSerializer', () => {
    const resp = { foo: 'bar' };
    const result = client.serializeResponse(resp);
    expect(mockSerializeMessage).toHaveBeenCalledWith(resp);
    expect(result.serialized).toBe(true);

  test('should set default generation parameters', () => {
    expect(client.config.temperature).toBe(0.1);
    expect(client.config.maxOutputTokens).toBe(4096);
    expect(client.config.topP).toBe(0.95);
    expect(client.config.topK).toBe(20);

  test('should allow overriding default generation parameters', () => {
    const customClient = new VertexAIClient({
      llmProject: 'test-project',
      llmLocation: 'us-central1',
      llmModel: 'gemini-test',
      temperature: 0.8,
      maxOutputTokens: 2048,
      topP: 0.5,
      topK: 40
    expect(customClient.config.temperature).toBe(0.8);
    expect(customClient.config.maxOutputTokens).toBe(2048);
    expect(customClient.config.topP).toBe(0.5);
    expect(customClient.config.topK).toBe(40);

  test('should generate consistent tool call IDs', () => {
    const client = new VertexAIClient({
      llmProject: 'test-project',
      llmLocation: 'us-central1',
      llmModel: 'gemini-test'
    client.validateConfig();

    const id1 = client._generateToolCallId('test_function');
    const id2 = client._generateToolCallId('test_function');
    const id3 = client._generateToolCallId('test_function');
    const id4 = client._generateToolCallId('another_function');

    expect(id1).toBe('test_function_1');
    expect(id2).toBe('test_function_2');
    expect(id3).toBe('test_function_3');
    expect(id4).toBe('another_function_4');

  test('should generate tool call IDs in sequence', () => {
    const client = new VertexAIClient({
      llmProject: 'test-project',
      llmLocation: 'us-central1',
      llmModel: 'gemini-test'

    const ids = [
      client._generateToolCallId('function1'),
      client._generateToolCallId('function2'),
      client._generateToolCallId('function1')
    ];

    expect(ids).toEqual(['function1_1', 'function2_2', 'function1_3']);

  test('should generate consistent tool call IDs', () => {
    const client = new VertexAIClient({
      llmProject: 'test-project',
      llmLocation: 'us-central1',
      llmModel: 'gemini-test'
    client.validateConfig();

    const id1 = client._generateToolCallId('test_function');
    const id2 = client._generateToolCallId('test_function');
    const id3 = client._generateToolCallId('test_function');
    const id4 = client._generateToolCallId('another_function');

    expect(id1).toBe('test_function_1');
    expect(id2).toBe('test_function_2');
    expect(id3).toBe('test_function_3');
    expect(id4).toBe('another_function_4');

  describe('_buildRequest', () => {
    beforeEach(() => {
      client.validateConfig();

    test('should call convertMessages and convertTools', () => {
      const messages = [{ role: 'user', content: 'test' }];
      const tools = [{ type: 'function', function: { name: 'test', description: 'test' } }];

      client._buildRequest(messages, tools);

      expect(mockConvertMessages).toHaveBeenCalledWith(messages);
      expect(mockConvertTools).toHaveBeenCalledWith(tools);

    test('should include systemInstruction when present', () => {
      mockConvertMessages.mockReturnValue({
        systemInstruction: { parts: [{ text: 'You are a helpful assistant' }] },
        contents: [{ role: 'user', parts: [{ text: 'test' }] }]

      const result = client._buildRequest([], []);

      expect(result.systemInstruction).toEqual({
        parts: [{ text: 'You are a helpful assistant' }]

    test('should not include system_instruction when null', () => {
      mockConvertMessages.mockReturnValue({
        systemInstruction: null,
        contents: [{ role: 'user', parts: [{ text: 'test' }] }]

      const result = client._buildRequest([], []);

      expect(result.systemInstruction).toBeUndefined();

    test('should include tools when present', () => {
      mockConvertTools.mockReturnValue([
        { function_declarations: [{ name: 'test' }] }
      ]);

      const result = client._buildRequest([], []);

      expect(result.tools).toEqual([
        { function_declarations: [{ name: 'test' }] }
      ]);

    test('should not include tools when empty', () => {
      mockConvertTools.mockReturnValue([]);

      const result = client._buildRequest([], []);

      expect(result.tools).toBeUndefined();

    test('should return request with contents', () => {
      mockConvertMessages.mockReturnValue({
        systemInstruction: null,
        contents: [{ role: 'user', parts: [{ text: 'test' }] }]

      const result = client._buildRequest([], []);

      expect(result.contents).toEqual([
        { role: 'user', parts: [{ text: 'test' }] }
      ]);

    test('should include generationConfig when temperature is set', () => {
      const cleanClient = new VertexAIClient({ ...config, temperature: 0.7 });
      cleanClient.validateConfig();
      mockConvertMessages.mockReturnValue({
        systemInstruction: null,
        contents: [{ role: 'user', parts: [{ text: 'test' }] }]

      const result = cleanClient._buildRequest([], []);

      expect(result.generationConfig).toBeDefined();
      expect(result.generationConfig.temperature).toBe(0.7);

    test('should include generationConfig when maxOutputTokens is set', () => {
      const cleanClient = new VertexAIClient({ ...config, maxOutputTokens: 1024 });
      cleanClient.validateConfig();
      mockConvertMessages.mockReturnValue({
        systemInstruction: null,
        contents: [{ role: 'user', parts: [{ text: 'test' }] }]

      const result = cleanClient._buildRequest([], []);

      expect(result.generationConfig).toBeDefined();
      expect(result.generationConfig.maxOutputTokens).toBe(1024);

    test('should include generationConfig when topP is set', () => {
      const cleanClient = new VertexAIClient({ ...config, topP: 0.9 });
      cleanClient.validateConfig();
      mockConvertMessages.mockReturnValue({
        systemInstruction: null,
        contents: [{ role: 'user', parts: [{ text: 'test' }] }]

      const result = cleanClient._buildRequest([], []);

      expect(result.generationConfig).toBeDefined();
      expect(result.generationConfig.topP).toBe(0.9);

    test('should include generationConfig when topK is set', () => {
      const cleanClient = new VertexAIClient({ ...config, topK: 40 });
      cleanClient.validateConfig();
      mockConvertMessages.mockReturnValue({
        systemInstruction: null,
        contents: [{ role: 'user', parts: [{ text: 'test' }] }]

      const result = cleanClient._buildRequest([], []);

      expect(result.generationConfig).toBeDefined();
      expect(result.generationConfig.topK).toBe(40);

    test('should include all generationConfig parameters', () => {
      const cleanClient = new VertexAIClient({
        ...config,
        temperature: 0.7,
        maxOutputTokens: 1024,
        topP: 0.9,
        topK: 40
      cleanClient.validateConfig();
      mockConvertMessages.mockReturnValue({
        systemInstruction: null,
        contents: [{ role: 'user', parts: [{ text: 'test' }] }]

      const result = cleanClient._buildRequest([], []);

      expect(result.generationConfig).toEqual({
        temperature: 0.7,
        maxOutputTokens: 1024,
        topP: 0.9,
        topK: 40

    test('should include default generationConfig when no parameters set', () => {
      const cleanClient = new VertexAIClient({ ...config });
      cleanClient.validateConfig();
      mockConvertMessages.mockReturnValue({
        systemInstruction: null,
        contents: [{ role: 'user', parts: [{ text: 'test' }] }]

      const result = cleanClient._buildRequest([], []);

      expect(result.generationConfig).toEqual({
        temperature: 0.1,
        maxOutputTokens: 4096,
        topP: 0.95,
        topK: 20

  describe('_buildGenerationConfig', () => {
    test('should return config with defaults when no generation config parameters are set', () => {
      const cleanClient = new VertexAIClient({ ...config });
      const result = cleanClient._buildGenerationConfig();
      expect(result).toEqual({
        temperature: 0.1,
        maxOutputTokens: 4096,
        topP: 0.95,
        topK: 20

    test('should return config with custom temperature and defaults', () => {
      const cleanClient = new VertexAIClient({ ...config, temperature: 0.7 });
      const result = cleanClient._buildGenerationConfig();
      expect(result).toEqual({
        temperature: 0.7,
        maxOutputTokens: 4096,
        topP: 0.95,
        topK: 20

    test('should return config with custom maxOutputTokens and defaults', () => {
      const cleanClient = new VertexAIClient({ ...config, maxOutputTokens: 1024 });
      const result = cleanClient._buildGenerationConfig();
      expect(result).toEqual({
        temperature: 0.1,
        maxOutputTokens: 1024,
        topP: 0.95,
        topK: 20

    test('should return config with custom topP and defaults', () => {
      const cleanClient = new VertexAIClient({ ...config, topP: 0.9 });
      const result = cleanClient._buildGenerationConfig();
      expect(result).toEqual({
        temperature: 0.1,
        maxOutputTokens: 4096,
        topP: 0.9,
        topK: 20

    test('should return config with custom topK and defaults', () => {
      const cleanClient = new VertexAIClient({ ...config, topK: 40 });
      const result = cleanClient._buildGenerationConfig();
      expect(result).toEqual({
        temperature: 0.1,
        maxOutputTokens: 4096,
        topP: 0.95,
        topK: 40

    test('should return config with all parameters', () => {
      const cleanClient = new VertexAIClient({
        ...config,
        temperature: 0.7,
        maxOutputTokens: 1024,
        topP: 0.9,
        topK: 40
      const result = cleanClient._buildGenerationConfig();
      expect(result).toEqual({
        temperature: 0.7,
        maxOutputTokens: 1024,
        topP: 0.9,
        topK: 40

    test('should handle zero temperature', () => {
      const cleanClient = new VertexAIClient({ ...config, temperature: 0 });
      const result = cleanClient._buildGenerationConfig();
      expect(result).toEqual({
        temperature: 0,
        maxOutputTokens: 4096,
        topP: 0.95,
        topK: 20

  describe('_parseResponse', () => {
    test('should parse text content from response', () => {
      const response = {
        response: {
          candidates: [{
            content: {
              parts: [{ text: 'Hello world' }]
            }
          }]
        }
      };

      const result = client._parseResponse(response);

      expect(result.role).toBe('assistant');
      expect(result.content).toBe('Hello world');
      expect(result.tool_calls).toBeUndefined();

    test('should concatenate multiple text parts', () => {
      const response = {
        response: {
          candidates: [{
            content: {
              parts: [
                { text: 'Hello ' },
                { text: 'world' }
              ]
            }
          }]
        }
      };

      const result = client._parseResponse(response);

      expect(result.content).toBe('Hello world');

    test('should parse function calls from response', () => {
      const response = {
        response: {
          candidates: [{
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'get_weather',
                    args: { location: 'Tokyo' }
                  }
                }
              ]
            }
          }]
        }
      };

      const result = client._parseResponse(response);

      expect(result.role).toBe('assistant');
      expect(result.content).toBe('');
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls[0].type).toBe('function');
      expect(result.tool_calls[0].function.name).toBe('get_weather');
      expect(result.tool_calls[0].function.arguments).toBe(JSON.stringify({ location: 'Tokyo' }));

    test('should handle empty args in function calls', () => {
      const response = {
        response: {
          candidates: [{
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'get_weather',
                    args: undefined
                  }
                }
              ]
            }
          }]
        }
      };

      const result = client._parseResponse(response);

      expect(result.tool_calls[0].function.arguments).toBe('{}');

    test('should handle multiple function calls', () => {
      const response = {
        response: {
          candidates: [{
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'get_weather',
                    args: { location: 'Tokyo' }
                  }
                },
                {
                  functionCall: {
                    name: 'get_time',
                    args: { timezone: 'UTC' }
                  }
                }
              ]
            }
          }]
        }
      };

      const result = client._parseResponse(response);

      expect(result.tool_calls).toHaveLength(2);
      expect(result.tool_calls[0].function.name).toBe('get_weather');
      expect(result.tool_calls[1].function.name).toBe('get_time');

    test('should handle both text and function calls', () => {
      const response = {
        response: {
          candidates: [{
            content: {
              parts: [
                { text: 'Let me check that for you. ' },
                {
                  functionCall: {
                    name: 'get_weather',
                    args: { location: 'Tokyo' }
                  }
                }
              ]
            }
          }]
        }
      };

      const result = client._parseResponse(response);

      expect(result.content).toBe('Let me check that for you. ');
      expect(result.tool_calls).toHaveLength(1);

    test('should handle empty response', () => {
      const response = {
        response: {
          candidates: [{
            content: {
              parts: []
            }
          }]
        }
      };

      const result = client._parseResponse(response);

      expect(result.role).toBe('assistant');
      expect(result.content).toBe('');

    test('should handle missing candidate', () => {
      const response = {
        response: {
          candidates: []
        }
      };

      const result = client._parseResponse(response);

      expect(result.role).toBe('assistant');
      expect(result.content).toBe('');

    test('should handle missing response', () => {
      const response = {};
      const result = client._parseResponse(response);

      expect(result.role).toBe('assistant');
      expect(result.content).toBe('');

    test('should include finishReason in response when present', () => {
      const response = {
        response: {
          candidates: [{
            content: {
              parts: [{ text: 'Hello' }]
            },
            finishReason: 'STOP'
          }]
        }
      };

      const result = client._parseResponse(response);

      expect(result.role).toBe('assistant');
      expect(result.content).toBe('Hello');
      expect(result.finish_reason).toBe('STOP');

    test('should not include finishReason when not present', () => {
      const response = {
        response: {
          candidates: [{
            content: {
              parts: [{ text: 'Hello' }]
            }
          }]
        }
      };

      const result = client._parseResponse(response);

      expect(result.role).toBe('assistant');
      expect(result.content).toBe('Hello');
      expect(result.finish_reason).toBeUndefined();

  describe('_sendImplementation', () => {
    beforeEach(() => {
      client.validateConfig();
      mockConvertMessages.mockReturnValue({
        systemInstruction: null,
        contents: [{ role: 'user', parts: [{ text: 'test' }] }]

    test('should call generateContent with built request', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{
            content: {
              parts: [{ text: 'Response' }]
            }
          }]
        }

      const messages = [{ role: 'user', content: 'test' }];
      const tools = [];

      await client._sendImplementation(messages, tools);

      expect(mockGenerateContent).toHaveBeenCalled();
      expect(mockConvertMessages).toHaveBeenCalledWith(messages);
      expect(mockConvertTools).toHaveBeenCalledWith(tools);

    test('should return serialized response', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{
            content: {
              parts: [{ text: 'Response' }]
            }
          }]
        }

      const result = await client._sendImplementation([], []);

      expect(mockSerializeMessage).toHaveBeenCalled();
      expect(result.serialized).toBe(true);

    test('should propagate errors from generateContent', async () => {
      const error = new Error('API error');
      error.status = 500;
      mockGenerateContent.mockRejectedValue(error);

      await expect(client._sendImplementation([], [])).rejects.toThrow('API error');

  describe('_streamImplementation', () => {
    beforeEach(() => {
      client.validateConfig();
      mockConvertMessages.mockReturnValue({
        systemInstruction: null,
        contents: [{ role: 'user', parts: [{ text: 'test' }] }]

    test('should return async iterator', async () => {
      const mockStream = {
        stream: (async function* () {
          yield {};
        })()
      };
      mockGenerateContentStream.mockResolvedValue(mockStream);

      const result = await client._streamImplementation([], []);

      expect(result[Symbol.asyncIterator]).toBeDefined();
      expect(typeof result[Symbol.asyncIterator]).toBe('function');

    test('should yield text content chunks', async () => {
      const mockStream = {
        stream: (async function* () {
          yield {
            candidates: [{
              content: {
                parts: [{ text: 'Hello ' }]
              }
            }]
          };
          yield {
            candidates: [{
              content: {
                parts: [{ text: 'world' }]
              },
              finishReason: 'STOP'
            }]
          };
        })()
      };
      mockGenerateContentStream.mockResolvedValue(mockStream);

      const stream = await client._streamImplementation([], []);
      const chunks = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(chunks[0].type).toBe('content');
      expect(chunks[0].content).toBe('Hello ');
      expect(chunks[1].type).toBe('content');
      expect(chunks[1].content).toBe('world');
      expect(chunks[2].type).toBe('finish');
      expect(chunks[2].final_content).toBe('Hello world');

    test('should yield tool calls', async () => {
      const mockStream = {
        stream: (async function* () {
          yield {
            candidates: [{
              content: {
                parts: [{
                  functionCall: {
                    name: 'get_weather',
                    args: { location: 'Tokyo' }
                  }
                }]
              },
              finishReason: 'STOP'
            }]
          };
        })()
      };
      mockGenerateContentStream.mockResolvedValue(mockStream);

      const stream = await client._streamImplementation([], []);
      const chunks = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const toolCallChunk = chunks.find(c => c.type === 'tool_call');
      expect(toolCallChunk).toBeDefined();
      expect(toolCallChunk.tool_call.type).toBe('function');
      expect(toolCallChunk.tool_call.function.name).toBe('get_weather');

    test('should handle stream errors', async () => {
      const mockStream = {
        stream: (async function* () {
          throw new Error('Stream error');
        })()
      };
      mockGenerateContentStream.mockResolvedValue(mockStream);

      const stream = await client._streamImplementation([], []);
      const chunks = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const errorChunk = chunks.find(c => c.type === 'error');
      expect(errorChunk).toBeDefined();
      expect(errorChunk.error).toBe('Stream iteration error');

    test('should handle chunk processing errors', async () => {
      const mockStream = {
        stream: (async function* () {
          yield {
            candidates: [{
              content: {
                parts: [{ text: 'OK' }]
              },
              finishReason: 'STOP'
            }]
          };
        })()
      };
      mockGenerateContentStream.mockResolvedValue(mockStream);

      const stream = await client._streamImplementation([], []);
      const chunks = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);

    test('should accumulate stream errors and report at end', async () => {
      const mockStream = {
        stream: (async function* () {
          yield {
            candidates: null
          };
          yield {
            candidates: [{
              content: {
                parts: [{ text: 'Final' }]
              },
              finishReason: 'STOP'
            }]
          };
        })()
      };
      mockGenerateContentStream.mockResolvedValue(mockStream);

      const stream = await client._streamImplementation([], []);
      const chunks = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const errorChunks = chunks.filter(c => c.type === 'error');
      expect(errorChunks.length).toBe(1);
      expect(chunks[chunks.length - 1].type).toBe('finish');

  describe('_sttImplementation', () => {
    test('should throw error as not implemented', async () => {
      await expect(client._sttImplementation('file.wav')).rejects.toThrow('STT not implemented for VertexAI');

  describe('validateConfig', () => {
    test('should initialize VertexAI client', () => {
      client.validateConfig();

      expect(mockVertexAI).toHaveBeenCalledWith({
        project: 'test-project',
        location: 'us-central1'
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: 'gemini-test'

    test('should set model property', () => {
      client.validateConfig();

      expect(client.model).toBeDefined();
      expect(client.model.generateContent).toBe(mockGenerateContent);
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: 'gemini-test'

    test('should set model property', () => {
      client.validateConfig();

      expect(client.model).toBeDefined();
      expect(client.model.generateContent).toBe(mockGenerateContent);
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: 'gemini-test'

    test('should set model property', () => {
      client.validateConfig();

      expect(client.model).toBeDefined();
      expect(client.model.generateContent).toBe(mockGenerateContent);
