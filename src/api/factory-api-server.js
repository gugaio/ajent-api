const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { LLMFactory } = require('../llm/llm-factory');
const { createHookWrapper, createStreamingHookWrapper } = require('./hook-wrappers');
const Logger = require('../utils/logger');

function logPayload(req) {
  const payload = req.body;
  const payloadSize = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  Logger.debug(`Payload: ${JSON.stringify(payload)}`);
  Logger.debug(`Payload size (bytes): ${payloadSize}`);
}

function validatePayload(req, res, next) {
  const { messages } = req.body;
  
  if (!messages) {
    return res.sendError(400, 'Missing required field', 'messages is required');
  }
  
  if (!Array.isArray(messages)) {
    return res.sendError(400, 'Invalid field type', 'messages must be an array');
  }
  
  next();
}

/**
 * Creates and configures an Express API server with routes for LLM interaction,
 * or attaches these routes to an existing Express app
 * 
 * @param {Object} options - Configuration options for the API server
 * @param {Object} [options.app] - Existing Express app to attach routes to
 * @param {number} [options.port=3000] - Port to listen on (when creating a new app)
 * @param {string} [options.uploadDir='./uploads'] - Directory to store temporary uploads
 * @param {Function} [options.beforeRequest] - Hook called before processing a request
 * @param {Function} [options.afterResponse] - Hook called after generating a response
 * @param {Function} [options.errorHandler] - Custom error handler
 * @returns {Object} Express app instance and server control methods
 */
function createLLMServer(options = {}) {
  const {
    app: existingApp,
    port = 3000,
    uploadDir = './uploads',
    beforeRequest,
    afterResponse,
    errorHandler
  } = options;

  const client = LLMFactory.createClient({
    llmName: options.llmName,
    llmToken: options.llmToken || process.env.AJENT_LLM_TOKEN,
    llmProject: options.llmProject,
    llmModel: options.llmModel});
    
  
  // Use existing app or create a new one
  const app = existingApp || express();

  // Only apply these middleware if we're creating a new app
  // Otherwise assume the existing app already has appropriate middleware
  if (!existingApp) {
    app.use(cors());
    app.use(bodyParser.json());
  }
  
  // Configure multer for file uploads
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const fullUploadDir = path.resolve(process.cwd(), uploadDir);
      if (!fs.existsSync(fullUploadDir)) {
        fs.mkdirSync(fullUploadDir, { recursive: true });
      }
      cb(null, fullUploadDir);
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    }
  });

  const upload = multer({ storage });

  // Custom middleware for hooks - only added to our routes
  const ajentMiddleware = (req, res, next) => {
    // Add helper to easily send error responses
    res.sendError = (status, error, details) => {
      return res.status(status).json({ error, details });
    };
    next();
  };

  // Default error handler function
  const defaultErrorHandler = (err, req, res) => {
    console.error('API error:', err);
    return res.sendError(500, 'Internal server error', err.message);
  };

  // Create hook wrappers with current configuration
  const withHooks = createHookWrapper(beforeRequest, afterResponse, errorHandler, defaultErrorHandler);
  const withHooksStreaming = createStreamingHookWrapper(beforeRequest, afterResponse, errorHandler, defaultErrorHandler);

  // Define a router for our agent routes
  const agentRouter = express.Router();
  agentRouter.use(ajentMiddleware);
  agentRouter.use(validatePayload);

  // Routes
  agentRouter.get('/ping', withHooks(async (req, res) => {
    return { message: 'pong' };
  }));
  
  agentRouter.post('/message', withHooks(async (req, res) => {
    const { messages, tools } = req.body;

    logPayload(req);

    const response = await client.send(messages, tools || []);

    return { message: response };
  }));

  agentRouter.post('/message/stream', withHooksStreaming(async (req, res) => {
    const { messages, tools } = req.body;

    logPayload(req);

    try {
      const streamGenerator = await client.stream(messages, tools || [], options.llmModel);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      for await (const chunk of streamGenerator) {
        if (res.writableEnded || res.closed) {
          Logger.debug('Client disconnected, stopping stream');
          break;
        }

        try {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        } catch (writeError) {
          if (writeError.code === 'ECONNRESET' || writeError.code === 'EPIPE') {
            Logger.debug('Client disconnected during write');
            break;
          }
          throw writeError;
        }
      }

      if (!res.writableEnded) {
        res.write('data: [DONE]\n\n');
        return res.end();
      }
    } catch (error) {
      Logger.error(`Stream error: ${error.message}`);

      if (!res.headersSent) {
        return res.status(500).json({ error: 'Stream error', details: error.message });
      }

      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: error.message, type: 'error' })}\n\n`);
        return res.end();
      }
    }
  }));

  agentRouter.post('/audio_message', upload.single('audio'), withHooks(async (req, res) => {
    if (!req.file) {
      return res.sendError(400, 'Missing file', 'No audio file uploaded');
    }

    const audioFilePath = req.file.path;
    const transcription = await client.stt(audioFilePath);

    fs.unlinkSync(audioFilePath);

    return { transcription };
  }));

  // Mount the agent router to the app
  app.use('/agent', agentRouter);

  // Server control methods
  let server = null;
  
  return {
    app,
    
    // Start the server (only if we created a new app)
    start: (customPort) => {
      if (existingApp) {
        console.log('Using existing Express app - server control methods are disabled');
        return null;
      }
      
      const serverPort = customPort || port;
      server = app.listen(serverPort, () => {
        console.log(`Ajent API server running on port ${serverPort}`);
      });
      return server;
    },
    
    // Stop the server
    stop: () => {
      if (server) {
        server.close();
        server = null;
      }
    }
  };
}

module.exports = createLLMServer;