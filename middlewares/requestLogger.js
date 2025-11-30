const logger = require('../utilities/logger');

const requestStats = {
  totalRequests: 0,
  requestsByMethod: {},
  requestsByEndpoint: {},
  requestsByHour: {},
  requestsByIP: {},
  requestsByStatus: {},
  startTime: new Date(),
  responseTimes: {}, // Map endpoint -> { count, totalTime, average }
};

const getClientIP = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] || // if behind proxy
    req.ip ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    '0.0.0.0'
  );
};

const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Capture response data
  const originalSend = res.send;
  let responseBody = '';

  res.send = function (body) {
    responseBody = body;
    originalSend.call(this, body);
  };

  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const clientIP = getClientIP(req);

    // Update stats
    requestStats.totalRequests++;

    // Count by method
    requestStats.requestsByMethod[req.method] =
      (requestStats.requestsByMethod[req.method] || 0) + 1;

    // Count by endpoint
    const endpoint = req.path;
    requestStats.requestsByEndpoint[endpoint] =
      (requestStats.requestsByEndpoint[endpoint] || 0) + 1;

    // Count by hour
    const hour = new Date().getHours();
    requestStats.requestsByHour[hour] =
      (requestStats.requestsByHour[hour] || 0) + 1;

    // Count by IP
    requestStats.requestsByIP[clientIP] =
      (requestStats.requestsByIP[clientIP] || 0) + 1;

    // Count by status
    requestStats.requestsByStatus[res.statusCode] =
      (requestStats.requestsByStatus[res.statusCode] || 0) + 1;

    // Track response times per endpoint
    if (!requestStats.responseTimes[endpoint]) {
      requestStats.responseTimes[endpoint] = {
        count: 0,
        totalTime: 0,
        average: 0,
      };
    }
    const rt = requestStats.responseTimes[endpoint];
    rt.count++;
    rt.totalTime += duration;
    rt.average = Math.round(rt.totalTime / rt.count);

    const logData = {
      ip: clientIP,
      method: req.method,
      url: req.originalUrl || req.url,
      path: req.path,
      query: req.query,
      params: req.params,
      headers: {
        'user-agent': req.get('user-agent'),
        referer: req.get('referer'),
        host: req.get('host'),
      },
      response: {
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
        duration: `${duration}ms`,
        contentType: res.get('Content-Type'),
        contentLength: res.get('Content-Length'),
      },
      requestBody:
        req.body && Object.keys(req.body).length > 0
          ? req.method === 'POST' ||
            req.method === 'PUT' ||
            req.method === 'PATCH'
            ? {
                // Only log non-sensitive data
                ...req.body,
                // Remove sensitive fields
                password: req.body.password ? '***HIDDEN***' : undefined,
                token: req.body.token ? '***HIDDEN***' : undefined,
                refreshToken: req.body.refreshToken
                  ? '***HIDDEN***'
                  : undefined,
                authorization: req.headers.authorization
                  ? '***HIDDEN***'
                  : undefined,
              }
            : req.body
          : undefined,
    };

    // Clean up sensitive data
    if (logData.requestBody) {
      delete logData.requestBody.password;
      delete logData.requestBody.token;
      delete logData.requestBody.refreshToken;
      delete logData.requestBody.authorization;
      if (
        logData.requestBody.headers &&
        logData.requestBody.headers.authorization
      ) {
        logData.requestBody.headers.authorization = '***HIDDEN***';
      }
    }

    // Log using Winston
    logger.info('Request processed', logData);
  });

  next();
};

module.exports = { requestLogger, requestStats };
