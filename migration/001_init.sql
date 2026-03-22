-- =============================================
-- EXTENSIONS
-- =============================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;



-- =============================================
-- TENANTS
-- =============================================

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);



-- =============================================
-- USERS
-- =============================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at TIMESTAMP DEFAULT NOW()
);



-- =============================================
-- API KEYS
-- =============================================

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    public_key TEXT UNIQUE NOT NULL,
    secret_key TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);



-- =============================================
-- DOCUMENTS
-- =============================================

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    uploaded_by UUID NOT NULL REFERENCES users(id),
    file_name TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    status TEXT DEFAULT 'uploaded' NOT NULL,
    failure_reason TEXT,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);



-- =============================================
-- DOCUMENT CHUNKS (RAG)
-- =============================================

CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id),
    tenant_id UUID NOT NULL,
    chunk_index INT,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    embedding VECTOR(768)
);

ALTER TABLE document_chunks
ADD CONSTRAINT unique_document_chunk
UNIQUE (document_id, chunk_index);



-- =============================================
-- CHAT CONVERSATIONS
-- =============================================

CREATE TABLE chat_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id VARCHAR(255) UNIQUE NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    title VARCHAR(500),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);



-- =============================================
-- CHAT MESSAGES
-- =============================================

CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id VARCHAR(255) REFERENCES chat_conversations(conversation_id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user','assistant')),
    content TEXT NOT NULL,
    context JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);



-- =============================================
-- REFRESH TOKENS
-- =============================================

CREATE TABLE refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(512) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);



-- =============================================
-- INDEXES
-- =============================================

CREATE INDEX idx_chat_conversations_tenant_user
ON chat_conversations (tenant_id, user_id, updated_at DESC);

CREATE INDEX idx_chat_messages_conversation
ON chat_messages (conversation_id, created_at);

CREATE INDEX idx_chat_messages_tenant_user
ON chat_messages (tenant_id, user_id, created_at DESC);

CREATE INDEX idx_refresh_tokens_user
ON refresh_tokens (user_id);

CREATE INDEX idx_refresh_tokens_hash
ON refresh_tokens (token_hash);



-- =============================================
-- VECTOR SEARCH INDEX (IMPORTANT)
-- =============================================

CREATE INDEX idx_document_chunks_embedding
ON document_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);



-- =============================================
-- FUNCTIONS
-- =============================================

CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE chat_conversations
  SET updated_at = NOW()
  WHERE conversation_id = NEW.conversation_id;
  RETURN NEW;
END;
$$;



-- =============================================
-- TRIGGERS
-- =============================================

CREATE TRIGGER trigger_update_conversation_timestamp
AFTER INSERT ON chat_messages
FOR EACH ROW
EXECUTE FUNCTION update_conversation_timestamp();



-- =============================================
-- CLEANUP FUNCTION
-- =============================================

CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM refresh_tokens
  WHERE expires_at < NOW()
  OR is_active = FALSE;
END;
$$;