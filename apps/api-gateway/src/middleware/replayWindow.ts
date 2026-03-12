import { Request, Response, NextFunction } from 'express';

interface ReplayWindowOptions {
  windowMs?: number;
  timestampHeader?: string;
  tolerance?: number;
}

// In-memory store for processed requests (replace with Redis in production)
const processedRequests = new Map<string, number>();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  const cutoff = now - (5 * 60 * 1000); // 5 minutes
  
  for (const [key, timestamp] of processedRequests.entries()) {
    if (timestamp < cutoff) {
      processedRequests.delete(key);
    }
  }
}, 60 * 1000); // Cleanup every minute

export const createReplayWindow = (options: ReplayWindowOptions = {}) => {
  const {
    windowMs = 5 * 60 * 1000, // 5 minutes
    timestampHeader = 'x-timestamp',
    tolerance = 30 * 1000 // 30 seconds tolerance
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const timestamp = req.headers[timestampHeader] as string;
    const nonce = req.headers['x-nonce'] as string;

    if (!timestamp) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Timestamp header is required'
      });
    }

    if (!nonce) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Nonce header is required'
      });
    }

    const requestTime = parseInt(timestamp);
    const currentTime = Date.now();

    // Validate timestamp format
    if (isNaN(requestTime)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid timestamp format'
      });
    }

    // Check if request is within acceptable time window
    const timeDiff = Math.abs(currentTime - requestTime);
    if (timeDiff > windowMs) {
      return res.status(401).json({
        error: 'Request Expired',
        message: 'Request timestamp is outside acceptable window'
      });
    }

    // Check for replay attack using nonce
    const requestKey = `${req.ip}-${nonce}-${timestamp}`;
    if (processedRequests.has(requestKey)) {
      return res.status(401).json({
        error: 'Replay Attack Detected',
        message: 'Request has already been processed'
      });
    }

    // Store request to prevent replay
    processedRequests.set(requestKey, currentTime);

    // Add timestamp to request for downstream use
    (req as any).requestTimestamp = requestTime;
    (req as any).requestNonce = nonce;

    next();
  };
};

// Default replay window middleware
export const replayWindow = createReplayWindow();

export default replayWindow;