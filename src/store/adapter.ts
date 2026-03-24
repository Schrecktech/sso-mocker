export interface StorageAdapter {
  upsert(id: string, payload: Record<string, unknown>, expiresIn: number): Promise<void>;
  find(id: string): Promise<Record<string, unknown> | undefined>;
  destroy(id: string): Promise<void>;
  consume(id: string): Promise<void>;
}
