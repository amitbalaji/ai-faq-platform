# How to Run Seed
docker exec -i ai-faq-db psql -U postgres -d ai_faq_platform < database/seed.sql
# Verify Data
docker exec -it ai-faq-db psql -U postgres -d ai_faq_platform
SELECT * FROM tenants;
SELECT * FROM users;
SELECT * FROM documents;
SELECT * FROM chat_conversations;
SELECT * FROM chat_messages;

# Recommended Next Step

To make your system production ready, I recommend adding 2 indexes for vector search:

CREATE INDEX idx_document_chunks_embedding
ON document_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);