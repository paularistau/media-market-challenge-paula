import { ObjectId } from 'mongodb';
import { MemoryMongo } from '../../../../test/helpers/memory-mongo';
import { MongoOrderRepository } from '../order.repository';
import type { NewOrder } from '../order.types';

function newOrder(overrides: Partial<NewOrder> = {}): NewOrder {
  const now = new Date('2026-09-01T10:00:00.000Z');
  return {
    ref: 'ORD-1000',
    type: 'PICKUP',
    state: 'OPEN',
    assigneeId: null,
    customer: { name: 'Ana Ferreira', phone: '+34 600 000 000' },
    destination: { kind: 'PICKUP_LOCKER', lockerCode: 'A-1', floor: 'Ground floor' },
    lineItems: [{ sku: 'SKU-1', name: 'Widget', quantity: 1, location: 'A1-01', status: 'PENDING' }],
    history: [{ state: 'OPEN', at: now, by: 'system' }],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('MongoOrderRepository', () => {
  const mem = new MemoryMongo();
  let repository: MongoOrderRepository;

  beforeAll(async () => {
    const db = await mem.start();
    repository = new MongoOrderRepository(db);
  }, 60_000);

  afterAll(async () => {
    await mem.stop();
  });

  afterEach(async () => {
    await mem.dropAllCollections();
  });

  it('inserts orders and finds one by id', async () => {
    const [inserted] = await repository.insertMany([newOrder()]);
    const found = await repository.findById(inserted!.id);
    expect(found).toEqual(inserted);
  });

  it('finds an order by ref', async () => {
    await repository.insertMany([newOrder({ ref: 'ORD-4821' })]);
    await expect(repository.findByRef('ORD-4821')).resolves.toMatchObject({ ref: 'ORD-4821' });
    await expect(repository.findByRef('ORD-0000')).resolves.toBeNull();
  });

  it('returns null (not a thrown error) for a malformed id', async () => {
    await expect(repository.findById('nope')).resolves.toBeNull();
  });

  it('filters by state', async () => {
    await repository.insertMany([
      newOrder({ ref: 'ORD-1', state: 'OPEN' }),
      newOrder({ ref: 'ORD-2', state: 'IN_PROGRESS', assigneeId: new ObjectId().toHexString() }),
      newOrder({ ref: 'ORD-3', state: 'COMPLETE', assigneeId: new ObjectId().toHexString() }),
    ]);

    const open = await repository.find({ states: ['OPEN'] });
    expect(open.map((o) => o.ref)).toEqual(['ORD-1']);

    const openOrComplete = await repository.find({ states: ['OPEN', 'COMPLETE'] });
    expect(openOrComplete.map((o) => o.ref).sort()).toEqual(['ORD-1', 'ORD-3']);
  });

  it('filters by assigneeId, and returns nothing for a malformed one', async () => {
    const assigneeId = new ObjectId().toHexString();
    await repository.insertMany([
      newOrder({ ref: 'ORD-1', state: 'IN_PROGRESS', assigneeId }),
      newOrder({ ref: 'ORD-2', state: 'OPEN', assigneeId: null }),
    ]);

    await expect(repository.find({ assigneeId })).resolves.toMatchObject([{ ref: 'ORD-1' }]);
    await expect(repository.find({ assigneeId: 'not-an-id' })).resolves.toEqual([]);
  });

  it('returns orders newest-created first when unfiltered', async () => {
    const now = Date.now();
    await repository.insertMany([
      newOrder({ ref: 'ORD-OLD', createdAt: new Date(now - 60_000) }),
      newOrder({ ref: 'ORD-NEW', createdAt: new Date(now) }),
    ]);

    const all = await repository.find({});
    expect(all.map((o) => o.ref)).toEqual(['ORD-NEW', 'ORD-OLD']);
  });

  it('replace persists the full updated document and returns it', async () => {
    const [inserted] = await repository.insertMany([newOrder()]);
    const updated = await repository.replace({
      ...inserted!,
      state: 'IN_PROGRESS',
      assigneeId: new ObjectId().toHexString(),
    });

    expect(updated.state).toBe('IN_PROGRESS');
    const reloaded = await repository.findById(inserted!.id);
    expect(reloaded?.state).toBe('IN_PROGRESS');
    expect(reloaded?.assigneeId).toBe(updated.assigneeId);
  });

  it('replace throws if the order no longer exists', async () => {
    const [inserted] = await repository.insertMany([newOrder()]);
    await repository.deleteAll();

    await expect(repository.replace(inserted!)).rejects.toThrow();
  });

  it('insertMany with an empty array is a no-op', async () => {
    await expect(repository.insertMany([])).resolves.toEqual([]);
  });
});
