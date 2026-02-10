import express, { Handler } from "express"
import cors from "cors"
import rateLimit from "express-rate-limit"
import dotenv from "dotenv"
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

app.get("/admin/profile", verifyJWT, requireRole("admin"), (req, res) => {
  res.json({
    message: "Admin profile access granted",
    user: (req as any).user
  })
})

app.post("/admin/upload", verifyJWT, requireRole("admin"), (req, res) => {
  res.json({ message: "Admin upload allowed" })
})

app.post("/chat/query", verifyJWT, requireRole("user"), (req, res) => {
  res.json({ message: "Chat allowed" })
})

app.listen(4000, () => {
  console.log("API Gateway running at http://localhost:4000")
})

app.post(
  "/admin/upload/presigned",
  verifyJWT,
  requireRole("admin"),
  async (req, res) => {
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
  }
)

app.post(
  "/documents",
  verifyJWT,
  requireRole("admin"),
  async (req, res) => {
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
  }
)

