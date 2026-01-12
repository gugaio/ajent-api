const { VertexAIClient } = require('./vertexai-client');
const { VertexAI } = require('@google-cloud/vertexai');
const { convertTools, convertMessages } = require('../utils/vertexai-converters');

jest.mock('@google-cloud/vertexai');
jest.mock('../utils/vertexai-converters');
jest.mock('../utils/logger');

describe('VertexAIClient', () => {
  let client;
  let mockConfig;
  let mockModel;
  let mockVertexAI;

  beforeEach(() => {
    // Reset environment
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/credentials.json';

    // Setup mock config
    mockConfig = {
      llmProject: 'test-project',
      llmLocation: 'us-central1',
      llmModel: 'gemini-pro',
      temperature: 0.5,
      maxOutputTokens: 2048,
      topP: 0.9,
      topK: 40
    };

    // Setup mock model
    mockModel = {
      generateContent: jest.fn(),
      generateContentStream: jest.fn()
    };

    // Setup mock VertexAI instance
    mockVertexAI = {
      getGenerativeModel: jest.fn().mockReturnValue(mockModel)
    };

    VertexAI.mockImplementation(() => mockVertexAI);

    // Mock converters
    convertMessages.mockReturnValue({
      systemInstruction: { parts: [{ text: 'system message' }] },
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
    });

    convertTools.mockReturnValue([]);

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with default config values', () => {
      const minimalConfig = {
        llmProject: 'test-project',
        llmLocation: 'us-central1',
        llmModel: 'gemini-pro'
      };

      client = new VertexAIClient(minimalConfig);

      expect(client.config.temperature).toBe(0.1);
      expect(client.config.maxOutputTokens).toBe(4096);
      expect(client.config.topP).toBe(0.95);
      expect(client.config.topK).toBe(20);
    });

    test('should use provided config values', () => {
      client = new VertexAIClient(mockConfig);

      expect(client.config.temperature).toBe(0.5);
      expect(client.config.maxOutputTokens).toBe(2048);
      expect(client.config.topP).toBe(0.9);
      expect(client.config.topK).toBe(40);
    });

    test('should initialize tool call counter', () => {
      client = new VertexAIClient(mockConfig);
      expect(client._toolCallIdCounter).toBe(0);
    });
  });

  describe('validateConfig', () => {
    test('should throw error if config is missing', () => {
      client = new VertexAIClient(mockConfig);
      client.config = null;

      expect(() => client.validateConfig()).toThrow(
        'VertexAIClient requires a valid configuration with a project ID.'
      );
    });

    test('should initialize VertexAI client with correct parameters', () => {
      client = new VertexAIClient(mockConfig);
      client.validateConfig();

      expect(VertexAI).toHaveBeenCalledWith({
        project: 'test-project',
        location: 'us-central1'
      });
    });

    test('should get generative model', () => {
      client = new VertexAIClient(mockConfig);
      client.validateConfig();

      expect(mockVertexAI.getGenerativeModel).toHaveBeenCalledWith({
        model: 'gemini-pro'
      });
      expect(client.model).toBe(mockModel);
    });
  });

  describe('_generateToolCallId', () => {
    test('should generate unique IDs with counter', () => {
      client = new VertexAIClient(mockConfig);

      const id1 = client._generateToolCallId('testFunction');
      const id2 = client._generateToolCallId('testFunction');
      const id3 = client._generateToolCallId('anotherFunction');

      expect(id1).toBe('testFunction_1');
      expect(id2).toBe('testFunction_2');
      expect(id3).toBe('anotherFunction_3');
    });
  });

  describe('_buildGenerationConfig', () => {
    test('should build config with all parameters', () => {
      client = new VertexAIClient(mockConfig);
      const config = client._buildGenerationConfig();

      expect(config).toEqual({
        temperature: 0.5,
        maxOutputTokens: 2048,
        topP: 0.9,
        topK: 40
      });
    });

    test('should return null if no config parameters are set', () => {
      const emptyConfig = { llmProject: 'test', llmLocation: 'us', llmModel: 'model' };
      client = new VertexAIClient(emptyConfig);
      
      // Clear defaults
      delete client.config.temperature;
      delete client.config.maxOutputTokens;
      delete client.config.topP;
      delete client.config.topK;

      const config = client._buildGenerationConfig();
      expect(config).toBeNull();
    });
  });

  describe('_buildRequest', () => {
    beforeEach(() => {
      client = new VertexAIClient(mockConfig);
      client.validateConfig();
    });

    test('should build request with messages and system instruction', () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const tools = [];

      const request = client._buildRequest(messages, tools);

      expect(convertMessages).toHaveBeenCalledWith(messages);
      expect(request.contents).toBeDefined();
      expect(request.systemInstruction).toEqual({
        parts: [{ text: 'system message' }]
      });
    });

    test('should build request without system instruction if not provided', () => {
      convertMessages.mockReturnValue({
        systemInstruction: null,
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
      });

      const messages = [{ role: 'user', content: 'Hello' }];
      const request = client._buildRequest(messages, []);

      expect(request.systemInstruction).toBeUndefined();
    });

    test('should include tools if provided', () => {
      const mockTools = [{ type: 'function', function: { name: 'test' } }];
      const convertedTools = [{ functionDeclarations: [{ name: 'test' }] }];
      convertTools.mockReturnValue(convertedTools);

      const request = client._buildRequest([], mockTools);

      expect(convertTools).toHaveBeenCalledWith(mockTools);
      expect(request.tools).toEqual(convertedTools);
    });

    test('should not include tools if empty', () => {
      convertTools.mockReturnValue([]);

      const request = client._buildRequest([], []);

      expect(request.tools).toBeUndefined();
    });

    test('should include generation config', () => {
      const request = client._buildRequest([], []);

      expect(request.generationConfig).toEqual({
        temperature: 0.5,
        maxOutputTokens: 2048,
        topP: 0.9,
        topK: 40
      });
    });
  });

  describe('_parseResponse', () => {
    beforeEach(() => {
      client = new VertexAIClient(mockConfig);
    });

    test('should parse text response', () => {
      const mockResponse = {
        response: {
          candidates: [{
            content: {
              parts: [{ text: 'Hello, world!' }]
            },
            finishReason: 'STOP'
          }]
        }
      };

      const result = client._parseResponse(mockResponse);

      expect(result).toEqual({
        role: 'assistant',
        content: 'Hello, world!',
        finish_reason: 'STOP'
      });
    });

    test('should parse function call response', () => {
      const mockResponse = {
        response: {
          candidates: [{
            content: {
              parts: [{
                functionCall: {
                  name: 'testFunction',
                  args: { param1: 'value1' }
                }
              }]
            },
            finishReason: 'STOP'
          }]
        }
      };

      const result = client._parseResponse(mockResponse);

      expect(result.role).toBe('assistant');
      expect(result.content).toBe('');
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls[0]).toMatchObject({
        type: 'function',
        function: {
          name: 'testFunction',
          arguments: JSON.stringify({ param1: 'value1' })
        }
      });
    });

    test('should parse mixed text and function call response', () => {
      const mockResponse = {
        response: {
          candidates: [{
            content: {
              parts: [
                { text: 'Let me help with that. ' },
                {
                  functionCall: {
                    name: 'getData',
                    args: { id: '123' }
                  }
                }
              ]
            },
            finishReason: 'STOP'
          }]
        }
      };

      const result = client._parseResponse(mockResponse);

      expect(result.content).toBe('Let me help with that. ');
      expect(result.tool_calls).toHaveLength(1);
    });

    test('should handle empty response', () => {
      const mockResponse = {
        response: {
          candidates: []
        }
      };

      const result = client._parseResponse(mockResponse);

      expect(result).toEqual({
        role: 'assistant',
        content: ''
      });
    });

    test('should handle missing parts', () => {
      const mockResponse = {
        response: {
          candidates: [{
            content: {}
          }]
        }
      };

      const result = client._parseResponse(mockResponse);

      expect(result).toEqual({
        role: 'assistant',
        content: ''
      });
    });
  });

  describe('_sendImplementation', () => {
    beforeEach(() => {
      client = new VertexAIClient(mockConfig);
      client.validateConfig();
      client.serializeResponse = jest.fn(response => response);
    });

    test('should send request and return serialized response', async () => {
      const mockResponse = {
        response: {
          candidates: [{
            content: {
              parts: [{ text: 'Test response' }]
            },
            finishReason: 'STOP'
          }]
        }
      };

      mockModel.generateContent.mockResolvedValue(mockResponse);

      const messages = [{ role: 'user', content: 'Hello' }];
      const result = await client._sendImplementation(messages, []);

      expect(mockModel.generateContent).toHaveBeenCalled();
      expect(client.serializeResponse).toHaveBeenCalled();
      expect(result.role).toBe('assistant');
      expect(result.content).toBe('Test response');
    });

    test('should handle errors from API', async () => {
      mockModel.generateContent.mockRejectedValue(new Error('API Error'));

      const messages = [{ role: 'user', content: 'Hello' }];

      await expect(client._sendImplementation(messages, [])).rejects.toThrow('API Error');
    });
  });

  describe('_streamImplementation', () => {
    beforeEach(() => {
      client = new VertexAIClient(mockConfig);
      client.validateConfig();
    });

    test('should stream text chunks', async () => {
      const mockChunks = [
        {
          candidates: [{
            content: {
              parts: [{ text: 'Hello' }]
            }
          }]
        },
        {
          candidates: [{
            content: {
              parts: [{ text: ' world' }]
            }
          }]
        },
        {
          candidates: [{
            content: {
              parts: [{ text: '!' }]
            },
            finishReason: 'STOP'
          }]
        }
      ];

      mockModel.generateContentStream.mockResolvedValue({
        stream: (async function* () {
          for (const chunk of mockChunks) {
            yield chunk;
          }
        })()
      });

      const iterator = await client._streamImplementation([], []);
      const chunks = [];

      for await (const chunk of iterator) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(4); // 3 content + 1 finish
      expect(chunks[0]).toEqual({ type: 'content', content: 'Hello' });
      expect(chunks[1]).toEqual({ type: 'content', content: ' world' });
      expect(chunks[2]).toEqual({ type: 'content', content: '!' });
      expect(chunks[3]).toMatchObject({
        type: 'finish',
        finish_reason: 'STOP',
        final_content: 'Hello world!'
      });
    });

    test('should stream function calls', async () => {
      const mockChunks = [
        {
          candidates: [{
            content: {
              parts: [{
                functionCall: {
                  name: 'testFunc',
                  args: { key: 'value' }
                }
              }]
            },
            finishReason: 'STOP'
          }]
        }
      ];

      mockModel.generateContentStream.mockResolvedValue({
        stream: (async function* () {
          for (const chunk of mockChunks) {
            yield chunk;
          }
        })()
      });

      const iterator = await client._streamImplementation([], []);
      const chunks = [];

      for await (const chunk of iterator) {
        chunks.push(chunk);
      }

      expect(chunks[0].type).toBe('tool_call');
      expect(chunks[0].tool_call.function.name).toBe('testFunc');
      expect(chunks[1].type).toBe('finish');
      expect(chunks[1].final_tool_calls).toHaveLength(1);
    });

    test('should handle stream errors gracefully', async () => {
      mockModel.generateContentStream.mockResolvedValue({
        stream: (async function* () {
          throw new Error('Stream error');
        })()
      });

      const iterator = await client._streamImplementation([], []);
      const chunks = [];

      for await (const chunk of iterator) {
        chunks.push(chunk);
      }

      expect(chunks[0].type).toBe('error');
      expect(chunks[0].error).toBe('Stream iteration error');
    });
  });

  describe('_sttImplementation', () => {
    test('should throw not implemented error', async () => {
      client = new VertexAIClient(mockConfig);

      await expect(client._sttImplementation('/path/to/audio.mp3'))
        .rejects.toThrow('STT not implemented for VertexAI');
    });
  });

  describe('serializeResponse', () => {
    beforeEach(() => {
      client = new VertexAIClient(mockConfig);
    });

    test('should call ResponseSerializer.serializeMessage', () => {
      const ResponseSerializer = require('../llm/response-serializer').ResponseSerializer;
      ResponseSerializer.serializeMessage = jest.fn();

      const mockResponse = { role: 'assistant', content: 'test' };
      client.serializeResponse(mockResponse);

      expect(ResponseSerializer.serializeMessage).toHaveBeenCalledWith(mockResponse);
    });
  });
});