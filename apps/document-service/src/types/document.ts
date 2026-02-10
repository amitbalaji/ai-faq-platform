export type DocumentStatus =
  | "uploaded"
  | "processing"
  | "ready"
  | "failed"

export interface Document {
  id: string
  tenantId: string
  uploadedBy: string
  fileName: string
  storageKey: string
  status: DocumentStatus
  failureReason?: string
  createdAt: string
}
