import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import crypto from "crypto"
import { db } from "./db"


dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "auth-tenant-service" })
})

  app.post("/auth/signup", async (req, res) => {
    try {
      const { email, password, signupType, tenantName, orgId } = req.body
  
      if (!email || !password || !signupType) {
        return res.status(400).json({ error: "Missing fields" })
      }
  
      const passwordHash = await bcrypt.hash(password, 10)
  
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
  
      // USER SIGNUP → JOIN EXISTING TENANT
      if (signupType === "user") {
        if (!orgId) {
          return res.status(400).json({ error: "Missing orgId" })
        }
  
        const tenant = await db.query(
          "SELECT id FROM tenants WHERE id = $1",
          [orgId]
        )
  
        if (!tenant.rows.length) {
          return res.status(400).json({ error: "Invalid organization" })
        }
  
        tenantId = orgId
        role = "user"
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
  
      res.json({ token, tenantId, role })
  
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
