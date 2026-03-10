import express from "express"
import cors from "cors"
import { Pool } from "pg"
import dotenv from "dotenv"
import path from "path"

dotenv.config({
  path: path.resolve(__dirname, "../.env")
})

const app = express()
app.use(cors())
app.use(express.json())

// CHANGE: Database connection for chat history and context retrieval
const db = new Pool({
  connectionString: process.env.DATABASE_URL
})

// CHANGE: Chat conversation interface
interface ChatMessage {
  id: string
  conversationId: string
  tenantId: string
  userId: string
  role: 'user' | 'assistant'
  content: string
  context?: DocumentChunk[]
  createdAt: Date
}

interface DocumentChunk {
  content: string
  similarity: number
  documentId: string
  fileName: string
  chunkIndex: number
}

// CHANGE: Generate embedding for user query with comprehensive error handling
async function generateEmbedding(text: string): Promise<number[]> {
  const aiServiceUrl = process.env.AI_SERVICE_URL || "http://localhost:3003"

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

    const response = await fetch(`${aiServiceUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`AI Service embedding failed: ${response.status} ${response.statusText}`)
    }

    // CHANGE: Validate response content type before parsing
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error(`Invalid response content type: ${contentType}`)
    }

    const responseText = await response.text()

    // CHANGE: Validate JSON before parsing to prevent "Unexpected end of JSON input"
    if (!responseText || responseText.trim() === '') {
      throw new Error('Empty response from AI service')
    }

    let data
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error('JSON parse error:', parseError)
      console.error('Response text:', responseText.substring(0, 200))
      throw new Error(`Invalid JSON response from AI service: ${parseError.message}`)
    }

    // CHANGE: Validate response structure
    if (!data || !Array.isArray(data.embedding)) {
      throw new Error('Invalid embedding response structure')
    }

    return data.embedding
  } catch (error) {
    console.error("Embedding generation failed:", error)
    // CHANGE: Return empty array as fallback to prevent service crash
    return []
  }
}

// CHANGE: Retrieve relevant document chunks for context
async function retrieveContext(query: string, tenantId: string, limit: number = 3): Promise<DocumentChunk[]> {
  try {
    // Generate embedding for the query
    const embedding = await generateEmbedding(query)

    if (embedding.length === 0) {
      console.warn("No embedding generated, skipping context retrieval")
      return []
    }

    const result = await db.query(
      `
      SELECT 
        dc.content,
        1 - (dc.embedding <=> $1::vector) AS similarity,
        dc.chunk_index,
        d.file_name,
        d.id as document_id
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE dc.tenant_id = $2 
        AND d.status = 'ready'
        AND (1 - (dc.embedding <=> $1::vector)) >= 0.6
      ORDER BY dc.embedding <=> $1::vector
      LIMIT $3
      `,
      [`[${embedding.join(",")}]`, tenantId, limit]
    )

    return result.rows.map(row => ({
      content: row.content,
      similarity: parseFloat(row.similarity.toFixed(4)),
      documentId: row.document_id,
      fileName: row.file_name,
      chunkIndex: row.chunk_index
    }))
  } catch (error) {
    console.error("Context retrieval failed:", error)
    return []
  }
}

// CHANGE: Generate AI response with context and comprehensive fallback handling
async function generateAIResponse(query: string, context: DocumentChunk[], conversationHistory: ChatMessage[]): Promise<string> {
  const aiServiceUrl = process.env.AI_SERVICE_URL || "http://localhost:3003"

  const contextText = context.map(chunk =>
    `From ${chunk.fileName}: ${chunk.content}`
  ).join('\n\n')

  const historyText = conversationHistory.slice(-4).map(msg =>
    `${msg.role}: ${msg.content}`
  ).join('\n')

  const prompt = `
Context from documents:
${contextText}

Recent conversation:
${historyText}

User question: ${query}

Please provide a helpful response based on the context and conversation history. If the context doesn't contain relevant information, say so clearly.
`

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout

    const response = await fetch(`${aiServiceUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: query
          }
        ],
        context: contextText,
        temperature: 0.7,
        maxTokens: 500
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`AI Service chat failed: ${response.status} ${response.statusText}`)
    }

    // CHANGE: Validate response content type before parsing
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      throw new Error(`Invalid response content type: ${contentType}`)
    }

    const responseText = await response.text()

    // CHANGE: Validate JSON before parsing to prevent "Unexpected end of JSON input"
    if (!responseText || responseText.trim() === '') {
      throw new Error('Empty response from AI service')
    }

    let data
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error('JSON parse error:', parseError)
      console.error('Response text:', responseText.substring(0, 200))
      throw new Error(`Invalid JSON response from AI service: ${parseError.message}`)
    }

    // CHANGE: Validate response structure and provide fallback
    // if (!data || typeof data.response !== 'string') {
    //   throw new Error('Invalid chat response structure')
    // }
    if (!data) {
      throw new Error("Empty AI response")
    }

    if (typeof data.response === "string") {
      return data.response
    }

    if (data.response?.content) {
      return data.response.content
    }

    console.error("Unexpected AI response:", data)

    throw new Error("Invalid chat response structure")

    // return data.response || "I apologize, but I received an empty response from the AI service."
  } catch (error) {
    console.error("AI response generation failed:", error)

    // CHANGE: Provide intelligent fallback response based on available context
    if (context.length > 0) {
      const contextSummary = context.map(chunk =>
        `From ${chunk.fileName}: ${chunk.content.substring(0, 200)}...`
      ).join('\n\n')

      return `I apologize, but the AI service is currently unavailable. However, I found some relevant information from your documents:\n\n${contextSummary}\n\nPlease try again later for a more detailed response.`
    } else {
      return `I apologize, but I'm currently unable to process your request. The AI service appears to be unavailable and I couldn't find relevant context in your documents. Please try again later.`
    }
  }
}

