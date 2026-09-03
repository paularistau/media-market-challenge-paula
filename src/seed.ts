import 'reflect-metadata';
import { loadConfig } from './config';
import { MongoEmployeeRepository } from './modules/employees/employee.repository';
import { employeeSeed } from './modules/employees/employee.seed';
import { MongoOrderRepository } from './modules/orders/order.repository';
import { buildOrderSeed } from './modules/orders/order.seed';
import { connectMongo } from './server';

/** Wipes and reseeds the configured database. Bypasses the IoC container — a seed script is a one-shot CLI job, not a request-serving process. */
async function seed(): Promise<void> {
  const config = loadConfig();
  const { client, db } = await connectMongo(config.mongo.uri, config.mongo.dbName);

  try {
    const employeeRepository = new MongoEmployeeRepository(db);
    const orderRepository = new MongoOrderRepository(db);

    await orderRepository.deleteAll();
    await employeeRepository.deleteAll();

    const employees = await employeeRepository.insertMany(employeeSeed);
    const employeesByCode = Object.fromEntries(employees.map((employee) => [employee.code, employee]));
    const orders = await orderRepository.insertMany(buildOrderSeed(employeesByCode));

    console.log(
      `Seeded ${employees.length} employees and ${orders.length} orders into "${config.mongo.dbName}".`,
    );
  } finally {
    await client.close();
  }
}

seed().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exitCode = 1;
});
