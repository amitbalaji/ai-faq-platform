-- =====================================
-- TENANT
-- =====================================

INSERT INTO tenants (id, name)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Demo Tenant'
)
ON CONFLICT DO NOTHING;



-- =====================================
-- USERS
-- password: password123
-- bcrypt hash
-- =====================================

INSERT INTO users (id, tenant_id, email, password_hash, role)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'admin@demo.com',
  '$2b$10$C6UzMDM.H6dfI/f/IKcEeO6Q0p8dQyN0yoyS9MhUlCT3VkOITkkpW',
  'admin'
)
ON CONFLICT DO NOTHING;



-- =====================================
-- API KEY
-- =====================================

INSERT INTO api_keys (tenant_id, public_key, secret_key)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'demo_public_key',
  'demo_secret_key'
)
ON CONFLICT DO NOTHING;



-- =====================================
-- DOCUMENT
-- =====================================

INSERT INTO documents (
  id,
  tenant_id,
  uploaded_by,
  file_name,
  storage_key,
  status
)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'sample_policy.pdf',
  'demo/sample_policy.pdf',
  'ready'
)
ON CONFLICT DO NOTHING;



-- =====================================
-- DOCUMENT CHUNK
-- =====================================

INSERT INTO document_chunks (
  document_id,
  tenant_id,
  chunk_index,
  content,
  embedding
)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  0,
  'Company policy requires employees to follow security best practices.',
  ARRAY[0.01,0.02,0.03]::vector
)
ON CONFLICT DO NOTHING;



-- =====================================
-- CHAT CONVERSATION
-- =====================================

INSERT INTO chat_conversations (
  conversation_id,
  tenant_id,
  user_id,
  title
)
VALUES (
  'demo-conversation',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'Demo Chat'
)
ON CONFLICT DO NOTHING;



-- =====================================
-- CHAT MESSAGES
-- =====================================

INSERT INTO chat_messages (
  conversation_id,
  tenant_id,
  user_id,
  role,
  content
)
VALUES
(
  'demo-conversation',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'user',
  'What is the company password policy?'
),
(
  'demo-conversation',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'assistant',
  'Employees must follow company security policies and must not share passwords.'
)
ON CONFLICT DO NOTHING;