// CHANGE: Ensure conversation exists before saving messages
async function ensureConversationExists(conversationId: string, tenantId: string, userId: string): Promise<void> {
  try {
    // Check if conversation already exists
    const existingConv = await db.query(
      'SELECT id FROM chat_conversations WHERE conversation_id = $1 AND tenant_id = $2',
      [conversationId, tenantId]
    )

    if (existingConv.rows.length === 0) {
      // Create conversation record
      await db.query(
        `
        INSERT INTO chat_conversations (conversation_id, tenant_id, user_id, title)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (conversation_id) DO NOTHING
        `,
        [conversationId, tenantId, userId, 'New Conversation']
      )
    }
  } catch (error) {
    console.error("Failed to ensure conversation exists:", error)
    throw error
  }
}

// CHANGE: Save chat message to database with error handling
async function saveChatMessage(message: Omit<ChatMessage, 'id' | 'createdAt'>): Promise<string> {
  try {
    const result = await db.query(
      `
      INSERT INTO chat_messages (conversation_id, tenant_id, user_id, role, content, context)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
      `,
      [
        message.conversationId,
        message.tenantId,
        message.userId,
        message.role,
        message.content,
        JSON.stringify(message.context || [])
      ]
    )
    return result.rows[0].id
  } catch (error) {
    console.error("Failed to save chat message:", error)
    throw error
  }
}

// CHANGE: Get conversation history with error handling
async function getConversationHistory(conversationId: string, tenantId: string): Promise<ChatMessage[]> {
  try {
    const result = await db.query(
      `
      SELECT id, conversation_id, tenant_id, user_id, role, content, context, created_at
      FROM chat_messages
      WHERE conversation_id = $1 AND tenant_id = $2
      ORDER BY created_at ASC
      `,
      [conversationId, tenantId]
    )

    return result.rows.map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      role: row.role,
      content: row.content,
      context: safeParseJSON(row.context),
      createdAt: row.created_at
    }))
  } catch (error) {
    console.error("Failed to get conversation history:", error)
    return []
  }
}
function safeParseJSON(value: any) {
  if (!value) return []

  try {
    if (typeof value === "object") return value
    return JSON.parse(value)
  } catch {
    return []
  }
}

