import { Container } from 'inversify';
import type { Db } from 'mongodb';
import type { AppConfig } from '../config';
import { EmployeeService } from '../modules/employees/employee.service';
import { MongoEmployeeRepository, type EmployeeRepository } from '../modules/employees/employee.repository';
import { OrderService } from '../modules/orders/order.service';
import { MongoOrderRepository, type OrderRepository } from '../modules/orders/order.repository';
import { TYPES } from './types';

export function createContainer(config: AppConfig, db: Db): Container {
  const container = new Container({ defaultScope: 'Singleton' });

  container.bind<AppConfig>(TYPES.AppConfig).toConstantValue(config);
  container.bind<Db>(TYPES.Db).toConstantValue(db);

  container.bind<EmployeeRepository>(TYPES.EmployeeRepository).to(MongoEmployeeRepository);
  container.bind<EmployeeService>(TYPES.EmployeeService).to(EmployeeService);

  container.bind<OrderRepository>(TYPES.OrderRepository).to(MongoOrderRepository);
  container.bind<OrderService>(TYPES.OrderService).to(OrderService);

  return container;
}
