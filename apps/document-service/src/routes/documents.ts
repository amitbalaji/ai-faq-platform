import { Router } from "express"
import { db } from "../db"
import { publishDocumentUploaded } from "../kafka/producer"
import { randomUUID } from "crypto"

const router = Router()

/**
 * Create document metadata (Admin only)
 */
router.post("/", async (req, res) => {
  // ✅ Read identity from headers (API Gateway responsibility)
  const tenantId = req.headers["x-tenant-id"] as string
  const userId = req.headers["x-user-id"] as string
  const role = req.headers["x-role"] as string

  const { fileName, storageKey } = req.body

  if (!tenantId || !userId) {
    return res.status(401).json({ error: "Missing identity headers" })
  }

  if (role !== "admin") {
    return res.status(403).json({ error: "Only admin can upload documents" })
  }

  if (!fileName || !storageKey) {
    return res.status(400).json({ error: "Missing fields" })
  }

  try {
    // ✅ DB is source of truth
    const result = await db.query(
      `
      INSERT INTO documents (tenant_id, uploaded_by, file_name, storage_key)
      VALUES ($1, $2, $3, $4)
      RETURNING id, status
      `,
      [tenantId, userId, fileName, storageKey]
    )

    const documentId = result.rows[0].id

    // 🔔 Kafka event (best-effort, non-blocking)
    publishDocumentUploaded({
      eventId: randomUUID(),
      documentId,
      tenantId,
      storageKey,
      fileName
    }).catch(err => {
      console.error("Failed to publish Kafka event", err)
    })

    res.json({
      documentId,
      status: result.rows[0].status
    })
  } catch (err) {
    console.error("Create document failed:", err)
    res.status(500).json({ error: "Failed to create document" })
  }
})

/**
 * List documents for tenant
 */
router.get("/", async (req, res) => {
  const tenantId = req.headers["x-tenant-id"] as string

  if (!tenantId) {
    return res.status(401).json({ error: "Missing tenant context" })
  }

  const result = await db.query(
    `
    SELECT id, file_name, status, created_at
    FROM documents
    WHERE tenant_id = $1
    ORDER BY created_at DESC
    `,
    [tenantId]
  )

  res.json(result.rows)
})
// CHANGE: Add vector search endpoint that accepts pre-computed embeddings
router.post("/search", async (req, res) => {
  const tenantId = req.headers["x-tenant-id"] as string
  const { query, embedding } = req.body

  if (!tenantId) {
    return res.status(401).json({ error: "Missing tenant context" })
  }

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: "Query text is required" })
  }

  if (!embedding || !Array.isArray(embedding)) {
    return res.status(400).json({ error: "Pre-computed embedding is required" })
  }

  try {
    // CHANGE: Only perform vector similarity search - no AI logic
    const result = await db.query(
      `
      SELECT content,
             1 - (embedding <=> $1) AS similarity,
             chunk_index
      FROM document_chunks
      WHERE tenant_id = $2
      ORDER BY embedding <=> $1
      LIMIT 5
      `,
      [JSON.stringify(embedding), tenantId]
    )

    res.json({
      query,
      results: result.rows.map(row => ({
        content: row.content,
        similarity: parseFloat(row.similarity),
        chunkIndex: row.chunk_index
      }))
    })
  } catch (err) {
    console.error("Search failed:", err)
    res.status(500).json({ error: "Search failed" })
  }
})

export default router