// CHANGE: Main chat endpoint with automatic context retrieval and comprehensive error handling
app.post("/chat", async (req, res) => {
  const tenantId = req.headers["x-tenant-id"] as string
  const userId = req.headers["x-user-id"] as string
  const role = req.headers["x-role"] as string
  const { query, conversationId } = req.body

  if (!tenantId || !userId) {
    return res.status(401).json({ error: "Missing identity headers" })
  }

  // CHANGE: Allow both admin and user roles to chat
  if (!["admin", "user"].includes(role)) {
    return res.status(403).json({ error: "Invalid user role for chat" })
  }

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: "Query text is required" })
  }

  const finalConversationId = conversationId || `conv_${Date.now()}_${userId}`

  try {
    // CHANGE: Ensure conversation exists before saving messages
    await ensureConversationExists(finalConversationId, tenantId, userId)

    // CHANGE: Retrieve conversation history
    const conversationHistory = await getConversationHistory(finalConversationId, tenantId)

    // CHANGE: Automatically retrieve relevant context from documents
    const context = await retrieveContext(query, tenantId)

    // CHANGE: Save user message
    await saveChatMessage({
      conversationId: finalConversationId,
      tenantId,
      userId,
      role: 'user',
      content: query,
      context
    })

    // CHANGE: Generate AI response with context
    const aiResponse = await generateAIResponse(query, context, conversationHistory)

    // CHANGE: Save AI response
    await saveChatMessage({
      conversationId: finalConversationId,
      tenantId,
      userId,
      role: 'assistant',
      content: aiResponse
    })

    // CHANGE: Return comprehensive chat response with service status indicators
    res.json({
      conversationId: finalConversationId,
      query,
      response: aiResponse,
      context: context.map(chunk => ({
        fileName: chunk.fileName,
        similarity: chunk.similarity,
        preview: chunk.content.substring(0, 150) + (chunk.content.length > 150 ? '...' : '')
      })),
      metadata: {
        contextChunks: context.length,
        userRole: role,
        timestamp: new Date().toISOString(),
        // CHANGE: Add service status indicators
        aiServiceAvailable: !aiResponse.includes("AI service is currently unavailable"),
        fallbackUsed: aiResponse.includes("AI service is currently unavailable")
      }
    })
  } catch (error) {
    console.error("Chat failed:", error)
    res.status(500).json({ error: "Chat failed", details: error.message })
  }
})

// CHANGE: Get conversation history endpoint
app.get("/conversations/:conversationId", async (req, res) => {
  const tenantId = req.headers["x-tenant-id"] as string
  const userId = req.headers["x-user-id"] as string
  const { conversationId } = req.params

  if (!tenantId || !userId) {
    return res.status(401).json({ error: "Missing identity headers" })
  }

  try {
    const history = await getConversationHistory(conversationId, tenantId)

    res.json({
      conversationId,
      messages: history.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.createdAt,
        contextUsed: msg.context?.length || 0
      }))
    })
  } catch (error) {
    console.error("Get conversation failed:", error)
    res.status(500).json({ error: "Failed to retrieve conversation" })
  }
})

// CHANGE: List user conversations
app.get("/conversations", async (req, res) => {
  const tenantId = req.headers["x-tenant-id"] as string
  const userId = req.headers["x-user-id"] as string

  if (!tenantId || !userId) {
    return res.status(401).json({ error: "Missing identity headers" })
  }

  try {
    const result = await db.query(
      `
      SELECT DISTINCT conversation_id, MAX(created_at) as last_message
      FROM chat_messages
      WHERE tenant_id = $1 AND user_id = $2
      GROUP BY conversation_id
      ORDER BY last_message DESC
      LIMIT 20
      `,
      [tenantId, userId]
    )

    res.json({
      conversations: result.rows.map(row => ({
        conversationId: row.conversation_id,
        lastMessage: row.last_message
      }))
    })
  } catch (error) {
    console.error("List conversations failed:", error)
    res.status(500).json({ error: "Failed to list conversations" })
  }
})

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "chat-service" })
})

const PORT = process.env.PORT || 3002
app.listen(PORT, () => {
  console.log(`🚀 Chat Service running on port ${PORT}`)
})