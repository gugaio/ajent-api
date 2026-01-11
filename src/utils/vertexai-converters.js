function convertTools(tools) {
  if (!tools || tools.length === 0) return [];
  return [{
    function_declarations: tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    }))
  }];
}

function _parseArgs(args) {
  return typeof args === 'string' ? JSON.parse(args) : args;
}

function convertMessages(messages) {
  let systemInstruction = null;
  const contents = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction = {
        parts: [{ text: msg.content }]
      };
      continue;
    }

    const parts = [];

    if (msg.function_call) {
      parts.push({
        functionCall: {
          name: msg.function_call.name,
          args: _parseArgs(msg.function_call.arguments),
        },
      });
    } else if (msg.tool_calls) {
      parts.push(...msg.tool_calls.map(tc => ({
        functionCall: {
          name: tc.function.name,
          args: _parseArgs(tc.function.arguments),
        },
      })));
    } else if (msg.role === 'tool' || msg.tool_call_id) {
      parts.push({
        functionResponse: {
          name: msg.name,
          response: msg.content
        }
      });
    } else if (msg.content) {
      parts.push({ text: msg.content });
    }

    let role = 'user';
    if (msg.role === 'assistant' || msg.role === 'model') {
      role = 'model';
    }

    if (parts.length > 0) {
      contents.push({
        role,
        parts
      });
    }
  }

  return { systemInstruction, contents };
}

module.exports = { convertTools, convertMessages };