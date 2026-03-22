import winston from 'winston';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// CHANGE: Configure Winston logger for comprehensive logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return JSON.stringify({
        timestamp,
        level,
        message,
        service: 'api-gateway',
        ...meta
      });
    })
  ),
  defaultMeta: {
    service: 'api-gateway',
    version: process.env.npm_package_version || '1.0.0'
  },
  transports: [
    // CHANGE: Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    // CHANGE: File transport for production logs
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 10
    })
  ]
});

// CHANGE: Add request correlation ID middleware
export const addCorrelationId = (req: Request, res: Response, next: NextFunction) => {
  const correlationId = req.headers['x-correlation-id'] as string || randomUUID();
  
  // CHANGE: Add to request for downstream use
  (req as any).correlationId = correlationId;
  
  // CHANGE: Add to response headers
  res.setHeader('x-correlation-id', correlationId);
  
  next();
};

// CHANGE: Request logging middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const correlationId = (req as any).correlationId;
  const user = (req as any).user;

  // CHANGE: Log incoming request
  logger.info('Incoming request', {
    correlationId,
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    query: req.query,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: user?.userId,
    tenantId: user?.tenantId,
    role: user?.role,
    timestamp: new Date().toISOString()
  });

  // CHANGE: Capture response details
  const originalSend = res.send;
  res.send = function(body) {
    const duration = Date.now() - startTime;
    
    // CHANGE: Log response
    logger.info('Outgoing response', {
      correlationId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length'),
      userId: user?.userId,
      tenantId: user?.tenantId,
      timestamp: new Date().toISOString()
    });

    // CHANGE: Log slow requests
    if (duration > 5000) {
      logger.warn('Slow request detected', {
        correlationId,
        method: req.method,
        url: req.originalUrl,
        duration: `${duration}ms`,
        userId: user?.userId,
        tenantId: user?.tenantId
      });
    }

    return originalSend.call(this, body);
  };

  next();
};

// CHANGE: Error logging middleware
export const errorLogger = (error: Error, req: Request, res: Response, next: NextFunction) => {
  const correlationId = (req as any).correlationId;
  const user = (req as any).user;

  logger.error('Request error', {
    correlationId,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    method: req.method,
    url: req.originalUrl,
    userId: user?.userId,
    tenantId: user?.tenantId,
    timestamp: new Date().toISOString()
  });

  next(error);
};

// CHANGE: Security event logger
export const logSecurityEvent = (event: string, details: any, req: Request) => {
  const correlationId = (req as any).correlationId;
  const user = (req as any).user;

  logger.warn('Security event', {
    correlationId,
    event,
    details,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: user?.userId,
    tenantId: user?.tenantId,
    timestamp: new Date().toISOString()
  });
};

// CHANGE: Business event logger
export const logBusinessEvent = (event: string, details: any, req?: Request) => {
  const correlationId = req ? (req as any).correlationId : randomUUID();
  const user = req ? (req as any).user : null;

  logger.info('Business event', {
    correlationId,
    event,
    details,
    userId: user?.userId,
    tenantId: user?.tenantId,
    timestamp: new Date().toISOString()
  });
};

// CHANGE: Performance monitoring
export const performanceLogger = (operation: string, duration: number, metadata?: any) => {
  logger.info('Performance metric', {
    operation,
    duration: `${duration}ms`,
    metadata,
    timestamp: new Date().toISOString()
  });

  // CHANGE: Log performance warnings
  if (duration > 10000) {
    logger.warn('Performance issue detected', {
      operation,
      duration: `${duration}ms`,
      metadata
    });
  }
};

// CHANGE: Health check logger
export const logHealthCheck = (service: string, status: 'healthy' | 'unhealthy', details?: any) => {
  const level = status === 'healthy' ? 'info' : 'error';
  
  logger.log(level, 'Health check', {
    service,
    status,
    details,
    timestamp: new Date().toISOString()
  });
};

export { logger };
export default logger;