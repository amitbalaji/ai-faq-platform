import { Router } from "express"
import { db } from "../db"
import { publishDocumentUploaded } from "../kafka/producer"
import { randomUUID } from "crypto"

const router = Router()

// CHANGE: Add interface for search response to maintain TypeScript compatibility
interface SearchResponse {
  query: string
  minSimilarity: number
  totalResults: number
  totalScanned: number
  userRole: string
  results: Array<{
    content: string
    similarity: number
    relevanceScore: number
    chunkIndex: number
    document: {
      id: string
      fileName: string
      createdAt: string
    }
    preview: string
    metadata?: {
      exactMatches: number
      partialMatches: number
      contextScore: number
    }
  }>
  searchQuality?: {
    avgSimilarity: number
    avgRelevance: number
    topSimilarity: number
  }
}

/**
 * Create document metadata (Admin only)
 */
router.post("/", async (req, res) => {
  // CHANGE: Read identity from headers (API Gateway responsibility)
  const tenantId = req.headers["x-tenant-id"] as string
  const userId = req.headers["x-user-id"] as string
  const role = req.headers["x-role"] as string

  const { fileName, storageKey } = req.body

  if (!tenantId || !userId) {
    return res.status(401).json({ error: "Missing identity headers" })
  }

  // CHANGE: Enforce admin-only document upload
  if (role !== "admin") {
    return res.status(403).json({ error: "Only admin users can upload documents" })
  }

  if (!fileName || !storageKey) {
    return res.status(400).json({ error: "Missing required fields: fileName, storageKey" })
  }

  try {
    // CHANGE: Store document metadata with admin user context
    const result = await db.query(
      `
      INSERT INTO documents (tenant_id, uploaded_by, file_name, storage_key)
      VALUES ($1, $2, $3, $4)
      RETURNING id, status, created_at
      `,
      [tenantId, userId, fileName, storageKey]
    )

    const documentId = result.rows[0].id

    // CHANGE: Publish Kafka event for document processing
    publishDocumentUploaded({
      eventId: randomUUID(),
      documentId,
      tenantId,
      storageKey,
      fileName,
      uploadedBy: userId
    }).catch(err => {
      console.error("Failed to publish Kafka event", err)
    })

    res.json({
      documentId,
      status: result.rows[0].status,
      fileName,
      createdAt: result.rows[0].created_at,
      message: "Document uploaded successfully and queued for processing"
    })
  } catch (err) {
    console.error("Create document failed:", err)
    res.status(500).json({ error: "Failed to create document" })
  }
})

/**
 * List documents for tenant (Admin only)
 */
router.get("/", async (req, res) => {
  const tenantId = req.headers["x-tenant-id"] as string
  const role = req.headers["x-role"] as string

  if (!tenantId) {
    return res.status(401).json({ error: "Missing tenant context" })
  }

  // CHANGE: Enforce admin-only document listing
  if (role !== "admin") {
    return res.status(403).json({ error: "Only admin users can list documents" })
  }

  try {
    const result = await db.query(
      `
      SELECT id, file_name, status, created_at, uploaded_by
      FROM documents
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      `,
      [tenantId]
    )

    res.json({
      documents: result.rows,
      totalCount: result.rows.length
    })
  } catch (err) {
    console.error("List documents failed:", err)
    res.status(500).json({ error: "Failed to list documents" })
  }
})

