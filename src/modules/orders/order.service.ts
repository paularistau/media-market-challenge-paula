import { injectable, inject } from 'inversify';
import { TYPES } from '../../container/types';
import {
  AlreadyAssignedError,
  AssigneeRequiredError,
  BadUserInputError,
  InvalidTransitionError,
  LineItemMissingError,
  LineItemsPendingError,
  NotFoundError,
  OrderClosedError,
} from '../../errors/domain-errors';
import { isValidObjectId } from '../../shared/object-id';
import type { EmployeeService } from '../employees/employee.service';
import type { OrderRepository } from './order.repository';
import type { LineItemResolution, LineItemStatus, Order, OrderFilter, OrderState } from './order.types';

const NEXT_STATE: Record<OrderState, OrderState | null> = {
  OPEN: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETE',
  COMPLETE: null,
};

@injectable()
export class OrderService {
  constructor(
    @inject(TYPES.OrderRepository) private readonly orders: OrderRepository,
    @inject(TYPES.EmployeeService) private readonly employees: EmployeeService,
  ) {}

  listOrders(filter: OrderFilter): Promise<Order[]> {
    return this.orders.find(filter);
  }

  async getOrder(id: string): Promise<Order | null> {
    if (!isValidObjectId(id)) {
      throw new BadUserInputError(`"${id}" is not a valid order id.`);
    }
    return this.orders.findById(id);
  }

  async transitionOrder(id: string, to: OrderState, employeeId?: string | null): Promise<Order> {
    const order = await this.requireOrder(id);

    const expectedNext = NEXT_STATE[order.state];
    if (expectedNext === null || to !== expectedNext) {
      throw new InvalidTransitionError(
        `Orders move forward only: OPEN → IN_PROGRESS → COMPLETE. ${order.ref} is ${order.state}` +
          (expectedNext ? `, so the only allowed target is ${expectedNext}.` : ', a terminal state.'),
      );
    }

    const actingEmployee = employeeId ? await this.employees.getEmployee(employeeId) : null;

    let nextAssigneeId = order.assigneeId;
    if (to === 'IN_PROGRESS') {
      if (order.assigneeId) {
        if (actingEmployee && actingEmployee.id !== order.assigneeId) {
          throw new AlreadyAssignedError(
            `${order.ref} is already assigned to another employee. Ask them to release it first.`,
          );
        }
      } else if (actingEmployee) {
        nextAssigneeId = actingEmployee.id;
      } else {
        throw new AssigneeRequiredError(
          `IN_PROGRESS requires an assigned employee. Pass employeeId to claim ${order.ref} and transition it in one step.`,
        );
      }
    }

    if (to === 'COMPLETE') {
      const missing = order.lineItems.filter((item) => item.status === 'MISSING');
      const pending = order.lineItems.filter((item) => item.status === 'PENDING');
      if (missing.length > 0) {
        throw new LineItemMissingError(
          `${missing.length} line item(s) reported missing on ${order.ref}. Resolve them before completing.`,
        );
      }
      if (pending.length > 0) {
        throw new LineItemsPendingError(
          `${pending.length} of ${order.lineItems.length} line item(s) on ${order.ref} have not been scanned yet.`,
        );
      }
    }

    const now = new Date();
    return this.orders.replace({
      ...order,
      state: to,
      assigneeId: nextAssigneeId,
      updatedAt: now,
      history: [...order.history, { state: to, at: now, by: actingEmployee?.code ?? 'system' }],
    });
  }

  markLineItemPicked(orderId: string, sku: string): Promise<Order> {
    return this.updateLineItemStatus(orderId, sku, 'PICKED', ['PENDING']);
  }

  reportLineItemMissing(orderId: string, sku: string): Promise<Order> {
    return this.updateLineItemStatus(orderId, sku, 'MISSING', ['PENDING']);
  }

  resolveLineItem(orderId: string, sku: string, resolution: LineItemResolution): Promise<Order> {
    const next: LineItemStatus = resolution === 'RECHECK' ? 'PENDING' : 'CANCELLED';
    return this.updateLineItemStatus(orderId, sku, next, ['MISSING']);
  }

  private async updateLineItemStatus(
    orderId: string,
    sku: string,
    next: LineItemStatus,
    allowedFrom: LineItemStatus[],
  ): Promise<Order> {
    const order = await this.requireOrder(orderId);
    if (order.state === 'COMPLETE') {
      throw new OrderClosedError(`${order.ref} is COMPLETE and read-only.`);
    }
    const item = order.lineItems.find((i) => i.sku === sku);
    if (!item) {
      throw new NotFoundError('LineItem', sku);
    }
    if (!allowedFrom.includes(item.status)) {
      throw new BadUserInputError(
        `Line item ${sku} on ${order.ref} is ${item.status}; expected ${allowedFrom.join(' or ')}.`,
      );
    }

    const now = new Date();
    return this.orders.replace({
      ...order,
      updatedAt: now,
      lineItems: order.lineItems.map((i) => (i.sku === sku ? { ...i, status: next } : i)),
    });
  }

  private async requireOrder(id: string): Promise<Order> {
    if (!isValidObjectId(id)) {
      throw new BadUserInputError(`"${id}" is not a valid order id.`);
    }
    const order = await this.orders.findById(id);
    if (!order) {
      throw new NotFoundError('Order', id);
    }
    return order;
  }
}
