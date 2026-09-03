import { injectable, inject } from 'inversify';
import { TYPES } from '../../container/types';
import { BadUserInputError, NotFoundError } from '../../errors/domain-errors';
import { isValidObjectId } from '../../shared/object-id';
import type { EmployeeRepository } from './employee.repository';
import type { Employee } from './employee.types';

@injectable()
export class EmployeeService {
  constructor(@inject(TYPES.EmployeeRepository) private readonly employees: EmployeeRepository) {}

  listEmployees(): Promise<Employee[]> {
    return this.employees.findAll();
  }

  findEmployee(id: string): Promise<Employee | null> {
    return this.employees.findById(id);
  }

  async getEmployee(id: string): Promise<Employee> {
    if (!isValidObjectId(id)) {
      throw new BadUserInputError(`"${id}" is not a valid employee id.`);
    }
    const employee = await this.employees.findById(id);
    if (!employee) {
      throw new NotFoundError('Employee', id);
    }
    return employee;
  }
}
