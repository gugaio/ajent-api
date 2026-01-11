'use strict';

const { describe, test, expect } = require('@jest/globals');
const { convertTools, convertMessages } = require('./vertexai-converters');

describe('convertTools', () => {
  test('should return empty array when no tools provided', () => {
    const result = convertTools([]);
    expect(result).toEqual([]);
  });

  test('should return empty array when tools is null', () => {
    const result = convertTools(null);
    expect(result).toEqual([]);
  });

  test('should return empty array when tools is undefined', () => {
    const result = convertTools(undefined);
    expect(result).toEqual([]);
  });

  test('should convert OpenAI tool format to Vertex AI format', () => {
    const tools = [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get the current weather in a location',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string' }
            },
            required: ['location']
          }
        }
      }
    ];

    const result = convertTools(tools);
    expect(result).toHaveLength(1);
    expect(result[0].function_declarations).toHaveLength(1);
    expect(result[0].function_declarations[0].name).toBe('get_weather');
    expect(result[0].function_declarations[0].description).toBe('Get the current weather in a location');
    expect(result[0].function_declarations[0].parameters).toEqual(tools[0].function.parameters);
  });

  test('should convert multiple tools', () => {
    const tools = [
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather',
          parameters: { type: 'object' }
        }
      },
      {
        type: 'function',
        function: {
          name: 'get_time',
          description: 'Get time',
          parameters: { type: 'object' }
        }
      }
    ];

    const result = convertTools(tools);
    expect(result[0].function_declarations).toHaveLength(2);
  });
});

