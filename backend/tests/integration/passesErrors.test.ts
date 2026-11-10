import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { expireStaleBookings } from '../../src/jobs/expireBookings.job';
import { paymentProvider } from '../../src/services/payment';
import {
  attendees,
  authHeader,
  createAdmin,
  createFestival,
  createShowSession,
  createTicket,
} from '../utils/factories';

const app = createApp();

function book(body: Record<string, unknown>, email?: string) {
  return request(app)
    .post('/api/bookings')
    .send({
      customer: {
        name: 'Buyer One',
        email: email ?? `b.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`,
        phone: '+919876543210',
      },
      ...body,
    });
}

const seats = (id: string) => prisma.showSession.findUniqueOrThrow({ where: { id } }).then((s) => s.availableSeats);

async function eliteSetup(totalSeats = 5) {
  const festival = await createFestival();
  const show = await createShowSession(festival.id, { totalSeats });
  const ticket = await createTicket(festival.id, {
    price: 1500,
    requiresShowSession: true,
    multiDay: true,
  });
  return { festival, show, ticket };
}

describe('Booking validation errors', () => {
  it('rejects malformed attendee data with 400', async () => {
    const festival = await createFestival();
    const ticket = await createTicket(festival.id);

    const bad = [
      [{ name: 'Valid Name', email: 'not-an-email' }],
      [{ name: 'Valid Name', dateOfBirth: 'garbage' }],
      [{ name: 'Valid Name', showSessionId: 'not-a-uuid' }],
      [{ name: 'X' }],
      [],
    ];
    for (const attendeesBody of bad) {
      const res = await book({ ticketId: ticket.id, attendees: attendeesBody });
      expect(res.status).toBe(400);
    }
    const tooMany = await book({ ticketId: ticket.id, attendees: attendees(21) });
    expect(tooMany.status).toBe(400);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).availableQuantity).toBe(100);
  });

  it('returns 404 for an unknown ticket and 400 when sales are closed', async () => {
    const festival = await createFestival();
    const missing = await book({ ticketId: '00000000-0000-4000-8000-000000000000', attendees: attendees(1) });
    expect(missing.status).toBe(404);

    const closed = await createTicket(festival.id, { salesEnd: new Date(Date.now() - 1000) });
    const res = await book({ ticketId: closed.id, attendees: attendees(1) });
    expect(res.status).toBe(400);
  });

  it('accepts age exactly on the boundary and rejects a day over', async () => {
    const festival = await createFestival({
      startDate: new Date('2026-12-31T00:00:00Z'),
      endDate: new Date('2027-01-04T00:00:00Z'),
    });
    const ticket = await createTicket(festival.id, { maxAge: 17 });
    // Turns 18 on 31 Dec 2026 -> too old; turns 18 on 1 Jan 2027 -> still 17 on the start date.
    const old = await book({ ticketId: ticket.id, attendees: [{ name: 'Just Over', dateOfBirth: '2008-12-31' }] });
    expect(old.status).toBe(400);
    const ok = await book({ ticketId: ticket.id, attendees: [{ name: 'Just Under', dateOfBirth: '2009-01-01' }] });
    expect(ok.status).toBe(201);
  });
});

