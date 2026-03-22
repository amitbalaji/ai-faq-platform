import express, { Handler } from "express"
import cors from "cors"
import rateLimit from "express-rate-limit"
import dotenv from "dotenv"
import path from "path"
import { createProxyMiddleware } from 'http-proxy-middleware'
dotenv.config({
  path: path.resolve(__dirname, "../.env")
})
import { verifyJWT } from "./middleware/jwt"
import { requireRole } from "./middleware/requireRole"
// CHANGE: Import new security middleware
import { helmetConfig, customSecurityHeaders } from "./middleware/helmet"
import { replayWindow } from "./middleware/replayWindow"
import { validateSDK, requireSDKPermission } from "./middleware/sdkMiddleware"
import { hmacValidator } from "./middleware/hmacValidation"

dotenv.config()

const app = express()

// CHANGE: Apply security middleware stack
app.use(helmetConfig)
app.use(customSecurityHeaders)
app.use(cors())

// CHANGE: Simplified auth service proxy - no custom headers, just clean forwarding
const authServiceProxy = createProxyMiddleware({
  target: process.env.AUTH_SERVICE_URL || 'http://localhost:4001',
  changeOrigin: true,

  onProxyReq: (proxyReq, req, res) => {
    // CHANGE: Simple logging without complex header manipulation
    console.log(`Proxying ${req.method} ${req.originalUrl} to auth service`);
  },
  onError: (err, req, res) => {
    console.error(`Auth service proxy error for ${req.originalUrl}:`, err.message);
    res.status(502).json({ 
      error: 'Authentication service temporarily unavailable'
    });
  },
  timeout: 30000,
  proxyTimeout: 30000,
  // CHANGE: Let http-proxy-middleware handle headers and body automatically
  secure: false,
  followRedirects: false
});

app.use('/auth', authServiceProxy)


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



// CHANGE: Protected SDK endpoints with replay protection
app.use("/api/sdk", replayWindow, validateSDK)

// CHANGE: Webhook endpoints with HMAC validation
app.use("/webhooks", hmacValidator)

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

// CHANGE: Add document search endpoint for both admin and user roles
app.post("/documents/search", verifyJWT, requireRole("user"), async (req, res) => {
  const user = (req as any).user
  const { query, model} = req.body

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: "Query text is required" })
  }

  try {
    // CHANGE: Generate embedding via AI service
    const embeddingResponse = await fetch("http://localhost:3003/embeddings", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-tenant-id": user.tenantId,
        "x-user-id": user.userId,
        "x-role": user.role
      },
      body: JSON.stringify({ text: query, model })
    })

    if (!embeddingResponse.ok) {
      throw new Error(`AI Service failed: ${embeddingResponse.status}`)
    }

    const { embedding } = await embeddingResponse.json()

    // CHANGE: Forward search request to document service
    const searchResponse = await fetch("http://localhost:4004/documents/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": user.tenantId,
        "x-user-id": user.userId,
        "x-role": user.role
      },
      body: JSON.stringify({ query, embedding })
    })

    const searchData = await searchResponse.json()
    res.status(searchResponse.status).json(searchData)

  } catch (err) {
    console.error("Search failed:", err)
    res.status(500).json({ error: "Search failed" })
  }
})

// CHANGE: Add embeddings endpoint to route through AI service
app.post("/embeddings", verifyJWT, async (req, res) => {
  const user = (req as any).user
  const { text, model } = req.body

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: "Text is required for embedding generation" })
  }

  if (text.length > 8000) {
    return res.status(400).json({ error: "Text too long (max 8000 characters)" })
  }

  try {
    // CHANGE: Call AI service directly for embedding generation
    const embeddingResponse = await fetch("http://localhost:3003/embeddings", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-tenant-id": user.tenantId,
        "x-user-id": user.userId,
        "x-role": user.role
      },
      body: JSON.stringify({ text, model })
    })

    if (!embeddingResponse.ok) {
      const errorData = await embeddingResponse.json().catch(() => ({}))
      throw new Error(`AI Service failed: ${embeddingResponse.status} - ${errorData.error || 'Unknown error'}`)
    }

    const embeddingData = await embeddingResponse.json()
    res.json(embeddingData)

  } catch (err) {
    console.error("Embedding generation failed:", err)
    res.status(500).json({ 
      error: "Failed to generate embedding",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    })
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