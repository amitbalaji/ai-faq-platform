-- =========================================
-- PERFORMANCE INDEXES
-- =========================================

-- Vector search index (HNSW)
DROP INDEX IF EXISTS idx_document_chunks_embedding;

CREATE INDEX idx_document_chunks_embedding
ON document_chunks
USING hnsw (embedding vector_cosine_ops);

-- Tenant filtering
CREATE INDEX IF NOT EXISTS idx_document_chunks_tenant
ON document_chunks (tenant_id);

-- Document filtering
CREATE INDEX IF NOT EXISTS idx_document_chunks_document
ON document_chunks (document_id);

-- Chat message retrieval
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created
ON chat_messages (conversation_id, created_at);

-- Conversations
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user
ON chat_conversations (tenant_id, user_id);