import dotenv from "dotenv"
import { Kafka, Partitioners } from "kafkajs"
import { Pool } from "pg"
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand
} from "@aws-sdk/client-s3"
import pdfParse from "pdf-parse"
import { chunkText } from "./chunker"
import path from "path"

dotenv.config({
  path: path.resolve(__dirname, "../.env")
})

/* ---------------- ENV VALIDATION ---------------- */

const requiredEnvVars = [
  "DATABASE_URL",
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_BUCKET"
]

for (const key of requiredEnvVars) {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`)
    process.exit(1)
  }
}

/* ---------------- DATABASE ---------------- */

const db = new Pool({
  connectionString: process.env.DATABASE_URL
})

/* ---------------- KAFKA ---------------- */

const kafka = new Kafka({
  clientId: "ingestion-service",
  brokers: ["localhost:9092"]
})

const consumer = kafka.consumer({
  groupId: "document-ingestion-group"
})

const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner
})

/* ---------------- S3 ---------------- */

const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  }
})

/* ---------------- AI SERVICE CLIENT ---------------- */

// CHANGE: Enhanced embedding generation with retry logic for better reliability
async function generateEmbedding(text: string, retries: number = 2): Promise<number[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${process.env.AI_SERVICE_URL}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal
      })

      if (!response.ok) {
        throw new Error(`AI Service embedding failed: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      return data.embedding
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('AI Service request timeout')
      }
      
      // CHANGE: Retry on network errors but not on validation errors
      if (attempt < retries && !error.message.includes('400')) {
        console.warn(`Embedding attempt ${attempt + 1} failed, retrying...`, error.message)
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
        continue
      }
      
      throw new Error(`AI Service error: ${error.message}`)
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

/* ---------------- TEXT SANITIZATION ---------------- */

// CHANGE: Add text sanitization to handle problematic characters
function sanitizeText(text: string): string {
  if (!text || typeof text !== 'string') {
    return ''
  }

  return text
    // CHANGE: Remove null bytes that cause PostgreSQL UTF-8 errors
    .replace(/\x00/g, '')
    // CHANGE: Remove other control characters except newlines, tabs, and carriage returns
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // CHANGE: Normalize whitespace
    .replace(/\s+/g, ' ')
    // CHANGE: Trim leading/trailing whitespace
    .trim()
}

// CHANGE: Validate text content quality
function isValidTextContent(text: string): boolean {
  if (!text || text.length < 10) {
    return false
  }

  // CHANGE: Check if text has reasonable character distribution (not mostly binary)
  const printableChars = text.replace(/[^\x20-\x7E\s]/g, '').length
  const printableRatio = printableChars / text.length

  return printableRatio > 0.7 // At least 70% printable characters
}

/* ---------------- HELPERS ---------------- */

function isRetryableError(error: any): boolean {
  const nonRetryableCodes = [
    "NoSuchKey",
    "NoSuchBucket",
    "AccessDenied",
    "InvalidRequest"
  ]

  if (error?.Code && nonRetryableCodes.includes(error.Code)) {
    return false
  }

  if (error?.$metadata?.httpStatusCode) {
    const status = error.$metadata.httpStatusCode
    if (status >= 400 && status < 500 && status !== 429) {
      return false
    }
  }

  // CHANGE: PostgreSQL encoding errors are non-retryable without text sanitization
  if (error.message?.includes('invalid byte sequence') || 
      error.message?.includes('UTF8') ||
      error.message?.includes('encoding')) {
    return false
  }

  // CHANGE: AI Service errors are retryable unless they're validation errors
  if (error.message?.includes('AI Service')) {
    return !error.message.includes('400')
  }

  return true
}

async function verifyFileExists(storageKey: string) {
  const head = new HeadObjectCommand({
    Bucket: process.env.AWS_BUCKET!,
    Key: storageKey
  })

  await s3.send(head)
}

async function streamToBuffer(stream: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on("data", (chunk: Buffer) => chunks.push(chunk))
    stream.on("error", reject)
    stream.on("end", () => resolve(Buffer.concat(chunks)))
  })
}

async function sendToDLQ(payload: any, error: any, attempts: number) {
  const enriched = {
    ...payload,
    error: {
      message: error?.message,
      code: error?.Code || "UNKNOWN",
      statusCode: error?.$metadata?.httpStatusCode,
      attempts,
      retryable: isRetryableError(error),
      timestamp: new Date().toISOString()
    }
  }

  console.error("📦 Sending to DLQ:", enriched)

  await producer.send({
    topic: "document.uploaded.dlq",
    messages: [{ value: JSON.stringify(enriched) }]
  })

  await db.query(
    `UPDATE documents 
     SET status = 'failed', error_message = $2 
     WHERE id = $1`,
    [payload.documentId, error?.message || "Unknown error"]
  )
}

