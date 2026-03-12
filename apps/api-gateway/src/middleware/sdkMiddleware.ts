import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

interface SDKConfig {
  apiKey: string;
  secret: string;
  name: string;
  permissions: string[];
}

// SDK configurations (in production, load from database)
const sdkConfigs: Map<string, SDKConfig> = new Map([
  ['sdk_key_1', {
    apiKey: 'sdk_key_1',
    secret: process.env.SDK_SECRET_1 || 'default_secret_1',
    name: 'Mobile App SDK',
    permissions: ['read', 'write']
  }],
  ['sdk_key_2', {
    apiKey: 'sdk_key_2',
    secret: process.env.SDK_SECRET_2 || 'default_secret_2',
    name: 'Web SDK',
    permissions: ['read']
  }]
]);

export const validateSDK = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-sdk-key'] as string;
  const signature = req.headers['x-sdk-signature'] as string;
  const timestamp = req.headers['x-timestamp'] as string;

  if (!apiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'SDK API key is required'
    });
  }

  if (!signature) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'SDK signature is required'
    });
  }

  if (!timestamp) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Timestamp is required'
    });
  }

  const sdkConfig = sdkConfigs.get(apiKey);
  if (!sdkConfig) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid SDK API key'
    });
  }

  // Verify timestamp (5 minute window)
  const requestTime = parseInt(timestamp);
  const currentTime = Date.now();
  const timeDiff = Math.abs(currentTime - requestTime);
  
  if (timeDiff > 5 * 60 * 1000) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Request timestamp expired'
    });
  }

  // Create signature for verification
  const method = req.method;
  const path = req.path;
  const body = req.body ? JSON.stringify(req.body) : '';
  const stringToSign = `${method}\n${path}\n${body}\n${timestamp}`;
  
  const expectedSignature = crypto
    .createHmac('sha256', sdkConfig.secret)
    .update(stringToSign)
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid SDK signature'
    });
  }

  // Add SDK info to request
  (req as any).sdk = {
    apiKey: sdkConfig.apiKey,
    name: sdkConfig.name,
    permissions: sdkConfig.permissions
  };

  next();
};

// Permission check middleware
export const requireSDKPermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const sdk = (req as any).sdk;
    
    if (!sdk) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'SDK validation required'
      });
    }

    if (!sdk.permissions.includes(permission)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `SDK does not have '${permission}' permission`
      });
    }

    next();
  };
};

export default validateSDK;