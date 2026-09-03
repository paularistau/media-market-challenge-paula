import type { Container } from 'inversify';
import { TYPES } from '../container/types';
import type { EmployeeService } from '../modules/employees/employee.service';
import type { OrderService } from '../modules/orders/order.service';

export interface GraphQLContext {
  readonly orderService: OrderService;
  readonly employeeService: EmployeeService;
}

export function createContextFactory(container: Container): () => Promise<GraphQLContext> {
  const orderService = container.get<OrderService>(TYPES.OrderService);
  const employeeService = container.get<EmployeeService>(TYPES.EmployeeService);
  return async () => ({ orderService, employeeService });
}