/* ---------------- MAIN ---------------- */

async function start() {
  await consumer.connect()
  await producer.connect()

  await consumer.subscribe({
    topic: "document.uploaded",
    fromBeginning: false
  })

  console.log("🚀 Ingestion Service started")

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return

      const payload = JSON.parse(message.value.toString())
      const { documentId, storageKey, tenantId } = payload

      console.log("📥 Event received:", documentId)

      const maxRetries = 3
      let attempt = 0
      let lastError: any = null

      /* ---- Row Locking (Prevents duplicate processing) ---- */

      const lockResult = await db.query(
        `UPDATE documents
         SET status = 'processing'
         WHERE id = $1 AND status = 'uploaded'
         RETURNING id`,
        [documentId]
      )

      if (lockResult.rowCount === 0) {
        console.log("⚠️ Document already processing or completed. Skipping.")
        return
      }

      /* ---- Verify file exists ---- */

      try {
        await verifyFileExists(storageKey)
        console.log("✅ File exists in S3")
      } catch (err) {
        console.error("❌ File missing in S3")
        await sendToDLQ(payload, err, 0)
        return
      }

      /* ---- Retry Loop ---- */

      while (attempt < maxRetries) {
        try {
          attempt++
          console.log(`🔄 Attempt ${attempt} for ${documentId}`)

          const command = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET!,
            Key: storageKey
          })

          const response = await s3.send(command)
          if (!response.Body) throw new Error("Empty S3 body")

          const buffer = await streamToBuffer(response.Body)
          
          // CHANGE: Enhanced PDF parsing with better error handling
          let pdfData: any
          try {
            pdfData = await pdfParse(buffer)
          } catch (pdfError) {
            throw new Error(`PDF parsing failed: ${pdfError.message}`)
          }

          // CHANGE: Sanitize extracted text to remove problematic characters
          const sanitizedText = sanitizeText(pdfData.text)
          
          // CHANGE: Validate text content quality
          if (!isValidTextContent(sanitizedText)) {
            throw new Error(`PDF contains insufficient readable text. Extracted: ${sanitizedText.length} chars`)
          }

          console.log(`📄 Extracted ${sanitizedText.length} characters of clean text`)

          // CHANGE: Use sanitized text for chunking
          const chunks = chunkText(sanitizedText, 1000, 200)
          console.log(`🧩 ${chunks.length} chunks created`)

          // CHANGE: Filter out empty or very short chunks after sanitization
          const validChunks = chunks.filter(chunk => {
            const cleanChunk = sanitizeText(chunk)
            return cleanChunk.length >= 50 && isValidTextContent(cleanChunk)
          })

          if (validChunks.length === 0) {
            throw new Error("No valid text chunks found after sanitization")
          }

          console.log(`✅ ${validChunks.length} valid chunks after filtering`)

          /* ---- Transaction Safety ---- */

          await db.query("BEGIN")

          for (let i = 0; i < validChunks.length; i++) {
            // CHANGE: Double-sanitize chunk content before database insertion
            const finalChunk = sanitizeText(validChunks[i])
            
            if (!finalChunk || finalChunk.length < 10) {
              console.warn(`⚠️ Skipping invalid chunk ${i}`)
              continue
            }

            // CHANGE: Enhanced embedding generation with retry logic
            const embedding = await generateEmbedding(finalChunk)
            await db.query(
              `
              INSERT INTO document_chunks
              (document_id, tenant_id, chunk_index, content, embedding)
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (document_id, chunk_index)
              DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding
              `,
              [documentId, tenantId, i, finalChunk, JSON.stringify(embedding)]
            )
          }

          await db.query(
            `UPDATE documents SET status = 'ready' WHERE id = $1`,
            [documentId]
          )

          await db.query("COMMIT")

          console.log("✅ Document processed successfully")
          return
        } catch (err) {
          await db.query("ROLLBACK")
          lastError = err

          console.error(`⚠️ Attempt ${attempt} failed`, err)

          if (!isRetryableError(err)) {
            console.error("❌ Non-retryable error")
            await sendToDLQ(payload, err, attempt)
            return
          }

          if (attempt < maxRetries) {
            const jitter = Math.random() * 500
            const backoff = Math.pow(2, attempt) * 1000 + jitter
            console.log(`⏳ Retrying in ${backoff}ms`)
            await new Promise(r => setTimeout(r, backoff))
          }
        }
      }

      console.error("🚨 Max retries exceeded")
      await sendToDLQ(payload, lastError, maxRetries)
    }
  })
}

start().catch(err => {
  console.error("💥 Ingestion crashed:", err)
  process.exit(1)
})