import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Spins up a real (in-memory) MongoDB per test suite via mongodb-memory-server,
 * so repository/resolver integration tests exercise the actual driver and
 * actual query behaviour instead of a hand-rolled fake. Call `start()` in
 * `beforeAll`, `stop()` in `afterAll`, and `db.collection(...).deleteMany({})`
 * (or reseed) between tests as needed.
 */
export class MemoryMongo {
  private server: MongoMemoryServer | null = null;
  private client: MongoClient | null = null;
  public db!: Db;

  async start(): Promise<Db> {
    this.server = await MongoMemoryServer.create();
    this.client = new MongoClient(this.server.getUri());
    await this.client.connect();
    this.db = this.client.db('test');
    return this.db;
  }

  async stop(): Promise<void> {
    await this.client?.close();
    await this.server?.stop();
  }

  async dropAllCollections(): Promise<void> {
    const collections = await this.db.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
  }
}
