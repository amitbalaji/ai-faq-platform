apps/ai-service/
├── src/
│   ├── index.ts                    # Main application entry point
│   ├── routes/                     # API route handlers
│   │   ├── embeddings.ts          # Embedding generation endpoints
│   │   ├── chat.ts                # Chat completion endpoints
│   │   └── health.ts              # Health check endpoints
│   ├── services/                   # Business logic layer
│   │   ├── embeddingService.ts    # Embedding generation logic
│   │   ├── chatService.ts         # Chat completion logic
│   │   └── healthService.ts       # Health monitoring logic
│   ├── clients/                    # External service clients
│   │   └── ollamaClient.ts        # Ollama API client
│   ├── middleware/                 # Express middleware
│   │   ├── errorHandler.ts        # Global error handling
│   │   ├── requestLogger.ts       # Request logging
│   │   └── validation.ts          # Input validation
│   ├── utils/                      # Utility functions
│   │   └── errors.ts              # Custom error classes
│   └── types/                      # TypeScript type definitions
│       ├── embedding.ts           # Embedding-related types
│       └── chat.ts                # Chat-related types
├── dist/                          # Compiled JavaScript output
├── tests/                         # Test files
│   ├── unit/                      # Unit tests
│   ├── integration/               # Integration tests
│   └── fixtures/                  # Test data
├── .env.example                   # Environment variables template
├── package.json                   # Dependencies and scripts
├── tsconfig.json                  # TypeScript configuration
├── jest.config.js                 # Test configuration
├── .eslintrc.js                   # Linting rules
├── .gitignore                     # Git ignore patterns
└── README.md                      # Service documentation