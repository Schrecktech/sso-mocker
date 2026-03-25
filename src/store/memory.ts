interface StoredEntry {
  payload: Record<string, unknown>;
  expiresAt: number;
}

const storage = new Map<string, Map<string, StoredEntry>>();

export class MemoryAdapter {
  private name: string;

  constructor(name: string) {
    this.name = name;
    if (!storage.has(name)) {
      storage.set(name, new Map());
    }
  }

  private get store(): Map<string, StoredEntry> {
    return storage.get(this.name)!;
  }

  async upsert(id: string, payload: Record<string, unknown>, expiresIn: number): Promise<void> {
    this.store.set(id, {
      payload: { ...payload },
      expiresAt: Date.now() + expiresIn * 1000,
    });
  }

  async find(id: string): Promise<Record<string, unknown> | undefined> {
    const entry = this.store.get(id);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(id);
      return undefined;
    }
    return { ...entry.payload };
  }

  async destroy(id: string): Promise<void> {
    this.store.delete(id);
  }

  async findByUid(uid: string): Promise<Record<string, unknown> | undefined> {
    for (const [, entry] of this.store) {
      if (Date.now() > entry.expiresAt) continue;
      if (entry.payload.uid === uid) return { ...entry.payload };
    }
    return undefined;
  }

  async findByUserCode(userCode: string): Promise<Record<string, unknown> | undefined> {
    for (const [, entry] of this.store) {
      if (Date.now() > entry.expiresAt) continue;
      if (entry.payload.userCode === userCode) return { ...entry.payload };
    }
    return undefined;
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    for (const [id, entry] of this.store) {
      if (entry.payload.grantId === grantId) this.store.delete(id);
    }
  }

  async consume(id: string): Promise<void> {
    const entry = this.store.get(id);
    if (entry) {
      entry.payload.consumed = Math.floor(Date.now() / 1000);
    }
  }

  static flushAll(): void {
    for (const [, store] of storage) {
      store.clear();
    }
  }
}
