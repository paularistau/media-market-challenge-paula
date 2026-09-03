export interface Employee {
  readonly id: string;
  readonly name: string;
  readonly code: string;
}

export type NewEmployee = Omit<Employee, 'id'>;
