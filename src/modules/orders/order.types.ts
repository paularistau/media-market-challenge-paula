export type OrderState = 'OPEN' | 'IN_PROGRESS' | 'COMPLETE';
export type OrderType = 'PICKUP' | 'SHIP';
export type LineItemStatus = 'PENDING' | 'PICKED' | 'MISSING' | 'CANCELLED';
export type LineItemResolution = 'RECHECK' | 'CANCEL';

export interface Customer {
  readonly name: string;
  readonly phone: string;
}

export interface PickupLockerDestination {
  readonly kind: 'PICKUP_LOCKER';
  readonly lockerCode: string;
  readonly floor: string;
}

export interface ShippingAddressDestination {
  readonly kind: 'SHIPPING_ADDRESS';
  readonly street: string;
  readonly postalCode: string;
  readonly city: string;
}

export interface CollectionDeskDestination {
  readonly kind: 'COLLECTION_DESK';
  readonly deskNumber: string;
  readonly area: string;
}

export type Destination = PickupLockerDestination | ShippingAddressDestination | CollectionDeskDestination;

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
