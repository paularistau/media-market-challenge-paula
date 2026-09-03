import { injectable, inject } from 'inversify';
import { Collection, Db, Filter, ObjectId } from 'mongodb';
import { TYPES } from '../../container/types';
import { isValidObjectId } from '../../shared/object-id';
import type {
  Customer,
  Destination,
  HistoryEntry,
  LineItem,
  NewOrder,
  Order,
  OrderFilter,
  OrderState,
  OrderType,
} from './order.types';

export interface OrderDocument {
  _id: ObjectId;
  ref: string;
  type: OrderType;
  state: OrderState;
  assigneeId: ObjectId | null;
  customer: Customer;
  destination: Destination;
  lineItems: LineItem[];
  history: HistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderRepository {
  findById(id: string): Promise<Order | null>;
  findByRef(ref: string): Promise<Order | null>;
  find(filter: OrderFilter): Promise<Order[]>;
  insertMany(orders: NewOrder[]): Promise<Order[]>;
  /** Persists the full state of an already-existing order (keyed by id). */
  replace(order: Order): Promise<Order>;
  deleteAll(): Promise<void>;
}

function toDomain(doc: OrderDocument): Order {
  return {
    id: doc._id.toHexString(),
    ref: doc.ref,
    type: doc.type,
    state: doc.state,
    assigneeId: doc.assigneeId ? doc.assigneeId.toHexString() : null,
    customer: doc.customer,
    destination: doc.destination,
    lineItems: doc.lineItems,
    history: doc.history,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toDocument(order: NewOrder, id?: ObjectId): OrderDocument {
  return {
    _id: id ?? new ObjectId(),
    ref: order.ref,
    type: order.type,
    state: order.state,
    assigneeId: order.assigneeId ? new ObjectId(order.assigneeId) : null,
    customer: order.customer,
    destination: order.destination,
    lineItems: order.lineItems,
    history: order.history,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

@injectable()
export class MongoOrderRepository implements OrderRepository {
  private readonly collection: Collection<OrderDocument>;

  constructor(@inject(TYPES.Db) db: Db) {
    this.collection = db.collection<OrderDocument>('orders');
  }

  async findById(id: string): Promise<Order | null> {
    if (!isValidObjectId(id)) return null;
    const doc = await this.collection.findOne({ _id: new ObjectId(id) });
    return doc ? toDomain(doc) : null;
  }

  async findByRef(ref: string): Promise<Order | null> {
    const doc = await this.collection.findOne({ ref });
    return doc ? toDomain(doc) : null;
  }

  async find(filter: OrderFilter): Promise<Order[]> {
    const query: Filter<OrderDocument> = {};
    if (filter.states && filter.states.length > 0) {
      query.state = { $in: filter.states };
    }
    if (filter.assigneeId) {
      // A malformed assigneeId can never match a real ObjectId — return no rows rather
      // than erroring, since "list orders for this employee" is a reasonable (if empty)
      // answer for an id that doesn't correspond to anyone.
      if (!isValidObjectId(filter.assigneeId)) {
        return [];
      }
      query.assigneeId = new ObjectId(filter.assigneeId);
    }
    const docs = await this.collection.find(query).sort({ createdAt: -1 }).toArray();
    return docs.map(toDomain);
  }

  async insertMany(orders: NewOrder[]): Promise<Order[]> {
    if (orders.length === 0) return [];
    const docs = orders.map((o) => toDocument(o));
    await this.collection.insertMany(docs);
    return docs.map(toDomain);
  }

  async replace(order: Order): Promise<Order> {
    const doc = toDocument(order, new ObjectId(order.id));
    const result = await this.collection.findOneAndReplace({ _id: doc._id }, doc, {
      returnDocument: 'after',
    });
    if (!result) {
      throw new Error(`Order ${order.id} disappeared during replace — this should be unreachable.`);
    }
    return toDomain(result);
  }

  async deleteAll(): Promise<void> {
    await this.collection.deleteMany({});
  }
}
