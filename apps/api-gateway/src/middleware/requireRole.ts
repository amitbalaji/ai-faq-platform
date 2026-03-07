import { Request, Response, NextFunction } from "express"

// CHANGE: Enhanced role-based access control middleware
export function requireRole(requiredRole: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user

    if (!user) {
      return res.status(401).json({ error: "Authentication required" })
    }

    // CHANGE: Support role hierarchy - admin can access user endpoints
    const userRole = user.role
    
    if (requiredRole === "user") {
      // CHANGE: Both admin and user can access user endpoints
      if (userRole === "admin" || userRole === "user") {
        return next()
      }
    } else if (requiredRole === "admin") {
      // CHANGE: Only admin can access admin endpoints
      if (userRole === "admin") {
        return next()
      }
    }

    return res.status(403).json({ 
      error: `Access denied. Required role: ${requiredRole}, your role: ${userRole}` 
    })
  }
}