import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import documentsRouter from "./routes/documents"
import { connectProducer } from "./kafka/producer"

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

// Health
app.get("/health", (_, res) => {
  res.json({ status: "ok", service: "document-service" })
})

// Documents API
app.use("/documents", documentsRouter)

app.listen(4004, async () => {
    console.log("Document Service running on http://localhost:4004")
  
    try {
      await connectProducer()
    } catch (err) {
      console.error("Kafka not available, continuing without it")
    }
  })
  
