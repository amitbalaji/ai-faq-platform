export function requireRole(role: "admin" | "user") {
    return (req, res, next) => {
      const user = (req as any).user
  
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" })
      }
  
      // Admin can access everything
      if (user.role !== role && user.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: insufficient role" })
      }
  
      next()
    }
  }
  