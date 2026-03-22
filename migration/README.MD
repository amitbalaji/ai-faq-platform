# Run Migration

# Create database:

docker exec -it ai-faq-db createdb -U postgres ai_faq_platform

# Run migration:

docker exec -i ai-faq-db psql -U postgres -d ai_faq_platform < migrations/001_init.sql

# Seed data:

docker exec -i ai-faq-db psql -U postgres -d ai_faq_platform < database/seed.sql
# 🚀 Result

# Your full stack can now be recreated by anyone with:

docker-compose up
run migration
run seed

# Everything works:

Auth
Chat
Documents
Ingestion
RAG search
Kafka events



# Adds hybrid search support (vector + keyword).
psql -f migrations/002_hybrid_search.sql
# Adds performance indexes needed for RAG scale.
psql -f migrations/003_add_index.sql