describe('Show session booking errors', () => {
  it('rejects unknown, foreign-festival, inactive and past sessions without side effects', async () => {
    const { festival, show, ticket } = await eliteSetup();
    const otherFestival = await createFestival();
    const foreign = await createShowSession(otherFestival.id);
    const inactive = await createShowSession(festival.id);
    await prisma.showSession.update({ where: { id: inactive.id }, data: { status: 'INACTIVE' } });
    const past = await createShowSession(festival.id, { startsAt: new Date(Date.now() - 60_000) });

    const cases: [string, number][] = [
      ['00000000-0000-4000-8000-000000000000', 404],
      [foreign.id, 404],
      [inactive.id, 400],
      [past.id, 400],
    ];
    for (const [showSessionId, status] of cases) {
      const res = await book({ ticketId: ticket.id, attendees: [{ name: 'Elite Guest', showSessionId }] });
      expect(res.status).toBe(status);
    }

    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).availableQuantity).toBe(100);
    expect(await seats(show.id)).toBe(5);
    expect(await prisma.booking.count()).toBe(0);
  });

  it('does not oversell the last seat under concurrent bookings', async () => {
    const { show, ticket } = await eliteSetup(1);
    const attempt = (n: number) =>
      book({ ticketId: ticket.id, attendees: [{ name: `Racer ${n}`, showSessionId: show.id }] }, `race${n}@example.com`);

    const results = await Promise.all([attempt(1), attempt(2), attempt(3)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await seats(show.id)).toBe(0);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).availableQuantity).toBe(99);
  });

  it('returns seats when payment fails, on refund, and when the hold expires', async () => {
    const { show, ticket } = await eliteSetup(5);
    const guest = { name: 'Elite Guest', showSessionId: show.id };

    const failed = await book({ ticketId: ticket.id, attendees: [guest] }, 'fail-pay@example.com');
    expect(failed.body.data.booking.status).toBe('CANCELLED');
    expect(await seats(show.id)).toBe(5);

    const { token } = await createAdmin();
    const ok = await book({ ticketId: ticket.id, attendees: [guest, guest] });
    expect(await seats(show.id)).toBe(3);
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { bookingNumber: ok.body.data.booking.bookingNumber },
    });
    const refund = await request(app)
      .post(`/api/admin/bookings/${booking.id}/refund`)
      .set(authHeader(token))
      .send({});
    expect(refund.status).toBe(200);
    expect(await seats(show.id)).toBe(5);

    // Hold expiry: a pending booking holding a seat is released by the job.
    const pending = await prisma.booking.create({
      data: {
        bookingNumber: 'KILF-2026-999999',
        festivalId: ticket.festivalId,
        customerId: (await prisma.customer.create({ data: { name: 'P', email: 'pending@example.com', phone: '123456' } })).id,
        status: 'PENDING_PAYMENT',
        quantity: 1,
        totalAmount: 1770,
        expiresAt: new Date(Date.now() - 1000),
        bookingItems: {
          create: [
            {
              ticketId: ticket.id,
              quantity: 1,
              unitPrice: 1500,
              subtotal: 1500,
              attendees: { create: [{ name: 'Held Seat', showSessionId: show.id }] },
            },
          ],
        },
      },
    });
    await prisma.showSession.update({ where: { id: show.id }, data: { availableSeats: { decrement: 1 } } });
    expect(await seats(show.id)).toBe(4);
    expect(await expireStaleBookings()).toBe(1);
    expect(await seats(show.id)).toBe(5);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('EXPIRED');
  });
});

describe('Free registration edge cases', () => {
  it('can be cancelled (inventory back) but not refunded', async () => {
    const { token } = await createAdmin();
    const festival = await createFestival();
    const ticket = await createTicket(festival.id, { price: 0, totalQuantity: 5 });

    const res = await book({ ticketId: ticket.id, attendees: attendees(2) });
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { bookingNumber: res.body.data.booking.bookingNumber },
    });
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).availableQuantity).toBe(3);

    const refund = await request(app).post(`/api/admin/bookings/${booking.id}/refund`).set(authHeader(token)).send({});
    expect(refund.status).toBe(400);

    const cancel = await request(app)
      .patch(`/api/admin/bookings/${booking.id}/status`)
      .set(authHeader(token))
      .send({ status: 'CANCELLED' });
    expect(cancel.status).toBe(200);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).availableQuantity).toBe(5);
    expect(await prisma.ticketInstance.count({ where: { bookingId: booking.id, status: 'CANCELLED' } })).toBe(2);
  });

  it('is sold out like any other ticket', async () => {
    const festival = await createFestival();
    const ticket = await createTicket(festival.id, { price: 0, totalQuantity: 1 });
    const res = await book({ ticketId: ticket.id, attendees: attendees(2) });
    expect(res.status).toBe(409);
  });
});

