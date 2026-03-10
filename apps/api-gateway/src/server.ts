import express, { Handler } from "express"
import cors from "cors"
import rateLimit from "express-rate-limit"
import dotenv from "dotenv"
import path from "path"
dotenv.config({
  path: path.resolve(__dirname, "../.env")
})
import { verifyJWT } from "./middleware/jwt"
import { requireRole } from "./middleware/requireRole"

dotenv.config()

const app = express()

app.use(cors())
app.use(express.json())

// Explicitly cast to generic Express handler
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100
}) as unknown as Handler

app.use(limiter)

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "api-gateway" })
})

// CHANGE: Admin-only profile access
app.get("/admin/profile", verifyJWT, requireRole("admin"), (req, res) => {
  res.json({
    message: "Admin profile access granted",
    user: (req as any).user
  })
})

// CHANGE: Admin-only document upload endpoints
app.post("/admin/upload/presigned", verifyJWT, requireRole("admin"), async (req, res) => {
  const user = (req as any).user

  const response = await fetch("http://localhost:4003/upload/presigned", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenantId: user.tenantId,
      fileName: req.body.fileName,
      mimeType: req.body.mimeType
    })
  })

  const data = await response.json()
  res.status(response.status).json(data)
})

app.post("/documents", verifyJWT, requireRole("admin"), async (req, res) => {
  const user = (req as any).user

  const response = await fetch("http://localhost:4004/documents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": user.tenantId,
      "x-user-id": user.userId,
      "x-role": user.role
    },
    body: JSON.stringify(req.body)
  })

  const data = await response.json()
  res.status(response.status).json(data)
})

// CHANGE: Admin can list documents for their tenant
app.get("/documents", verifyJWT, requireRole("admin"), async (req, res) => {
  const user = (req as any).user

  try {
    const response = await fetch("http://localhost:4004/documents", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": user.tenantId,
        "x-user-id": user.userId,
        "x-role": user.role
      }
    })

    const data = await response.json()
    res.status(response.status).json(data)

  } catch (err) {
    console.error("List documents failed:", err)
    res.status(500).json({ error: "Failed to list documents" })
  }
})

// CHANGE: Chat is the only user-facing interface - handles search internally
app.post("/chat", verifyJWT, requireRole("user"), async (req, res) => {
  const user = (req as any).user
  const { query, conversationId } = req.body

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: "Query text is required" })
  }

  try {
    // CHANGE: Forward chat request to chat service - it handles document search internally
    const chatResponse = await fetch("http://localhost:3002/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": user.tenantId,
        "x-user-id": user.userId,
        "x-role": user.role
      },
      body: JSON.stringify({ query, conversationId })
    })

    const chatData = await chatResponse.json()
    res.status(chatResponse.status).json(chatData)

  } catch (err) {
    console.error("Chat failed:", err)
    res.status(500).json({ error: "Chat failed" })
  }
})

// CHANGE: Get conversation history
app.get("/chat/conversations/:conversationId", verifyJWT, requireRole("user"), async (req, res) => {
  const user = (req as any).user
  const { conversationId } = req.params

  try {
    const response = await fetch(`http://localhost:3002/conversations/${conversationId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": user.tenantId,
        "x-user-id": user.userId,
        "x-role": user.role
      }
    })

    const data = await response.json()
    res.status(response.status).json(data)

  } catch (err) {
    console.error("Get conversation failed:", err)
    res.status(500).json({ error: "Failed to get conversation" })
  }
})

// CHANGE: List user conversations
app.get("/chat/conversations", verifyJWT, requireRole("user"), async (req, res) => {
  const user = (req as any).user

  try {
    const response = await fetch("http://localhost:3002/conversations", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": user.tenantId,
        "x-user-id": user.userId,
        "x-role": user.role
      }
    })

    const data = await response.json()
    res.status(response.status).json(data)

  } catch (err) {
    console.error("List conversations failed:", err)
    res.status(500).json({ error: "Failed to list conversations" })
  }
})

app.listen(4000, () => {
  console.log("API Gateway running at http://localhost:4000")
})