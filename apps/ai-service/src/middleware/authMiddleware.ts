import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { AppError } from '../utils/errors'

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string
    tenantId: string
    role: string
  }
}

// CHANGE: Add JWT verification middleware for AI service
export const verifyJWT = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' })
  }

  const token = authHeader.substring(7)
  const jwtSecret = process.env.JWT_SECRET || 'dev_secret'

  try {
    const decoded = jwt.verify(token, jwtSecret) as any
    
    // CHANGE: Extract user context from JWT token
    req.user = {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      role: decoded.role
    }

    next()
  } catch (error) {
    console.error('JWT verification failed:', error)
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// CHANGE: Add middleware to extract identity from headers (for API Gateway forwarded requests)
export const extractIdentityHeaders = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const tenantId = req.headers['x-tenant-id'] as string
  const userId = req.headers['x-user-id'] as string
  const role = req.headers['x-role'] as string

  // CHANGE: If identity headers are present, use them (trusted from API Gateway)
  if (tenantId && userId && role) {
    req.user = {
      userId,
      tenantId,
      role
    }
    return next()
  }

  // CHANGE: Otherwise, require JWT verification
  return verifyJWT(req, res, next)
}

// CHANGE: Add role-based authorization middleware
export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: req.user.role
      })
    }

    next()
  }
}

// CHANGE: Export the authenticated request type for use in other files
export { AuthenticatedRequest }