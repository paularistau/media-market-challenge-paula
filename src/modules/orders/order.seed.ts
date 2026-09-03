import type { Employee } from '../employees/employee.types';
import type { HistoryEntry, LineItem, LineItemStatus, NewOrder } from './order.types';

/**
 * 8 orders spanning every state and edge case worth demoing, adapted from
 * the original Claude Design mockup's seed data (same refs/customers/SKUs)
 * so the live demo matches what was designed. Timestamps are relative to
 * "now" at seed time rather than baked in, so the data always looks fresh.
 */
export function buildOrderSeed(employeesByCode: Record<string, Employee>): NewOrder[] {
  const now = Date.now();
  const minutesAgo = (n: number) => new Date(now - n * 60_000);
  const bakker = employeesByCode['EMP-0714'];
  const matos = employeesByCode['EMP-0301'];
  if (!bakker || !matos) {
    throw new Error('order seed expects employees EMP-0714 and EMP-0301 to already exist');
  }

  const item = (
    sku: string,
    name: string,
    quantity: number,
    location: string,
    status: LineItemStatus = 'PENDING',
  ): LineItem => ({ sku, name, quantity, location, status });

  const history = (entries: Array<[state: HistoryEntry['state'], minutesAgo: number, by: string]>): HistoryEntry[] =>
    entries.map(([state, mins, by]) => ({ state, at: minutesAgo(mins), by }));

  const orders: NewOrder[] = [
    {
      ref: 'ORD-4821',
      type: 'PICKUP',
      state: 'OPEN',
      assigneeId: null,
      customer: { name: 'Ana Ferreira', phone: '+34 6•• ••1 204' },
      destination: { kind: 'PICKUP_LOCKER', text: 'Locker A-12 · Ground floor' },
      lineItems: [
        item('TV-OL55X', 'OLED 4K TV 55"', 1, 'A3-14'),
        item('AUD-ANC7', 'ANC Headphones Mk7', 1, 'C1-02'),
        item('CBL-C100', 'USB-C 100 W cable 2 m', 2, 'C4-31'),
      ],
      history: history([['OPEN', 18, 'system']]),
      createdAt: minutesAgo(18),
      updatedAt: minutesAgo(18),
    },
    {
      ref: 'ORD-4818',
      type: 'SHIP',
      state: 'IN_PROGRESS',
      assigneeId: bakker.id,
      customer: { name: 'Tomás Silva', phone: '+351 9•• ••7 812' },
      destination: { kind: 'SHIPPING_ADDRESS', text: 'Carrer de Mallorca 214 · 08008 Barcelona' },
      lineItems: [
        item('SSD-PT2T', 'Portable SSD 2 TB', 1, 'B2-08', 'PICKED'),
        item('MSE-GX9', 'Gaming mouse GX9', 1, 'B5-22'),
      ],
      history: history([
        ['OPEN', 41, 'system'],
        ['IN_PROGRESS', 9, bakker.code],
      ]),
      createdAt: minutesAgo(41),
      updatedAt: minutesAgo(9),
    },
    {
      ref: 'ORD-4815',
      type: 'PICKUP',
      state: 'IN_PROGRESS',
      assigneeId: bakker.id,
      customer: { name: 'Marta Kowalski', phone: '+48 5•• ••3 090' },
      destination: { kind: 'COLLECTION_DESK', text: 'Desk 2 · Customer service' },
      lineItems: [
        item('ESP-BR30', 'Espresso machine BR30', 1, 'D1-05', 'PICKED'),
        item('VAC-RB4', 'Robot vacuum RB4', 1, 'D2-19', 'PICKED'),
        item('AIR-F5L', 'Air fryer 5 L', 1, 'D3-11'),
        item('SND-31X', 'Soundbar 3.1', 1, 'A1-27'),
      ],
      history: history([
        ['OPEN', 55, 'system'],
        ['IN_PROGRESS', 21, bakker.code],
      ]),
      createdAt: minutesAgo(55),
      updatedAt: minutesAgo(21),
    },
    {
      ref: 'ORD-4809',
      type: 'SHIP',
      state: 'OPEN',
      assigneeId: null,
      customer: { name: 'Jonas Weber', phone: '+49 1•• ••4 663' },
      destination: { kind: 'SHIPPING_ADDRESS', text: 'Kolonnenstr. 8 · 10829 Berlin' },
      lineItems: [item('WCH-46M', 'Smartwatch 46 mm', 1, 'C2-04')],
      history: history([['OPEN', 64, 'system']]),
      createdAt: minutesAgo(64),
      updatedAt: minutesAgo(64),
    },
    {
      ref: 'ORD-4802',
      type: 'PICKUP',
      state: 'COMPLETE',
      assigneeId: bakker.id,
      customer: { name: 'Lucía Romero', phone: '+34 6•• ••8 551' },
      destination: { kind: 'PICKUP_LOCKER', text: 'Locker B-04 · Ground floor' },
      lineItems: [
        item('KBD-M75', 'Mechanical keyboard M75', 1, 'B4-02', 'PICKED'),
        item('HUB-USB7', 'USB hub 7-port', 1, 'C4-09', 'PICKED'),
      ],
      history: history([
        ['OPEN', 126, 'system'],
        ['IN_PROGRESS', 74, bakker.code],
        ['COMPLETE', 31, bakker.code],
      ]),
      createdAt: minutesAgo(126),
      updatedAt: minutesAgo(31),
    },
    {
      ref: 'ORD-4796',
      type: 'SHIP',
      state: 'OPEN',
      assigneeId: null,
      customer: { name: 'Dóra Novák', phone: '+36 3•• ••2 417' },
      destination: { kind: 'SHIPPING_ADDRESS', text: 'Nádor u. 11 · 1051 Budapest' },
      lineItems: [
        item('PRN-LJ2', 'Laser printer LJ2', 1, 'E1-03'),
        item('TNR-LJ2', 'Toner LJ2 black', 2, 'E1-04'),
        item('PAP-A4', 'A4 paper 500 sheets', 3, 'E2-11'),
        item('SRG-6W', 'Surge strip 6-way', 1, 'C5-30'),
        item('CBL-E5', 'Ethernet cable 5 m', 1, 'C4-18'),
      ],
      history: history([['OPEN', 140, 'system']]),
      createdAt: minutesAgo(140),
      updatedAt: minutesAgo(140),
    },
    {
      // Deliberately OPEN *and* already assigned (e.g. pre-assigned by a
      // supervisor before being claimed/scanned) — good coverage for the
      // ALREADY_ASSIGNED rule when a different employee tries to claim it.
      ref: 'ORD-4791',
      type: 'PICKUP',
      state: 'OPEN',
      assigneeId: matos.id,
      customer: { name: 'Ivan Petrov', phone: '+31 6•• ••9 328' },
      destination: { kind: 'PICKUP_LOCKER', text: 'Locker A-03 · Ground floor' },
      lineItems: [item('CAM-AC5', 'Action camera AC5', 1, 'C3-07')],
      history: history([['OPEN', 160, 'system']]),
      createdAt: minutesAgo(160),
      updatedAt: minutesAgo(160),
    },
    {
      ref: 'ORD-4788',
      type: 'SHIP',
      state: 'COMPLETE',
      assigneeId: matos.id,
      customer: { name: 'Sara Haddad', phone: '+33 7•• ••5 174' },
      destination: { kind: 'SHIPPING_ADDRESS', text: '12 rue Oberkampf · 75011 Paris' },
      lineItems: [
        item('MON-27Q', 'Monitor 27" QHD', 1, 'A2-16', 'PICKED'),
        item('ARM-DUAL', 'Dual monitor arm', 1, 'A2-21', 'PICKED'),
        item('DCK-TB4', 'Thunderbolt dock', 1, 'B1-12', 'PICKED'),
      ],
      history: history([
        ['OPEN', 190, 'system'],
        ['IN_PROGRESS', 120, matos.code],
        ['COMPLETE', 52, matos.code],
      ]),
      createdAt: minutesAgo(190),
      updatedAt: minutesAgo(52),
    },
  ];

  return orders;
}
