/**
 * Symbol identifiers for everything bound into the IoC container.
 * Using Symbol.for (not plain Symbol()) so the same identifier resolves
 * across module boundaries / test re-imports without relying on identity
 * of a single imported object.
 */
export const TYPES = {
  AppConfig: Symbol.for('AppConfig'),
  Db: Symbol.for('Db'),

  EmployeeRepository: Symbol.for('EmployeeRepository'),
  EmployeeService: Symbol.for('EmployeeService'),

  OrderRepository: Symbol.for('OrderRepository'),
  OrderService: Symbol.for('OrderService'),
} as const;
