// Security middleware exports
export { default as helmet, helmetConfig, customSecurityHeaders } from './helmet';
export { default as replayWindow, createReplayWindow } from './replayWindow';
export { default as validateSDK, requireSDKPermission } from './sdkMiddleware';
export { default as hmacValidator, createHMACValidator, validateWebhookHMAC } from './hmacValidation';

// Combined security middleware stack
import { helmetConfig, customSecurityHeaders } from './helmet';
import { replayWindow } from './replayWindow';
import { validateSDK } from './sdkMiddleware';
import { hmacValidator } from './hmacValidation';

export const securityStack = [
  helmetConfig,
  customSecurityHeaders
];

export const apiSecurityStack = [
  helmetConfig,
  customSecurityHeaders,
  replayWindow,
  validateSDK
];

export const webhookSecurityStack = [
  helmetConfig,
  customSecurityHeaders,
  hmacValidator
];