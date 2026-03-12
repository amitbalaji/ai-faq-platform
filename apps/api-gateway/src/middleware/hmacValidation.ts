import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

interface HMACOptions {
  secret?: string;
  algorithm?: string;
  signatureHeader?: string;
  timestampHeader?: string;
  tolerance?: number;
}

export const createHMACValidator = (options: HMACOptions = {}) => {
  const {
    secret = process.env.HMAC_SECRET || 'default_hmac_secret',
    algorithm = 'sha256',
    signatureHeader = 'x-signature',
    timestampHeader = 'x-timestamp',
    tolerance = 5 * 60 * 1000 // 5 minutes
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers[signatureHeader] as string;
    const timestamp = req.headers[timestampHeader] as string;

    if (!signature) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'HMAC signature is required'
      });
    }

    if (!timestamp) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Timestamp is required for HMAC validation'
      });
    }

    // Validate timestamp
    const requestTime = parseInt(timestamp);
    const currentTime = Date.now();
    
    if (isNaN(requestTime)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid timestamp format'
      });
    }

    const timeDiff = Math.abs(currentTime - requestTime);
    if (timeDiff > tolerance) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Request timestamp is outside acceptable window'
      });
    }

    // Prepare payload for HMAC calculation
    const method = req.method;
    const path = req.originalUrl || req.url;
    const body = req.body ? JSON.stringify(req.body) : '';
    const contentType = req.headers['content-type'] || '';
    
    // Create canonical string
    const canonicalString = [
      method,
      path,
      contentType,
      body,
      timestamp
    ].join('\n');

    // Calculate expected HMAC
    const expectedSignature = crypto
      .createHmac(algorithm, secret)
      .update(canonicalString)
      .digest('hex');

    // Remove any prefix (like "sha256=")
    const providedSignature = signature.replace(/^sha256=/, '');

    // Constant-time comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(providedSignature, 'hex')
    )) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid HMAC signature'
      });
    }

    // Add HMAC validation info to request
    (req as any).hmacValidated = true;
    (req as any).hmacTimestamp = requestTime;

    next();
  };
};

// Webhook HMAC validator (common for webhooks)
export const validateWebhookHMAC = (secret: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const signature = req.headers['x-hub-signature-256'] as string;
    
    if (!signature) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Webhook signature is required'
      });
    }

    const body = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    const providedSignature = signature.replace('sha256=', '');

    if (!crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(providedSignature, 'hex')
    )) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid webhook signature'
      });
    }

    next();
  };
};

// Default HMAC validator
export const hmacValidator = createHMACValidator();

export default hmacValidator;