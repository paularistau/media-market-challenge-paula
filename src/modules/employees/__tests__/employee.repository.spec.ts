import { ObjectId } from 'mongodb';
import { MemoryMongo } from '../../../../test/helpers/memory-mongo';
import { MongoEmployeeRepository } from '../employee.repository';

describe('MongoEmployeeRepository', () => {
  const mem = new MemoryMongo();
  let repository: MongoEmployeeRepository;

  beforeAll(async () => {
    const db = await mem.start();
    repository = new MongoEmployeeRepository(db);
  }, 60_000);

  afterAll(async () => {
    await mem.stop();
  });

  afterEach(async () => {
    await mem.dropAllCollections();
  });

  it('inserts and lists employees sorted by code', async () => {
    await repository.insertMany([
      { name: 'R. Matos', code: 'EMP-0301' },
      { name: 'N. Bakker', code: 'EMP-0714' },
    ]);

    const all = await repository.findAll();
    expect(all.map((e) => e.code)).toEqual(['EMP-0301', 'EMP-0714']);
    expect(all[0]?.id).toEqual(expect.any(String));
  });

  it('finds an employee by id', async () => {
    const [inserted] = await repository.insertMany([{ name: 'N. Bakker', code: 'EMP-0714' }]);
    const found = await repository.findById(inserted!.id);
    expect(found).toEqual(inserted);
  });

  it('returns null for a well-formed but unknown id', async () => {
    const found = await repository.findById(new ObjectId().toHexString());
    expect(found).toBeNull();
  });

  it('returns null (not a thrown error) for a malformed id', async () => {
    await expect(repository.findById('not-an-object-id')).resolves.toBeNull();
  });

  it('finds an employee by code, or null if none matches', async () => {
    await repository.insertMany([{ name: 'N. Bakker', code: 'EMP-0714' }]);
    await expect(repository.findByCode('EMP-0714')).resolves.toMatchObject({ name: 'N. Bakker' });
    await expect(repository.findByCode('EMP-9999')).resolves.toBeNull();
  });

  it('insertMany with an empty array is a no-op', async () => {
    await expect(repository.insertMany([])).resolves.toEqual([]);
  });
});
