import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

export class MemoryMongo {
  private server: MongoMemoryServer | null = null;
  private client: MongoClient | null = null;
  public db!: Db;

  async start(): Promise<Db> {
    this.server = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
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
