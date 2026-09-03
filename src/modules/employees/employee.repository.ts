import { injectable, inject } from 'inversify';
import { Collection, Db, ObjectId } from 'mongodb';
import { TYPES } from '../../container/types';
import { isValidObjectId } from '../../shared/object-id';
import type { Employee, NewEmployee } from './employee.types';

export interface EmployeeDocument {
  _id: ObjectId;
  name: string;
  code: string;
}

export interface EmployeeRepository {
  findById(id: string): Promise<Employee | null>;
  findByCode(code: string): Promise<Employee | null>;
  findAll(): Promise<Employee[]>;
  insertMany(employees: NewEmployee[]): Promise<Employee[]>;
  deleteAll(): Promise<void>;
}

function toDomain(doc: EmployeeDocument): Employee {
  return { id: doc._id.toHexString(), name: doc.name, code: doc.code };
}

@injectable()
export class MongoEmployeeRepository implements EmployeeRepository {
  private readonly collection: Collection<EmployeeDocument>;

  constructor(@inject(TYPES.Db) db: Db) {
    this.collection = db.collection<EmployeeDocument>('employees');
  }

  async findById(id: string): Promise<Employee | null> {
    if (!isValidObjectId(id)) return null;
    const doc = await this.collection.findOne({ _id: new ObjectId(id) });
    return doc ? toDomain(doc) : null;
  }

  async findByCode(code: string): Promise<Employee | null> {
    const doc = await this.collection.findOne({ code });
    return doc ? toDomain(doc) : null;
  }

  async findAll(): Promise<Employee[]> {
    const docs = await this.collection.find().sort({ code: 1 }).toArray();
    return docs.map(toDomain);
  }

  async insertMany(employees: NewEmployee[]): Promise<Employee[]> {
    if (employees.length === 0) return [];
    const docs: EmployeeDocument[] = employees.map((e) => ({ _id: new ObjectId(), ...e }));
    await this.collection.insertMany(docs);
    return docs.map(toDomain);
  }

  async deleteAll(): Promise<void> {
    await this.collection.deleteMany({});
  }
}
