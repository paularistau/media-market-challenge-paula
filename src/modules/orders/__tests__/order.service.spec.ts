import { ObjectId } from 'mongodb';
import {
  AlreadyAssignedError,
  AssigneeRequiredError,
  BadUserInputError,
  InvalidTransitionError,
  LineItemMissingError,
  LineItemsPendingError,
  NotFoundError,
  OrderClosedError,
} from '../../../errors/domain-errors';
import type { EmployeeService } from '../../employees/employee.service';
import type { Employee } from '../../employees/employee.types';
import { OrderService } from '../order.service';
import type { OrderRepository } from '../order.repository';
import type { LineItem, Order, OrderFilter } from '../order.types';

function id(): string {
  return new ObjectId().toHexString();
}

const bakker: Employee = { id: id(), name: 'N. Bakker', code: 'EMP-0714' };
const matos: Employee = { id: id(), name: 'R. Matos', code: 'EMP-0301' };

function makeOrder(overrides: Partial<Order> = {}): Order {
  const now = new Date('2026-09-01T10:00:00.000Z');
  return {
    id: id(),
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

function makeRepository(order: Order | null): jest.Mocked<OrderRepository> {
  return {
    findById: jest.fn(async (_id: string) => order),
    findByRef: jest.fn(async (_ref: string) => order),
    find: jest.fn(async (_filter: OrderFilter) => (order ? [order] : [])),
    insertMany: jest.fn(async (orders) => orders.map((o) => ({ ...o, id: id() }))),
    replace: jest.fn(async (o: Order) => o),
    deleteAll: jest.fn(async () => undefined),
  };
}

function makeEmployeeService(byId: Record<string, Employee>): jest.Mocked<Pick<EmployeeService, 'getEmployee' | 'findEmployee'>> {
  return {
    getEmployee: jest.fn(async (employeeId: string) => {
      if (!ObjectId.isValid(employeeId)) throw new BadUserInputError(`"${employeeId}" is not a valid employee id.`);
      const employee = byId[employeeId];
      if (!employee) throw new NotFoundError('Employee', employeeId);
      return employee;
    }),
    findEmployee: jest.fn(async (employeeId: string) => byId[employeeId] ?? null),
  };
}

describe('OrderService.transitionOrder', () => {
  it('rejects a malformed order id without touching the repository', async () => {
    const repo = makeRepository(null);
    const service = new OrderService(repo, makeEmployeeService({}) as unknown as EmployeeService);

    await expect(service.transitionOrder('not-an-id', 'IN_PROGRESS')).rejects.toBeInstanceOf(BadUserInputError);
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('rejects an unknown order id with NOT_FOUND', async () => {
    const repo = makeRepository(null);
    const service = new OrderService(repo, makeEmployeeService({}) as unknown as EmployeeService);

    await expect(service.transitionOrder(id(), 'IN_PROGRESS')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects skipping OPEN straight to COMPLETE', async () => {
    const order = makeOrder({ state: 'OPEN' });
    const repo = makeRepository(order);
    const service = new OrderService(repo, makeEmployeeService({}) as unknown as EmployeeService);

    await expect(service.transitionOrder(order.id, 'COMPLETE')).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(repo.replace).not.toHaveBeenCalled();
  });

  it('rejects reopening a COMPLETE order (reverting to IN_PROGRESS)', async () => {
    const order = makeOrder({ state: 'COMPLETE', assigneeId: bakker.id });
    const repo = makeRepository(order);
    const service = new OrderService(repo, makeEmployeeService({ [bakker.id]: bakker }) as unknown as EmployeeService);

    await expect(service.transitionOrder(order.id, 'IN_PROGRESS')).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it('rejects OPEN -> IN_PROGRESS with no employeeId and no existing assignee', async () => {
    const order = makeOrder({ state: 'OPEN', assigneeId: null });
    const repo = makeRepository(order);
    const service = new OrderService(repo, makeEmployeeService({}) as unknown as EmployeeService);

    await expect(service.transitionOrder(order.id, 'IN_PROGRESS')).rejects.toBeInstanceOf(AssigneeRequiredError);
  });

  it('claims and transitions atomically when employeeId is supplied for an unassigned order', async () => {
    const order = makeOrder({ state: 'OPEN', assigneeId: null });
    const repo = makeRepository(order);
    const service = new OrderService(repo, makeEmployeeService({ [bakker.id]: bakker }) as unknown as EmployeeService);

    const result = await service.transitionOrder(order.id, 'IN_PROGRESS', bakker.id);

    expect(result.state).toBe('IN_PROGRESS');
    expect(result.assigneeId).toBe(bakker.id);
    expect(result.history.at(-1)).toMatchObject({ state: 'IN_PROGRESS', by: bakker.code });
    expect(repo.replace).toHaveBeenCalledTimes(1);
  });

  it('rejects claiming an order already assigned to a different employee', async () => {
    const order = makeOrder({ state: 'OPEN', assigneeId: matos.id });
    const repo = makeRepository(order);
    const service = new OrderService(
      repo,
      makeEmployeeService({ [matos.id]: matos, [bakker.id]: bakker }) as unknown as EmployeeService,
    );

    await expect(service.transitionOrder(order.id, 'IN_PROGRESS', bakker.id)).rejects.toBeInstanceOf(
      AlreadyAssignedError,
    );
    expect(repo.replace).not.toHaveBeenCalled();
  });

  it('allows re-claiming (idempotent) by the same employee already assigned', async () => {
    const order = makeOrder({ state: 'OPEN', assigneeId: bakker.id });
    const repo = makeRepository(order);
    const service = new OrderService(repo, makeEmployeeService({ [bakker.id]: bakker }) as unknown as EmployeeService);

    const result = await service.transitionOrder(order.id, 'IN_PROGRESS', bakker.id);
    expect(result.state).toBe('IN_PROGRESS');
    expect(result.assigneeId).toBe(bakker.id);
  });

  it('propagates NOT_FOUND when employeeId does not match any employee', async () => {
    const order = makeOrder({ state: 'OPEN', assigneeId: null });
    const repo = makeRepository(order);
    const service = new OrderService(repo, makeEmployeeService({}) as unknown as EmployeeService);

    await expect(service.transitionOrder(order.id, 'IN_PROGRESS', id())).rejects.toBeInstanceOf(NotFoundError);
  });

  it('completes an order once every line item is PICKED or CANCELLED', async () => {
    const items: LineItem[] = [
      { sku: 'SKU-1', name: 'Widget', quantity: 1, location: 'A1-01', status: 'PICKED' },
      { sku: 'SKU-2', name: 'Gadget', quantity: 1, location: 'A1-02', status: 'CANCELLED' },
    ];
    const order = makeOrder({ state: 'IN_PROGRESS', assigneeId: bakker.id, lineItems: items });
    const repo = makeRepository(order);
    const service = new OrderService(repo, makeEmployeeService({ [bakker.id]: bakker }) as unknown as EmployeeService);

    const result = await service.transitionOrder(order.id, 'COMPLETE', bakker.id);
    expect(result.state).toBe('COMPLETE');
    expect(result.history.at(-1)).toMatchObject({ state: 'COMPLETE', by: bakker.code });
  });

  it('blocks completion while a line item is still PENDING', async () => {
    const order = makeOrder({ state: 'IN_PROGRESS', assigneeId: bakker.id });
    const repo = makeRepository(order);
    const service = new OrderService(repo, makeEmployeeService({ [bakker.id]: bakker }) as unknown as EmployeeService);

    await expect(service.transitionOrder(order.id, 'COMPLETE')).rejects.toBeInstanceOf(LineItemsPendingError);
  });

  it('blocks completion while a line item is MISSING, even if others are still PENDING', async () => {
    const items: LineItem[] = [
      { sku: 'SKU-1', name: 'Widget', quantity: 1, location: 'A1-01', status: 'MISSING' },
      { sku: 'SKU-2', name: 'Gadget', quantity: 1, location: 'A1-02', status: 'PENDING' },
    ];
    const order = makeOrder({ state: 'IN_PROGRESS', assigneeId: bakker.id, lineItems: items });
    const repo = makeRepository(order);
    const service = new OrderService(repo, makeEmployeeService({ [bakker.id]: bakker }) as unknown as EmployeeService);

    await expect(service.transitionOrder(order.id, 'COMPLETE')).rejects.toBeInstanceOf(LineItemMissingError);
  });
});

describe('OrderService line item mutations', () => {
  it('marks a PENDING line item as PICKED', async () => {
    const order = makeOrder({ state: 'IN_PROGRESS', assigneeId: bakker.id });
    const repo = makeRepository(order);
    const service = new OrderService(repo, makeEmployeeService({}) as unknown as EmployeeService);

    const result = await service.markLineItemPicked(order.id, 'SKU-1');
    expect(result.lineItems[0]?.status).toBe('PICKED');
  });

  it('rejects picking a line item that is not PENDING', async () => {
    const order = makeOrder({
      state: 'IN_PROGRESS',
      assigneeId: bakker.id,
      lineItems: [{ sku: 'SKU-1', name: 'Widget', quantity: 1, location: 'A1-01', status: 'PICKED' }],
    });
    const repo = makeRepository(order);
    const service = new OrderService(repo, makeEmployeeService({}) as unknown as EmployeeService);

    await expect(service.markLineItemPicked(order.id, 'SKU-1')).rejects.toBeInstanceOf(BadUserInputError);
  });

  it('rejects an unknown sku with NOT_FOUND', async () => {
    const order = makeOrder({ state: 'IN_PROGRESS', assigneeId: bakker.id });
    const repo = makeRepository(order);
    const service = new OrderService(repo, makeEmployeeService({}) as unknown as EmployeeService);

    await expect(service.markLineItemPicked(order.id, 'NOPE')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects mutating line items on a COMPLETE (read-only) order', async () => {
    const order = makeOrder({
      state: 'COMPLETE',
      assigneeId: bakker.id,
      lineItems: [{ sku: 'SKU-1', name: 'Widget', quantity: 1, location: 'A1-01', status: 'PICKED' }],
    });
    const repo = makeRepository(order);
    const service = new OrderService(repo, makeEmployeeService({}) as unknown as EmployeeService);

    await expect(service.markLineItemPicked(order.id, 'SKU-1')).rejects.toBeInstanceOf(OrderClosedError);
  });

  it('reports a PENDING line item MISSING', async () => {
    const order = makeOrder({ state: 'IN_PROGRESS', assigneeId: bakker.id });
    const repo = makeRepository(order);
    const service = new OrderService(repo, makeEmployeeService({}) as unknown as EmployeeService);

    const result = await service.reportLineItemMissing(order.id, 'SKU-1');
    expect(result.lineItems[0]?.status).toBe('MISSING');
  });

  it('resolves a MISSING line item back to PENDING on RECHECK', async () => {
    const order = makeOrder({
      state: 'IN_PROGRESS',
      assigneeId: bakker.id,
      lineItems: [{ sku: 'SKU-1', name: 'Widget', quantity: 1, location: 'A1-01', status: 'MISSING' }],
    });
    const repo = makeRepository(order);
    const service = new OrderService(repo, makeEmployeeService({}) as unknown as EmployeeService);

    const result = await service.resolveLineItem(order.id, 'SKU-1', 'RECHECK');
    expect(result.lineItems[0]?.status).toBe('PENDING');
  });

  it('resolves a MISSING line item to CANCELLED on CANCEL', async () => {
    const order = makeOrder({
      state: 'IN_PROGRESS',
      assigneeId: bakker.id,
      lineItems: [{ sku: 'SKU-1', name: 'Widget', quantity: 1, location: 'A1-01', status: 'MISSING' }],
    });
    const repo = makeRepository(order);
    const service = new OrderService(repo, makeEmployeeService({}) as unknown as EmployeeService);

    const result = await service.resolveLineItem(order.id, 'SKU-1', 'CANCEL');
    expect(result.lineItems[0]?.status).toBe('CANCELLED');
  });

  it('rejects resolving a line item that is not MISSING', async () => {
    const order = makeOrder({ state: 'IN_PROGRESS', assigneeId: bakker.id });
    const repo = makeRepository(order);
    const service = new OrderService(repo, makeEmployeeService({}) as unknown as EmployeeService);

    await expect(service.resolveLineItem(order.id, 'SKU-1', 'RECHECK')).rejects.toBeInstanceOf(BadUserInputError);
  });
});

describe('OrderService read paths', () => {
  it('getOrder returns the order when found', async () => {
    const order = makeOrder();
    const repo = makeRepository(order);
    const service = new OrderService(repo, makeEmployeeService({}) as unknown as EmployeeService);

    await expect(service.getOrder(order.id)).resolves.toEqual(order);
  });

  it('getOrder resolves to null for a well-formed but unknown id', async () => {
    const repo = makeRepository(null);
    const service = new OrderService(repo, makeEmployeeService({}) as unknown as EmployeeService);

    await expect(service.getOrder(id())).resolves.toBeNull();
  });

  it('getOrder rejects a malformed id with BAD_USER_INPUT', async () => {
    const repo = makeRepository(null);
    const service = new OrderService(repo, makeEmployeeService({}) as unknown as EmployeeService);

    await expect(service.getOrder('not-an-id')).rejects.toBeInstanceOf(BadUserInputError);
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('listOrders delegates the filter straight to the repository', async () => {
    const order = makeOrder();
    const repo = makeRepository(order);
    const service = new OrderService(repo, makeEmployeeService({}) as unknown as EmployeeService);

    const filter = { states: ['OPEN' as const], assigneeId: bakker.id };
    await service.listOrders(filter);
    expect(repo.find).toHaveBeenCalledWith(filter);
  });
});
