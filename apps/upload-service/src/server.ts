import dotenv from "dotenv"
dotenv.config()

import express from "express"
import cors from "cors"
import { config } from "./config"
import { generatePresignedUploadUrl } from "./presigned"

const app = express()
app.use(cors())
app.use(express.json())

/**
 * Health Check
 */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "upload-service" })
})

/**
 * Generate Presigned Upload URL
 * Called ONLY by API Gateway
 */
app.post("/upload/presigned", async (req, res) => {
  try {
    const { tenantId, fileName, mimeType } = req.body

    if (!tenantId || !fileName || !mimeType) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    if (!config.useS3) {
      return res.status(400).json({ error: "S3 uploads disabled" })
    }

    const result = await generatePresignedUploadUrl(
      tenantId,
      fileName,
      mimeType
    )

    res.json(result)
  } catch (err) {
    console.error("Upload error:", err)
    res.status(500).json({ error: "Failed to generate upload URL" })
  }
})

app.listen(config.port, () => {
  console.log(`Upload Service running on http://localhost:${config.port}`)
})