describe('Admin ticket and show session errors', () => {
  const sessionBody = (festivalId: string) => ({
    festivalId,
    name: 'Khasak Show',
    startsAt: new Date(Date.now() + 86400000).toISOString(),
    totalSeats: 10,
  });

  it('requires authentication and valid input', async () => {
    const { token } = await createAdmin();
    const festival = await createFestival();

    expect((await request(app).get('/api/admin/show-sessions')).status).toBe(401);
    expect((await request(app).post('/api/admin/show-sessions').send(sessionBody(festival.id))).status).toBe(401);

    const bad = await request(app)
      .post('/api/admin/show-sessions')
      .set(authHeader(token))
      .send({ ...sessionBody(festival.id), totalSeats: 0 });
    expect(bad.status).toBe(400);

    const noFestival = await request(app)
      .post('/api/admin/show-sessions')
      .set(authHeader(token))
      .send(sessionBody('00000000-0000-4000-8000-000000000000'));
    expect(noFestival.status).toBe(404);

    expect((await request(app).get('/api/admin/show-sessions/00000000-0000-4000-8000-000000000000').set(authHeader(token))).status).toBe(404);
    expect((await request(app).get('/api/admin/show-sessions/not-a-uuid').set(authHeader(token))).status).toBe(400);
  });

  it('protects booked seats when editing or deleting a session', async () => {
    const { token } = await createAdmin();
    const { show, ticket } = await eliteSetup(5);
    await book({ ticketId: ticket.id, attendees: [{ name: 'Seat One', showSessionId: show.id }, { name: 'Seat Two', showSessionId: show.id }] });

    const shrink = await request(app).put(`/api/admin/show-sessions/${show.id}`).set(authHeader(token)).send({ totalSeats: 1 });
    expect(shrink.status).toBe(400);

    const grow = await request(app).put(`/api/admin/show-sessions/${show.id}`).set(authHeader(token)).send({ totalSeats: 8 });
    expect(grow.status).toBe(200);
    expect(grow.body.data.availableSeats).toBe(6);

    const del = await request(app).delete(`/api/admin/show-sessions/${show.id}`).set(authHeader(token));
    expect([403, 409]).toContain(del.status); // plain ADMIN is forbidden; SUPER_ADMIN would get 409
    const { token: superToken } = await createAdmin({ role: 'SUPER_ADMIN' });
    const delSuper = await request(app).delete(`/api/admin/show-sessions/${show.id}`).set(authHeader(superToken));
    expect(delSuper.status).toBe(409);
  });

  it('rejects inconsistent ticket pass rules', async () => {
    const { token } = await createAdmin();
    const festival = await createFestival();
    const base = {
      festivalId: festival.id,
      name: 'Rules Pass',
      price: 100,
      totalQuantity: 10,
      salesStart: new Date().toISOString(),
      salesEnd: new Date(Date.now() + 86400000).toISOString(),
    };
    const post = (extra: Record<string, unknown>) =>
      request(app).post('/api/admin/tickets').set(authHeader(token)).send({ ...base, ...extra });

    expect((await post({ minAge: 20, maxAge: 10 })).status).toBe(400);
    expect((await post({ gstRate: 150 })).status).toBe(400);
    expect((await post({ gstRate: -1 })).status).toBe(400);
    expect((await post({ perks: [''] })).status).toBe(400);

    const created = await post({ price: 0, gstRate: 0 });
    expect(created.status).toBe(201);
    expect(Number(created.body.data.gstRate)).toBe(0);
  });
});

describe('Check-in errors', () => {
  it('rejects multi-day passes scanned outside the festival and cancelled tickets', async () => {
    const { token } = await createAdmin();
    const festival = await createFestival(); // starts in 30 days
    const ticket = await createTicket(festival.id, { multiDay: true });
    const res = await book({ ticketId: ticket.id, attendees: attendees(1) });
    const instance = await prisma.ticketInstance.findFirstOrThrow({
      where: { booking: { bookingNumber: res.body.data.booking.bookingNumber } },
    });
    const scan = () =>
      request(app).post('/api/admin/tickets/check-in').set(authHeader(token)).send({ ticketNumber: instance.ticketNumber });

    const early = await scan();
    expect(early.status).toBe(400);
    expect(early.body.message).toMatch(/not valid for today/);

    const verify = await request(app)
      .post('/api/admin/tickets/verify')
      .set(authHeader(token))
      .send({ ticketNumber: instance.ticketNumber });
    expect(verify.body.data.valid).toBe(false);

    await prisma.ticketInstance.update({ where: { id: instance.id }, data: { status: 'CANCELLED' } });
    expect((await scan()).status).toBe(400);

    expect((await request(app).post('/api/admin/tickets/check-in').set(authHeader(token)).send({ ticketNumber: 'LF-0000-000000' })).status).toBe(404);
    expect((await request(app).post('/api/admin/tickets/check-in').set(authHeader(token)).send({})).status).toBe(400);
  });
});

describe('Legacy data', () => {
  it('still issues tickets for a booking item that has no attendee rows', async () => {
    const festival = await createFestival();
    const ticket = await createTicket(festival.id);
    // The mock gateway fails any payment id it did not create, so register a real one.
    const legacyPayment = await paymentProvider.createPayment({
      bookingId: 'legacy',
      bookingNumber: 'KILF-2026-888888',
      amount: 1000,
      currency: 'INR',
      customerEmail: 'legacy@example.com',
    });
    const booking = await prisma.booking.create({
      data: {
        bookingNumber: 'KILF-2026-888888',
        festivalId: festival.id,
        customerId: (await prisma.customer.create({ data: { name: 'Legacy', email: 'legacy@example.com', phone: '123456' } })).id,
        status: 'PENDING_PAYMENT',
        quantity: 2,
        totalAmount: 1000,
        payments: { create: { provider: 'MOCK', providerPaymentId: legacyPayment.providerPaymentId, amount: 1000, status: 'PENDING' } },
        bookingItems: { create: [{ ticketId: ticket.id, quantity: 2, unitPrice: 500, subtotal: 1000 }] },
      },
    });
    const res = await request(app).post(`/api/bookings/${booking.bookingNumber}/confirm-payment`).send();
    expect(res.status).toBe(200);
    const count = await prisma.ticketInstance.count({ where: { bookingId: booking.id } });
    expect(count).toBe(2);
  });
});
