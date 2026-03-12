import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import path from "path"
import bcrypt from "bcrypt"
dotenv.config({
  path: path.resolve(__dirname, "../.env")
})
import jwt from "jsonwebtoken"
import { db } from "./db"
import { randomUUID } from "crypto"

console.log("Loaded DB URL:", process.env.DATABASE_URL)
dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

// CHANGE: JWT configuration constants
const ACCESS_TOKEN_EXPIRY = "15m"
const REFRESH_TOKEN_EXPIRY = "7d"
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret"
const REFRESH_SECRET = process.env.REFRESH_SECRET || "dev_refresh_secret"

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "auth-tenant-service" })
})

// CHANGE: Helper function to generate token pair
function generateTokenPair(userId: string, tenantId: string, role: string) {
  const accessToken = jwt.sign(
    { userId, tenantId, role, type: "access" },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  )

  const refreshToken = jwt.sign(
    { userId, tenantId, type: "refresh", jti: randomUUID() },
    REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  )

  return { accessToken, refreshToken }
}

// CHANGE: Helper function to store refresh token
async function storeRefreshToken(userId: string, refreshToken: string, expiresAt: Date) {
  try {
    // CHANGE: Invalidate existing refresh tokens for this user
    await db.query(
      "UPDATE refresh_tokens SET is_active = false WHERE user_id = $1 AND is_active = true",
      [userId]
    )

    // CHANGE: Store new refresh token
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, is_active, created_at) 
       VALUES ($1, $2, $3, true, NOW())`,
      [userId, refreshToken, expiresAt]
    )
  } catch (error) {
    console.error("Error storing refresh token:", error)
    throw new Error("Failed to store refresh token")
  }
}

// Helper function to extract domain from email
function extractDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() || ''
}

// Helper function to normalize company name for matching
function normalizeCompanyName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]/g, '')
}

// Find tenant by company name and email domain matching
async function findTenantByCompanyAndDomain(tenantName: string, emailDomain: string): Promise<any> {
  try {
    // Search for tenants with matching normalized company name
    const normalizedTenantName = normalizeCompanyName(tenantName)
    
    const tenantResult = await db.query(
      `
      SELECT t.id, t.name, u.email 
      FROM tenants t
      JOIN users u ON t.id = u.tenant_id 
      WHERE u.role = 'admin' 
        AND LOWER(REPLACE(REGEXP_REPLACE(t.name, '[^a-zA-Z0-9]', '', 'g'), ' ', '')) = $1
        AND SPLIT_PART(u.email, '@', 2) = $2
      LIMIT 1
      `,
      [normalizedTenantName, emailDomain]
    )

    return tenantResult.rows.length > 0 ? tenantResult.rows[0] : null
  } catch (error) {
    console.error("Error finding tenant by company and domain:", error)
    return null
  }
}

app.post("/auth/signup", async (req, res) => {
  try {
    const { email, password, signupType, tenantName, orgId } = req.body

    if (!email || !password || !signupType) {
      return res.status(400).json({ error: "Missing fields" })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const emailDomain = extractDomain(email)

    let tenantId
    let role = "user"

    // ADMIN SIGNUP → CREATE TENANT
    if (signupType === "admin") {
      if (!tenantName) {
        return res.status(400).json({ error: "Tenant name required" })
      }

      const tenant = await db.query(
        "INSERT INTO tenants (name) VALUES ($1) RETURNING id",
        [tenantName]
      )

      tenantId = tenant.rows[0].id
      role = "admin"
    }

    // USER SIGNUP → AUTOMATIC TENANT ASSOCIATION
    if (signupType === "user") {
      // Try automatic tenant association first
      if (tenantName && emailDomain) {
        const matchedTenant = await findTenantByCompanyAndDomain(tenantName, emailDomain)
        
        if (matchedTenant) {
          tenantId = matchedTenant.id
          console.log(`Auto-assigned user ${email} to tenant ${matchedTenant.name} (${matchedTenant.id})`)
        }
      }

      // Fallback to manual orgId if automatic matching fails
      if (!tenantId && orgId) {
        const tenant = await db.query(
          "SELECT id FROM tenants WHERE id = $1",
          [orgId]
        )

        if (!tenant.rows.length) {
          return res.status(400).json({ error: "Invalid organization" })
        }

        tenantId = orgId
      }

      // If neither automatic nor manual assignment worked
      if (!tenantId) {
        return res.status(400).json({ 
          error: "Unable to assign to organization. Please provide valid company name matching your email domain or contact your admin for orgId." 
        })
      }

      role = "user"
    }

    // Check for duplicate email within the same tenant
    const existingUser = await db.query(
      "SELECT id FROM users WHERE email = $1 AND tenant_id = $2",
      [email, tenantId]
    )

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "User already exists in this organization" })
    }

    // Create User
    const user = await db.query(
      "INSERT INTO users (email, password_hash, tenant_id, role) VALUES ($1,$2,$3,$4) RETURNING id",
      [email, passwordHash, tenantId, role]
    )

    const userId = user.rows[0].id

    // CHANGE: Generate token pair instead of single JWT
    const { accessToken, refreshToken } = generateTokenPair(userId, tenantId, role)

    // CHANGE: Store refresh token in database
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    await storeRefreshToken(userId, refreshToken, refreshExpiresAt)

    // Return additional info about tenant assignment method
    const response: any = { 
      accessToken, 
      refreshToken, 
      tenantId, 
      role,
      expiresIn: ACCESS_TOKEN_EXPIRY
    }
    
    if (signupType === "user" && tenantName) {
      const tenantInfo = await db.query("SELECT name FROM tenants WHERE id = $1", [tenantId])
      response.assignmentMethod = orgId ? "manual" : "automatic"
      response.companyName = tenantInfo.rows[0]?.name
    }

    res.json(response)

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Signup failed" })
  }
})

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body

    const user = await db.query(
      "SELECT id, password_hash, tenant_id, role FROM users WHERE email = $1",
      [email]
    )

    if (!user.rows.length) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    const valid = await bcrypt.compare(password, user.rows[0].password_hash)

    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    const { id: userId, tenant_id: tenantId, role } = user.rows[0]

    // CHANGE: Generate token pair instead of single JWT
    const { accessToken, refreshToken } = generateTokenPair(userId, tenantId, role)

    // CHANGE: Store refresh token in database
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    await storeRefreshToken(userId, refreshToken, refreshExpiresAt)

    res.json({ 
      accessToken, 
      refreshToken, 
      expiresIn: ACCESS_TOKEN_EXPIRY,
      tokenType: "Bearer"
    })

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Login failed" })
  }
})

// CHANGE: Add refresh token endpoint
app.post("/auth/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token required" })
    }

    // CHANGE: Verify refresh token
    let decoded
    try {
      decoded = jwt.verify(refreshToken, REFRESH_SECRET) as any
    } catch (error) {
      return res.status(401).json({ error: "Invalid refresh token" })
    }

    if (decoded.type !== "refresh") {
      return res.status(401).json({ error: "Invalid token type" })
    }

    // CHANGE: Check if refresh token exists and is active in database
    const storedToken = await db.query(
      `SELECT rt.user_id, rt.expires_at, u.tenant_id, u.role 
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       WHERE rt.token_hash = $1 AND rt.is_active = true AND rt.expires_at > NOW()`,
      [refreshToken]
    )

    if (!storedToken.rows.length) {
      return res.status(401).json({ error: "Refresh token not found or expired" })
    }

    const { user_id: userId, tenant_id: tenantId, role } = storedToken.rows[0]

    // CHANGE: Generate new token pair (refresh token rotation)
    const { accessToken, refreshToken: newRefreshToken } = generateTokenPair(userId, tenantId, role)

    // CHANGE: Store new refresh token and invalidate old one
    const newRefreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    await storeRefreshToken(userId, newRefreshToken, newRefreshExpiresAt)

    res.json({
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRY,
      tokenType: "Bearer"
    })

  } catch (err) {
    console.error("Refresh token error:", err)
    res.status(500).json({ error: "Token refresh failed" })
  }
})

// CHANGE: Add logout endpoint to invalidate refresh tokens
app.post("/auth/logout", async (req, res) => {
  try {
    const { refreshToken } = req.body

    if (refreshToken) {
      // CHANGE: Invalidate the specific refresh token
      await db.query(
        "UPDATE refresh_tokens SET is_active = false WHERE token_hash = $1",
        [refreshToken]
      )
    }

    res.json({ message: "Logged out successfully" })

  } catch (err) {
    console.error("Logout error:", err)
    res.status(500).json({ error: "Logout failed" })
  }
})

// CHANGE: Add endpoint to logout from all devices
app.post("/auth/logout-all", async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "No token provided" })
    }

    const token = authHeader.substring(7)
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any
      
      // CHANGE: Invalidate all refresh tokens for this user
      await db.query(
        "UPDATE refresh_tokens SET is_active = false WHERE user_id = $1 AND is_active = true",
        [decoded.userId]
      )

      res.json({ message: "Logged out from all devices successfully" })

    } catch (error) {
      return res.status(401).json({ error: "Invalid token" })
    }

  } catch (err) {
    console.error("Logout all error:", err)
    res.status(500).json({ error: "Logout all failed" })
  }
})

app.listen(4001, () => {
  console.log("Auth Service running on http://localhost:4001")
})