// CHANGE: Enhanced search with semantic filtering and role-based access (Available to both admin and users)
router.post("/search", async (req, res) => {
  const tenantId = req.headers["x-tenant-id"] as string
  const userId = req.headers["x-user-id"] as string
  const role = req.headers["x-role"] as string
  const { query, embedding, minSimilarity = 0.6, limit = 5, includeMetadata = true } = req.body

  if (!tenantId || !userId) {
    return res.status(401).json({ error: "Missing identity headers" })
  }

  // CHANGE: Allow both admin and user roles to search
  if (!["admin", "user"].includes(role)) {
    return res.status(403).json({ error: "Invalid user role for search" })
  }

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: "Query text is required" })
  }

  if (!embedding || !Array.isArray(embedding)) {
    return res.status(400).json({ error: "Pre-computed embedding is required" })
  }

  try {
    // CHANGE: Get broader results first for semantic filtering with tenant isolation
    const rawResults = await db.query(
      `
      SELECT 
        dc.content,
        1 - (dc.embedding <=> $1) AS similarity,
        dc.chunk_index,
        d.file_name,
        d.id as document_id,
        d.created_at
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE dc.tenant_id = $2 AND d.status = 'ready'
      ORDER BY dc.embedding <=> $1
      LIMIT 50
      `,
      [JSON.stringify(embedding), tenantId]
    )

    // CHANGE: Apply semantic filtering and relevance scoring
    const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2)
    
    const scoredResults = rawResults.rows.map(row => {
      const content = row.content.toLowerCase()
      const similarity = parseFloat(row.similarity)
      
      // CHANGE: Calculate contextual relevance score
      let contextScore = 0
      let exactMatches = 0
      let partialMatches = 0
      
      queryTerms.forEach(term => {
        if (content.includes(term)) {
          exactMatches++
          contextScore += 0.3
        }
        
        // CHANGE: Check for partial word matches
        const words = content.split(/\s+/)
        words.forEach(word => {
          if (word.includes(term) && word !== term) {
            partialMatches++
            contextScore += 0.1
          }
        })
      })
      
      // CHANGE: Boost score for content with multiple query term matches
      if (exactMatches > 1) {
        contextScore += exactMatches * 0.2
      }
      
      // CHANGE: Calculate final relevance score combining similarity and context
      const relevanceScore = (similarity * 0.7) + (Math.min(contextScore, 1.0) * 0.3)
      
      return {
        ...row,
        similarity,
        contextScore,
        relevanceScore,
        exactMatches,
        partialMatches
      }
    })

    // CHANGE: Filter by minimum similarity and sort by relevance
    const filteredResults = scoredResults
      .filter(result => result.similarity >= minSimilarity)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit)

    // CHANGE: Use typed response object with role-based context
    const response: SearchResponse = {
      query,
      minSimilarity,
      totalResults: filteredResults.length,
      totalScanned: rawResults.rows.length,
      userRole: role,
      results: filteredResults.map(row => ({
        content: row.content,
        similarity: parseFloat(row.similarity.toFixed(4)),
        relevanceScore: parseFloat(row.relevanceScore.toFixed(4)),
        chunkIndex: row.chunk_index,
        document: {
          id: row.document_id,
          fileName: row.file_name,
          createdAt: row.created_at
        },
        preview: row.content.substring(0, 200) + (row.content.length > 200 ? '...' : ''),
        // CHANGE: Add relevance indicators for debugging
        ...(includeMetadata && {
          metadata: {
            exactMatches: row.exactMatches,
            partialMatches: row.partialMatches,
            contextScore: parseFloat(row.contextScore.toFixed(4))
          }
        })
      }))
    }

    // CHANGE: Add search quality indicators
    if (filteredResults.length > 0) {
      response.searchQuality = {
        avgSimilarity: parseFloat((filteredResults.reduce((sum, r) => sum + r.similarity, 0) / filteredResults.length).toFixed(4)),
        avgRelevance: parseFloat((filteredResults.reduce((sum, r) => sum + r.relevanceScore, 0) / filteredResults.length).toFixed(4)),
        topSimilarity: Math.max(...filteredResults.map(r => r.similarity))
      }
    }

    res.json(response)
  } catch (err) {
    console.error("Search failed:", err)
    res.status(500).json({ error: "Search failed", details: err.message })
  }
})

// CHANGE: Add semantic search suggestions endpoint (Available to both admin and users)
router.post("/search/suggestions", async (req, res) => {
  const tenantId = req.headers["x-tenant-id"] as string
  const role = req.headers["x-role"] as string
  const { query } = req.body

  if (!tenantId || !query) {
    return res.status(400).json({ error: "Missing required parameters" })
  }

  // CHANGE: Allow both admin and user roles to get suggestions
  if (!["admin", "user"].includes(role)) {
    return res.status(403).json({ error: "Invalid user role for suggestions" })
  }

  try {
    // CHANGE: Get document topics and common terms for suggestions with tenant isolation
    const topicsResult = await db.query(
      `
      SELECT DISTINCT d.file_name, 
             string_agg(DISTINCT substring(dc.content, 1, 100), ' | ') as content_samples
      FROM documents d
      JOIN document_chunks dc ON d.id = dc.document_id
      WHERE d.tenant_id = $1 AND d.status = 'ready'
      GROUP BY d.file_name
      LIMIT 10
      `,
      [tenantId]
    )

    // CHANGE: Extract potential search terms from document content
    const suggestions = topicsResult.rows.map(row => ({
      document: row.file_name,
      suggestedTerms: extractKeyTerms(row.content_samples, query)
    })).filter(item => item.suggestedTerms.length > 0)

    res.json({
      query,
      userRole: role,
      suggestions: suggestions.slice(0, 5)
    })
  } catch (err) {
    console.error("Suggestions failed:", err)
    res.status(500).json({ error: "Failed to generate suggestions" })
  }
})

// CHANGE: Helper function to extract relevant terms
function extractKeyTerms(content: string, query: string): string[] {
  if (!content) return []
  
  const queryLower = query.toLowerCase()
  const words = content.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && word.length < 20)
  
  // CHANGE: Find words that might be related to the query
  const relatedTerms = words.filter(word => 
    word.includes(queryLower) || 
    queryLower.includes(word) ||
    levenshteinDistance(word, queryLower) <= 2
  )
  
  return [...new Set(relatedTerms)].slice(0, 5)
}

// CHANGE: Simple string similarity function
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = []
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  
  return matrix[str2.length][str1.length]
}

export default router