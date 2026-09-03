export const TYPES = {
  AppConfig: Symbol.for('AppConfig'),
  Db: Symbol.for('Db'),

  EmployeeRepository: Symbol.for('EmployeeRepository'),
  EmployeeService: Symbol.for('EmployeeService'),

  OrderRepository: Symbol.for('OrderRepository'),
  OrderService: Symbol.for('OrderService'),
} as const;
