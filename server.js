const { createApiServer } = require('./lib');

const api = createApiServer({
  port: process.env.PORT || 3000,
  llmToken: process.env.LLM_TOKEN,
  llmName: process.env.LLM_NAME || 'openai',
  llmModel: process.env.LLM_MODEL || 'gpt-4.1-mini'
});

api.start();

process.on('SIGINT', () => {
  console.log('Shutting down server...');
  api.stop();
  process.exit(0);
});