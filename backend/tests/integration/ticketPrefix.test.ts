import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createAdmin, createFestival, createTicket, authHeader, attendees } from '../utils/factories';

const app = createApp();
const DAY_MS = 24 * 60 * 60 * 1000;

/** A random all-letter prefix so reruns never collide. */
const letters = (n: number) =>
  Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');

async function book(ticketId: string) {
  const res = await request(app)
    .post('/api/bookings')
    .send({
      ticketId,
      quantity: 1,
      attendees: attendees(1),
      customer: { name: 'Prefix Guest', email: `prefix.${Date.now()}.${letters(4)}@example.com`, phone: '+919876543210' },
    });
  expect(res.status).toBe(201);
  const instance = await prisma.ticketInstance.findFirstOrThrow({
    where: { booking: { bookingNumber: res.body.data.booking.bookingNumber } },
  });
  return { bookingNumber: res.body.data.booking.bookingNumber as string, instance };
}

describe('Ticket ID prefix', () => {
  it('validates, upper-cases and keeps prefixes unique when admins create tickets', async () => {
    const { token } = await createAdmin();
    await createFestival();
    const prefix = letters(6);
    const base = {
      name: 'Prefixed Pass',
      price: 100,
      totalQuantity: 10,
      salesStart: new Date().toISOString(),
      salesEnd: new Date(Date.now() + DAY_MS).toISOString(),
    };
    const post = (extra: Record<string, unknown>) =>
      request(app).post('/api/admin/tickets').set(authHeader(token)).send({ ...base, ...extra });

    expect((await post({ idPrefix: 'V1P' })).status).toBe(400);
    expect((await post({ idPrefix: 'A1' })).status).toBe(400);
    expect((await post({ idPrefix: 'LF' })).status).toBe(400);

    const created = await post({ idPrefix: prefix.toLowerCase() });
    expect(created.status).toBe(201);
    expect(created.body.data.idPrefix).toBe(prefix);

    expect((await post({ idPrefix: prefix })).status).toBe(409);

    const noPrefix = await post({ idPrefix: '' });
    expect(noPrefix.status).toBe(201);
    expect(noPrefix.body.data.idPrefix).toBeNull();

    const format = await request(app).get('/api/admin/tickets/number-format').set(authHeader(token));
    expect(format.body.data.prefixes).toEqual(
      expect.arrayContaining([{ prefix: `${prefix}-`, label: 'Prefixed Pass' }])
    );
  });

  it('puts the prefix on ticket and booking numbers and checks in by the full ID', async () => {
    const { token } = await createAdmin({ role: 'SCANNER' });
    const festival = await createFestival({ startDate: new Date(), endDate: new Date(Date.now() + 3 * DAY_MS) });
    const prefix = letters(5);
    const ticket = await createTicket(festival.id, { idPrefix: prefix });

    const { bookingNumber, instance } = await book(ticket.id);
    expect(bookingNumber).toMatch(new RegExp(`^${prefix}-[0-9]{4}-[0-9]{6}$`));
    expect(instance.ticketNumber).toMatch(new RegExp(`^${prefix}-[0-9]{6}$`));

    const checkIn = await request(app)
      .post('/api/admin/tickets/check-in')
      .set(authHeader(token))
      .send({ ticketNumber: instance.ticketNumber.toLowerCase(), method: 'MANUAL' });
    expect(checkIn.status).toBe(200);
  });

  it('locks the prefix once tickets are issued; tickets without one keep the default format', async () => {
    const { token } = await createAdmin();
    const festival = await createFestival({ startDate: new Date(), endDate: new Date(Date.now() + 3 * DAY_MS) });
    const ticket = await createTicket(festival.id, { idPrefix: letters(7) });
    const plain = await createTicket(festival.id);

    const { instance } = await book(plain.id);
    expect(instance.ticketNumber).toMatch(/^LF-\d{4}-\d{6}$/);

    await book(ticket.id);
    const change = await request(app)
      .put(`/api/admin/tickets/${ticket.id}`)
      .set(authHeader(token))
      .send({ idPrefix: letters(8) });
    expect(change.status).toBe(400);
  });
});

describe('Validity window by event day', () => {
  async function scanOnDay(eventDay: number, validityDays: number) {
    const { token } = await createAdmin({ role: 'SCANNER' });
    // Festival began (eventDay - 1) days ago, so today is `eventDay`.
    const start = new Date(Date.now() - (eventDay - 1) * DAY_MS);
    const festival = await createFestival({ startDate: start, endDate: new Date(start.getTime() + 9 * DAY_MS) });
    const ticket = await createTicket(festival.id, { multiDay: true, validityDays });
    const { instance } = await book(ticket.id);
    return request(app)
      .post('/api/admin/tickets/verify')
      .set(authHeader(token))
      .send({ ticketNumber: instance.ticketNumber });
  }

  it('admits a 3-day ticket on day 3 and rejects it on day 4', async () => {
    const day3 = await scanOnDay(3, 3);
    expect(day3.body.data.code).toBe('VALID');

    const day4 = await scanOnDay(4, 3);
    expect(day4.body.data.code).toBe('EXPIRED');
    expect(day4.body.data.valid).toBe(false);
  });

  it('admits a 5-day ticket on day 5 and rejects it on day 6', async () => {
    expect((await scanOnDay(5, 5)).body.data.code).toBe('VALID');
    expect((await scanOnDay(6, 5)).body.data.code).toBe('EXPIRED');
  });
});

describe('Tickets without a festival', () => {
  it('creates a default festival when none exists', async () => {
    const { token } = await createAdmin();
    await prisma.festival.deleteMany();
    const res = await request(app)
      .post('/api/admin/tickets')
      .set(authHeader(token))
      .send({
        name: 'First Pass',
        price: 100,
        totalQuantity: 10,
        salesStart: new Date().toISOString(),
        salesEnd: new Date(Date.now() + DAY_MS).toISOString(),
      });
    expect(res.status).toBe(201);
    const festival = await prisma.festival.findUniqueOrThrow({ where: { id: res.body.data.festivalId } });
    expect(festival.name).toMatch(/^KILF \d{4}$/);
    expect(festival.endDate.getTime() - festival.startDate.getTime()).toBe(4 * DAY_MS);
  });
});
