-- =========================================
-- HYBRID SEARCH SUPPORT
-- =========================================

-- 1. Add tsvector column for keyword search
ALTER TABLE document_chunks
ADD COLUMN IF NOT EXISTS content_tsv tsvector;

-- 2. Populate existing rows
UPDATE document_chunks
SET content_tsv = to_tsvector('english', content)
WHERE content_tsv IS NULL;

-- 3. Create GIN index for keyword search
CREATE INDEX IF NOT EXISTS idx_document_chunks_tsv
ON document_chunks
USING GIN(content_tsv);

-- 4. Trigger to keep tsvector updated
CREATE OR REPLACE FUNCTION update_document_chunks_tsv()
RETURNS trigger AS $$
BEGIN
  NEW.content_tsv := to_tsvector('english', NEW.content);
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_document_chunks_tsv
ON document_chunks;

CREATE TRIGGER trigger_update_document_chunks_tsv
BEFORE INSERT OR UPDATE
ON document_chunks
FOR EACH ROW
EXECUTE FUNCTION update_document_chunks_tsv();