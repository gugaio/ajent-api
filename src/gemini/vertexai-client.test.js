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
  });

  test('should extend LLMClient', () => {
    expect(client).toBeInstanceOf(LLMClient);
  });

  test('validateConfig throws when llmProject is missing', () => {
    expect(() => {
      new VertexAIClient({ llmLocation: 'us-central1', llmModel: 'gemini-test' });
    }).toThrow('VertexAIClient requires a valid configuration with a project ID.');
  });

  test('validateConfig does not throw when llmProject is provided', () => {
    expect(() => {
      new VertexAIClient({
        llmProject: 'valid-project',
        llmLocation: 'us-central1',
        llmModel: 'gemini-test'
      });
    }).not.toThrow();
  });

  test('constructor adds custom retryable error patterns', () => {
    expect(client._customRetryPatterns).toContain('vertex ai quota exceeded');
    expect(client._customRetryPatterns).toContain('gemini rate limit');
    expect(client._customRetryPatterns).toContain('resource exhausted');
  });

  test('serializeResponse uses ResponseSerializer', () => {
    const resp = { foo: 'bar' };
    const result = client.serializeResponse(resp);
    expect(mockSerializeMessage).toHaveBeenCalledWith(resp);
    expect(result.serialized).toBe(true);
  });

  describe('_buildRequest', () => {
    beforeEach(() => {
      client.validateConfig();
    });

    test('should call convertMessages and convertTools', () => {
      const messages = [{ role: 'user', content: 'test' }];
      const tools = [{ type: 'function', function: { name: 'test', description: 'test' } }];

      client._buildRequest(messages, tools);

      expect(mockConvertMessages).toHaveBeenCalledWith(messages);
      expect(mockConvertTools).toHaveBeenCalledWith(tools);
    });

    test('should include system_instruction when present', () => {
      mockConvertMessages.mockReturnValue({
        systemInstruction: { parts: [{ text: 'You are a helpful assistant' }] },
        contents: [{ role: 'user', parts: [{ text: 'test' }] }]
      });

      const result = client._buildRequest([], []);

      expect(result.system_instruction).toEqual({
        parts: [{ text: 'You are a helpful assistant' }]
      });
    });

    test('should not include system_instruction when null', () => {
      mockConvertMessages.mockReturnValue({
        systemInstruction: null,
        contents: [{ role: 'user', parts: [{ text: 'test' }] }]
      });

      const result = client._buildRequest([], []);

      expect(result.system_instruction).toBeUndefined();
    });

    test('should include tools when present', () => {
      mockConvertTools.mockReturnValue([
        { function_declarations: [{ name: 'test' }] }
      ]);

      const result = client._buildRequest([], []);

      expect(result.tools).toEqual([
        { function_declarations: [{ name: 'test' }] }
      ]);
    });

    test('should not include tools when empty', () => {
      mockConvertTools.mockReturnValue([]);

      const result = client._buildRequest([], []);

      expect(result.tools).toBeUndefined();
    });

    test('should return request with contents', () => {
      mockConvertMessages.mockReturnValue({
        systemInstruction: null,
        contents: [{ role: 'user', parts: [{ text: 'test' }] }]
      });

      const result = client._buildRequest([], []);

      expect(result.contents).toEqual([
        { role: 'user', parts: [{ text: 'test' }] }
      ]);
    });
  });

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
    });

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
    });

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
    });

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
    });

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
    });

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
    });

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
    });

    test('should handle missing candidate', () => {
      const response = {
        response: {
          candidates: []
        }
      };

      const result = client._parseResponse(response);

      expect(result.role).toBe('assistant');
      expect(result.content).toBe('');
    });

    test('should handle missing response', () => {
      const response = {};

      const result = client._parseResponse(response);

      expect(result.role).toBe('assistant');
      expect(result.content).toBe('');
    });
  });

  describe('_sendImplementation', () => {
    beforeEach(() => {
      client.validateConfig();
      mockConvertMessages.mockReturnValue({
        systemInstruction: null,
        contents: [{ role: 'user', parts: [{ text: 'test' }] }]
      });
    });

    test('should call generateContent with built request', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{
            content: {
              parts: [{ text: 'Response' }]
            }
          }]
        }
      });

      const messages = [{ role: 'user', content: 'test' }];
      const tools = [];

      await client._sendImplementation(messages, tools);

      expect(mockGenerateContent).toHaveBeenCalled();
      expect(mockConvertMessages).toHaveBeenCalledWith(messages);
      expect(mockConvertTools).toHaveBeenCalledWith(tools);
    });

    test('should return serialized response', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{
            content: {
              parts: [{ text: 'Response' }]
            }
          }]
        }
      });

      const result = await client._sendImplementation([], []);

      expect(mockSerializeMessage).toHaveBeenCalled();
      expect(result.serialized).toBe(true);
    });

    test('should propagate errors from generateContent', async () => {
      const error = new Error('API error');
      error.status = 500;
      mockGenerateContent.mockRejectedValue(error);

      await expect(client._sendImplementation([], [])).rejects.toThrow('API error');
    });
  });

  describe('_streamImplementation', () => {
    beforeEach(() => {
      client.validateConfig();
      mockConvertMessages.mockReturnValue({
        systemInstruction: null,
        contents: [{ role: 'user', parts: [{ text: 'test' }] }]
      });
    });

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
    });

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
    });

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
    });

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
    });

    test('should handle chunk processing errors', async () => {
      const mockStream = {
        stream: (async function* () {
          yield {
            candidates: null
          };
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
    });
  });

  describe('_sttImplementation', () => {
    test('should throw error as not implemented', async () => {
      await expect(client._sttImplementation('file.wav')).rejects.toThrow('STT not implemented for VertexAI');
    });
  });

  describe('validateConfig', () => {
    test('should initialize VertexAI client', () => {
      client.validateConfig();

      expect(mockVertexAI).toHaveBeenCalledWith({
        project: 'test-project',
        location: 'us-central1'
      });
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: 'gemini-test'
      });
    });

    test('should set model property', () => {
      client.validateConfig();

      expect(client.model).toBeDefined();
      expect(client.model.generateContent).toBe(mockGenerateContent);
    });
  });
});
