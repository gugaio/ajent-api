/**
 * Route wrapper utilities for handling hooks around request handlers
 */

/**
 * Wraps a route handler with before/after request hooks and error handling
 * @param {Function} beforeRequest - Hook called before processing request
 * @param {Function} afterResponse - Hook called after generating response
 * @param {Function} errorHandler - Custom error handler
 * @param {Function} defaultErrorHandler - Default error handler
 * @returns {Function} Express middleware function
 */
function createHookWrapper(beforeRequest, afterResponse, errorHandler, defaultErrorHandler) {
  return (handler) => {
    return async (req, res) => {
      try {
        if (typeof beforeRequest === 'function') {
          const shouldContinue = await beforeRequest(req, res);
          if (shouldContinue === false) return;
        }

        const result = await handler(req, res);

        if (!res.headersSent) {
          if (typeof afterResponse === 'function') {
            const modifiedResult = await afterResponse(req, result);
            if (modifiedResult) {
              return res.json(modifiedResult);
            }
          }

          return res.json(result);
        }
      } catch (error) {
        if (typeof errorHandler === 'function') {
          return errorHandler(error, req, res);
        } else {
          return defaultErrorHandler(error, req, res);
        }
      }
    };
  };
}

/**
 * Wraps a streaming route handler with before/after request hooks and error handling
 * Does not send JSON response (for SSE and other streaming responses)
 * @param {Function} beforeRequest - Hook called before processing request
 * @param {Function} afterResponse - Hook called after generating response
 * @param {Function} errorHandler - Custom error handler
 * @param {Function} defaultErrorHandler - Default error handler
 * @returns {Function} Express middleware function
 */
function createStreamingHookWrapper(beforeRequest, afterResponse, errorHandler, defaultErrorHandler) {
  return (handler) => {
    return async (req, res) => {
      try {
        if (typeof beforeRequest === 'function') {
          const shouldContinue = await beforeRequest(req, res);
          if (shouldContinue === false) return;
        }

        await handler(req, res);

        if (typeof afterResponse === 'function') {
          afterResponse(req, { streaming: true });
        }
      } catch (error) {
        if (typeof errorHandler === 'function') {
          return errorHandler(error, req, res);
        } else {
          return defaultErrorHandler(error, req, res);
        }
      }
    };
  };
}

module.exports = {
  createHookWrapper,
  createStreamingHookWrapper
};
