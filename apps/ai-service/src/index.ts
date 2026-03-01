import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { errorHandler } from './middleware/errorHandler'
import { requestLogger } from './middleware/requestLogger'
import embeddingRoutes from './routes/embeddings'
import chatRoutes from './routes/chat'
import healthRoutes from './routes/health'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3003

// Middleware
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(requestLogger)

// Routes
app.use('/health', healthRoutes)
app.use('/embeddings', embeddingRoutes)
app.use('/chat', chatRoutes)

// Error handling
app.use(errorHandler)

// CHANGE: Fix 404 handler - use proper route pattern instead of '*'
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' })
})

app.listen(PORT, () => {
  console.log(`🧠 AI Service running on port ${PORT}`)
  console.log(`📊 Health check: http://localhost:${PORT}/health`)
})

export default app