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

console.log("Loaded DB URL:", process.env.DATABASE_URL)
dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "auth-tenant-service" })
})

// CHANGE: Helper function to extract domain from email
function extractDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() || ''
}

// CHANGE: Helper function to normalize company name for matching
function normalizeCompanyName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]/g, '')
}

// CHANGE: Find tenant by company name and email domain matching
async function findTenantByCompanyAndDomain(tenantName: string, emailDomain: string): Promise<any> {
  try {
    // CHANGE: Search for tenants with matching normalized company name
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
      // CHANGE: Try automatic tenant association first
      if (tenantName && emailDomain) {
        const matchedTenant = await findTenantByCompanyAndDomain(tenantName, emailDomain)
        
        if (matchedTenant) {
          tenantId = matchedTenant.id
          console.log(`Auto-assigned user ${email} to tenant ${matchedTenant.name} (${matchedTenant.id})`)
        }
      }

      // CHANGE: Fallback to manual orgId if automatic matching fails
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

      // CHANGE: If neither automatic nor manual assignment worked
      if (!tenantId) {
        return res.status(400).json({ 
          error: "Unable to assign to organization. Please provide valid company name matching your email domain or contact your admin for orgId." 
        })
      }

      role = "user"
    }

    // CHANGE: Check for duplicate email within the same tenant
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

    // Create JWT
    const token = jwt.sign(
      { userId: user.rows[0].id, tenantId, role},
      process.env.JWT_SECRET!,
      { expiresIn: "15m" }
    )

    // CHANGE: Return additional info about tenant assignment method
    const response: any = { token, tenantId, role }
    
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

    const token = jwt.sign(
      { userId: user.rows[0].id, tenantId: user.rows[0].tenant_id,  role: user.rows[0].role },
      process.env.JWT_SECRET || "dev_secret",
      { expiresIn: "7d" }
    )

    res.json({ token })

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Login failed" })
  }
})  

app.listen(4001, () => {
  console.log("Auth Service running on http://localhost:4001")
})