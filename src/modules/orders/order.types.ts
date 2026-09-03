export type OrderState = 'OPEN' | 'IN_PROGRESS' | 'COMPLETE';
export type OrderType = 'PICKUP' | 'SHIP';
export type LineItemStatus = 'PENDING' | 'PICKED' | 'MISSING' | 'CANCELLED';
export type LineItemResolution = 'RECHECK' | 'CANCEL';

export interface Customer {
  readonly name: string;
  readonly phone: string;
}

export interface Destination {
  readonly kind: string;
  readonly text: string;
}

export interface LineItem {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  readonly location: string;
  readonly status: LineItemStatus;
}

export interface HistoryEntry {
  readonly state: OrderState;
  readonly at: Date;
  /** Employee code, or "system" for the initial OPEN entry laid down at seed time. */
  readonly by: string;
}

export interface Order {
  readonly id: string;
  readonly ref: string;
  readonly type: OrderType;
  readonly state: OrderState;
  readonly assigneeId: string | null;
  readonly customer: Customer;
  readonly destination: Destination;
  readonly lineItems: LineItem[];
  readonly history: HistoryEntry[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type NewOrder = Omit<Order, 'id'>;

export interface OrderFilter {
  readonly states?: OrderState[];
  readonly assigneeId?: string;
}
