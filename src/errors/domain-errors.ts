export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';

  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
  }
}

export class BadUserInputError extends DomainError {
  readonly code = 'BAD_USER_INPUT';
}

export class InvalidTransitionError extends DomainError {
  readonly code = 'INVALID_TRANSITION';
}

export class AssigneeRequiredError extends DomainError {
  readonly code = 'ASSIGNEE_REQUIRED';
}

export class AlreadyAssignedError extends DomainError {
  readonly code = 'ALREADY_ASSIGNED';
}

export class LineItemsPendingError extends DomainError {
  readonly code = 'LINE_ITEMS_PENDING';
}

export class LineItemMissingError extends DomainError {
  readonly code = 'LINE_ITEM_MISSING';
}

export class OrderClosedError extends DomainError {
  readonly code = 'ORDER_CLOSED';
}
