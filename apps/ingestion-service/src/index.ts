import dotenv from "dotenv"
import { Kafka } from "kafkajs"
import { Pool } from "pg"
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"
import pdfParse from "pdf-parse"

dotenv.config()

// 🔹 Database
const db = new Pool({
  connectionString: process.env.DATABASE_URL
})

// 🔹 Kafka
const kafka = new Kafka({
  clientId: "ingestion-service",
  brokers: ["localhost:9092"]
})

const consumer = kafka.consumer({ groupId: "document-ingestion-group" })
const producer = kafka.producer()

// 🔹 S3
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  }
})

// 🔹 Helper: Convert stream to buffer
async function streamToBuffer(stream: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on("data", (chunk: Buffer) => chunks.push(chunk))
    stream.on("error", reject)
    stream.on("end", () => resolve(Buffer.concat(chunks)))
  })
}

async function start() {
  await consumer.connect()
  await producer.connect()

  await consumer.subscribe({
    topic: "document.uploaded",
    fromBeginning: false
  })

  console.log("🚀 Ingestion Service started...")

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return

      const payload = JSON.parse(message.value.toString())
      const { documentId, storageKey } = payload

      console.log("📥 Received event:", payload)

      const maxRetries = 3
      let attempt = 0

      try {
        // 🔹 Set status to processing once
        await db.query(
          `UPDATE documents SET status = 'processing' WHERE id = $1`,
          [documentId]
        )
      } catch (err) {
        console.error("❌ Failed to mark document as processing:", err)
        return
      }

      while (attempt < maxRetries) {
        try {
          console.log(`🔄 Processing ${documentId}, attempt ${attempt + 1}`)

          // 🔽 Download file from S3
          const command = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET!,
            Key: storageKey
          })

          const response = await s3.send(command)

          if (!response.Body) {
            throw new Error("S3 returned empty body")
          }

          const fileBuffer = await streamToBuffer(response.Body)

          // 🔽 Extract PDF text
          const pdfData = await pdfParse(fileBuffer)

          console.log(
            `📄 Extracted text length: ${pdfData.text.length}`
          )

          // TODO: Chunk + embeddings here later

          // 🔹 Mark as ready
          await db.query(
            `UPDATE documents SET status = 'ready' WHERE id = $1`,
            [documentId]
          )

          console.log("✅ Document processed successfully:", documentId)
          return

        } catch (err) {
          attempt++
          console.error(
            `⚠️ Attempt ${attempt} failed for ${documentId}:`,
            err
          )

          if (attempt < maxRetries) {
            const backoff = Math.pow(2, attempt) * 1000
            console.log(`⏳ Retrying in ${backoff}ms...`)
            await new Promise(res => setTimeout(res, backoff))
          }
        }
      }

      // 🚨 All retries exhausted → Send to DLQ
      console.error(
        `🚨 Max retries exceeded for ${documentId}. Sending to DLQ.`
      )
      console.error("📦 DLQ Payload:", payload)

      try {
        await producer.send({
          topic: "document.uploaded.dlq",
          messages: [
            { value: JSON.stringify(payload) }
          ]
        })

        await db.query(
          `UPDATE documents SET status = 'failed' WHERE id = $1`,
          [documentId]
        )

        console.log("🛑 Document marked as failed:", documentId)
      } catch (dlqError) {
        console.error("❌ Failed to send to DLQ:", dlqError)
      }
    }
  })
}

start().catch(err => {
  console.error("💥 Ingestion service crashed:", err)
})