describe('convertMessages', () => {
  test('should extract system instruction from system role message', () => {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' }
    ];

    const { systemInstruction, contents } = convertMessages(messages);

    expect(systemInstruction).toEqual({
      parts: [{ text: 'You are a helpful assistant.' }]
    });
    expect(contents).toHaveLength(1);
    expect(contents[0].role).toBe('user');
    expect(contents[0].parts[0].text).toBe('Hello');
  });

  test('should return null systemInstruction when no system message present', () => {
    const messages = [
      { role: 'user', content: 'Hello' }
    ];

    const { systemInstruction } = convertMessages(messages);
    expect(systemInstruction).toBeNull();
  });

  test('should convert user messages to Vertex AI format', () => {
    const messages = [
      { role: 'user', content: 'Hello, how are you?' }
    ];

    const { contents } = convertMessages(messages);
    expect(contents).toHaveLength(1);
    expect(contents[0].role).toBe('user');
    expect(contents[0].parts[0].text).toBe('Hello, how are you?');
  });

  test('should convert assistant messages to model role', () => {
    const messages = [
      { role: 'assistant', content: 'I am doing well!' }
    ];

    const { contents } = convertMessages(messages);
    expect(contents).toHaveLength(1);
    expect(contents[0].role).toBe('model');
    expect(contents[0].parts[0].text).toBe('I am doing well!');
  });

  test('should convert model role messages to model role', () => {
    const messages = [
      { role: 'model', content: 'Response from model' }
    ];

    const { contents } = convertMessages(messages);
    expect(contents).toHaveLength(1);
    expect(contents[0].role).toBe('model');
  });

  test('should convert function_call to functionCall with parsed args', () => {
    const messages = [
      {
        role: 'assistant',
        function_call: {
          name: 'get_weather',
          arguments: { location: 'Tokyo' }
        }
      }
    ];

    const { contents } = convertMessages(messages);
    expect(contents).toHaveLength(1);
    expect(contents[0].role).toBe('model');
    expect(contents[0].parts[0].functionCall.name).toBe('get_weather');
    expect(contents[0].parts[0].functionCall.args).toEqual({ location: 'Tokyo' });
  });

  test('should parse string arguments for function_call', () => {
    const messages = [
      {
        role: 'assistant',
        function_call: {
          name: 'get_weather',
          arguments: '{"location": "Tokyo"}'
        }
      }
    ];

    const { contents } = convertMessages(messages);
    expect(contents[0].parts[0].functionCall.args).toEqual({ location: 'Tokyo' });
  });

  test('should convert tool_calls to functionCall with parsed args', () => {
    const messages = [
      {
        role: 'assistant',
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: { location: 'Tokyo' }
            }
          }
        ]
      }
    ];

    const { contents } = convertMessages(messages);
    expect(contents).toHaveLength(1);
    expect(contents[0].parts[0].functionCall.name).toBe('get_weather');
    expect(contents[0].parts[0].functionCall.args).toEqual({ location: 'Tokyo' });
  });

  test('should parse string arguments for tool_calls', () => {
    const messages = [
      {
        role: 'assistant',
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"location": "Tokyo"}'
            }
          }
        ]
      }
    ];

    const { contents } = convertMessages(messages);
    expect(contents[0].parts[0].functionCall.args).toEqual({ location: 'Tokyo' });
  });

  test('should convert multiple tool_calls', () => {
    const messages = [
      {
        role: 'assistant',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"location": "Tokyo"}'
            }
          },
          {
            id: 'call_2',
            type: 'function',
            function: {
              name: 'get_time',
              arguments: '{"timezone": "UTC"}'
            }
          }
        ]
      }
    ];

    const { contents } = convertMessages(messages);
    expect(contents[0].parts).toHaveLength(2);
    expect(contents[0].parts[0].functionCall.name).toBe('get_weather');
    expect(contents[0].parts[1].functionCall.name).toBe('get_time');
  });

  test('should convert role: tool to functionResponse', () => {
    const messages = [
      {
        role: 'tool',
        name: 'get_weather',
        content: 'The weather in Tokyo is sunny.'
      }
    ];

    const { contents } = convertMessages(messages);
    expect(contents).toHaveLength(1);
    expect(contents[0].role).toBe('user');
    expect(contents[0].parts[0].functionResponse).toEqual({
      name: 'get_weather',
      response: 'The weather in Tokyo is sunny.'
    });
  });

  test('should convert tool with tool_call_id', () => {
    const messages = [
      {
        role: 'tool',
        tool_call_id: 'call_123',
        name: 'get_weather',
        content: 'Sunny'
      }
    ];

    const { contents } = convertMessages(messages);
    expect(contents).toHaveLength(1);
    expect(contents[0].role).toBe('user');
    expect(contents[0].parts[0].functionResponse.name).toBe('get_weather');
    expect(contents[0].parts[0].functionResponse.response).toBe('Sunny');
  });

  test('should handle mixed conversation with system, user, assistant, and tool messages', () => {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What is the weather in Tokyo?' },
      {
        role: 'assistant',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"location": "Tokyo"}'
            }
          }
        ]
      },
      {
        role: 'tool',
        name: 'get_weather',
        content: 'Sunny'
      },
      { role: 'user', content: 'Thank you!' }
    ];

    const { systemInstruction, contents } = convertMessages(messages);

    expect(systemInstruction).toEqual({
      parts: [{ text: 'You are a helpful assistant.' }]
    });

    expect(contents).toHaveLength(4);

    expect(contents[0].role).toBe('user');
    expect(contents[0].parts[0].text).toBe('What is the weather in Tokyo?');

    expect(contents[1].role).toBe('model');
    expect(contents[1].parts[0].functionCall.name).toBe('get_weather');

    expect(contents[2].role).toBe('user');
    expect(contents[2].parts[0].functionResponse.name).toBe('get_weather');

    expect(contents[3].role).toBe('user');
    expect(contents[3].parts[0].text).toBe('Thank you!');
  });

  test('should handle empty messages array', () => {
    const { systemInstruction, contents } = convertMessages([]);
    expect(systemInstruction).toBeNull();
    expect(contents).toEqual([]);
  });

  test('should handle messages with no content', () => {
    const messages = [{ role: 'user' }];
    const { contents } = convertMessages(messages);
    expect(contents).toEqual([]);
  });

  test('should handle complex arguments in function calls', () => {
    const messages = [
      {
        role: 'assistant',
        function_call: {
          name: 'calculate',
          arguments: {
            expression: '2 + 2',
            options: { precision: 2, format: 'decimal' }
          }
        }
      }
    ];

    const { contents } = convertMessages(messages);
    expect(contents[0].parts[0].functionCall.args).toEqual({
      expression: '2 + 2',
      options: { precision: 2, format: 'decimal' }
    });
  });
});
