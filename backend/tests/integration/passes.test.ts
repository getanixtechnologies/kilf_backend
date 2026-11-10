import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import {
  attendees,
  authHeader,
  createAdmin,
  createFestival,
  createShowSession,
  createTicket,
} from '../utils/factories';

const app = createApp();

function customer(email = `c.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`) {
  return { name: 'Pass Buyer', email, phone: '+919876543210' };
}

function book(body: Record<string, unknown>) {
  return request(app).post('/api/bookings').send({ customer: customer(), ...body });
}

/** Festival that is running today, so day-bound check-ins are allowed. */
function runningFestival() {
  return createFestival({
    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  });
}

describe('GST', () => {
  it('adds GST on top of the price and stores the breakdown', async () => {
    const festival = await createFestival();
    const ticket = await createTicket(festival.id, { price: 399, gstRate: 18 });

    const res = await book({ ticketId: ticket.id, attendees: attendees(2) });

    expect(res.status).toBe(201);
    expect(Number(res.body.data.booking.subtotalAmount)).toBe(798);
    expect(Number(res.body.data.booking.gstAmount)).toBe(143.64);
    expect(Number(res.body.data.booking.totalAmount)).toBe(941.64);
  });
});

describe('Attendee details', () => {
  it('defaults attendees to the customer and rejects a mismatched quantity', async () => {
    const festival = await createFestival();
    const ticket = await createTicket(festival.id);

    const none = await book({ ticketId: ticket.id, quantity: 2 });
    expect(none.status).toBe(201);

    const neither = await book({ ticketId: ticket.id });
    expect(neither.status).toBe(400);

    const mismatch = await book({ ticketId: ticket.id, quantity: 3, attendees: attendees(2) });
    expect(mismatch.status).toBe(400);
  });

  it('issues one ticket per attendee, linked to that attendee', async () => {
    const festival = await createFestival();
    const ticket = await createTicket(festival.id);

    const res = await book({
      ticketId: ticket.id,
      attendees: [{ name: 'Asha Nair' }, { name: 'Ravi Menon', phone: '+919811111111' }],
    });
    expect(res.status).toBe(201);

    const instances = await prisma.ticketInstance.findMany({
      where: { booking: { bookingNumber: res.body.data.booking.bookingNumber } },
      include: { attendee: true },
    });
    expect(instances.map((i) => i.attendee?.name).sort()).toEqual(['Asha Nair', 'Ravi Menon']);
  });
});

describe('Young Reader age check', () => {
  it('accepts an eligible reader and rejects an adult', async () => {
    const festival = await createFestival({ startDate: new Date('2026-12-31T00:00:00Z'), endDate: new Date('2027-01-04T00:00:00Z') });
    const ticket = await createTicket(festival.id, { ticketType: 'YOUNG_READER', price: 100, maxAge: 17 });

    const ok = await book({
      ticketId: ticket.id,
      attendees: [{ name: 'Little Reader', dateOfBirth: '2014-05-01' }],
    });
    expect(ok.status).toBe(201);

    const tooOld = await book({
      ticketId: ticket.id,
      attendees: [{ name: 'Grown Up', dateOfBirth: '1990-05-01' }],
    });
    expect(tooOld.status).toBe(400);

    const noDob = await book({ ticketId: ticket.id, attendees: [{ name: 'No Dob' }] });
    expect(noDob.status).toBe(400);
  });
});

describe('Day Pass', () => {
  it('requires a date inside the festival and stores it per attendee', async () => {
    const festival = await createFestival({ startDate: new Date('2026-12-31T00:00:00Z'), endDate: new Date('2027-01-04T00:00:00Z') });
    const ticket = await createTicket(festival.id, { ticketType: 'DAY_PASS', price: 150, requiresDate: true });

    const missing = await book({ ticketId: ticket.id, attendees: attendees(1) });
    expect(missing.status).toBe(400);

    const outside = await book({ ticketId: ticket.id, attendees: [{ name: 'Early Bird', validDate: '2026-12-25' }] });
    expect(outside.status).toBe(400);

    const ok = await book({ ticketId: ticket.id, attendees: [{ name: 'Day Two', validDate: '2027-01-01' }] });
    expect(ok.status).toBe(201);
    const attendee = await prisma.bookingAttendee.findFirstOrThrow({ where: { name: 'Day Two' } });
    expect(attendee.validDate?.toISOString().slice(0, 10)).toBe('2027-01-01');
  });
});

describe('Elite pass / Khasak show seats', () => {
  it('requires a show session, takes seats, and returns them on cancellation', async () => {
    const { token } = await createAdmin();
    const festival = await createFestival();
    const show = await createShowSession(festival.id, { totalSeats: 5 });
    const ticket = await createTicket(festival.id, {
      ticketType: 'ELITE',
      price: 1500,
      requiresShowSession: true,
      multiDay: true,
    });

    const missing = await book({ ticketId: ticket.id, attendees: attendees(1) });
    expect(missing.status).toBe(400);

    const res = await book({
      ticketId: ticket.id,
      attendees: [
        { name: 'Elite One', showSessionId: show.id },
        { name: 'Elite Two', showSessionId: show.id },
      ],
    });
    expect(res.status).toBe(201);
    expect((await prisma.showSession.findUniqueOrThrow({ where: { id: show.id } })).availableSeats).toBe(3);

    const booking = await prisma.booking.findUniqueOrThrow({
      where: { bookingNumber: res.body.data.booking.bookingNumber },
    });
    const cancel = await request(app)
      .patch(`/api/admin/bookings/${booking.id}/status`)
      .set(authHeader(token))
      .send({ status: 'CANCELLED' });
    expect(cancel.status).toBe(200);
    expect((await prisma.showSession.findUniqueOrThrow({ where: { id: show.id } })).availableSeats).toBe(5);
  });

  it('refuses to overbook a show and leaves ticket inventory untouched', async () => {
    const festival = await createFestival();
    const show = await createShowSession(festival.id, { totalSeats: 1 });
    const ticket = await createTicket(festival.id, {
      ticketType: 'KHASAK_SHOW',
      price: 1000,
      requiresShowSession: true,
      totalQuantity: 10,
    });

    const res = await book({
      ticketId: ticket.id,
      attendees: [
        { name: 'Anu', showSessionId: show.id },
        { name: 'Binu', showSessionId: show.id },
      ],
    });
    expect(res.status).toBe(409);
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).availableQuantity).toBe(10);
    expect((await prisma.showSession.findUniqueOrThrow({ where: { id: show.id } })).availableSeats).toBe(1);
  });

  it('lists only bookable shows publicly', async () => {
    const festival = await createFestival();
    await createShowSession(festival.id);
    await createShowSession(festival.id, { totalSeats: 4, availableSeats: 0 });

    const res = await request(app).get(`/api/show-sessions?festivalId=${festival.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe("New Year's Eve free registration", () => {
  it('confirms immediately with tickets and no payment', async () => {
    const festival = await createFestival();
    const ticket = await createTicket(festival.id, { ticketType: 'NEW_YEAR_EVE', price: 0 });

    const res = await book({ ticketId: ticket.id, attendees: attendees(2) });

    expect(res.status).toBe(201);
    expect(res.body.data.booking.status).toBe('CONFIRMED');
    expect(Number(res.body.data.booking.totalAmount)).toBe(0);

    const booking = await prisma.booking.findUniqueOrThrow({
      where: { bookingNumber: res.body.data.booking.bookingNumber },
      include: { payments: true, ticketInstances: true },
    });
    expect(booking.payments).toHaveLength(0);
    expect(booking.ticketInstances).toHaveLength(2);
  });

  it('rejects a non-zero price for the free type', async () => {
    const { token } = await createAdmin();
    const festival = await createFestival();
    const res = await request(app)
      .post('/api/admin/tickets')
      .set(authHeader(token))
      .send({
        festivalId: festival.id,
        name: 'NYE',
        ticketType: 'NEW_YEAR_EVE',
        price: 100,
        totalQuantity: 10,
        salesStart: new Date().toISOString(),
        salesEnd: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(res.status).toBe(400);
  });
});

describe('Admin ticket pass rules', () => {
  it('applies the presets for Elite passes', async () => {
    const { token } = await createAdmin();
    const festival = await createFestival();
    const res = await request(app)
      .post('/api/admin/tickets')
      .set(authHeader(token))
      .send({
        festivalId: festival.id,
        name: 'Elite Pass',
        ticketType: 'ELITE',
        price: 1500,
        totalQuantity: 50,
        salesStart: new Date().toISOString(),
        salesEnd: new Date(Date.now() + 86400000).toISOString(),
        perks: ['Front-row seating'],
      });
    expect(res.status).toBe(201);
    // Elite is a whole-festival pass: no day of visit or show session.
    expect(res.body.data.requiresShowSession).toBe(false);
    expect(res.body.data.requiresDate).toBe(false);
    expect(res.body.data.multiDay).toBe(true);
    expect(Number(res.body.data.gstRate)).toBe(18);
    expect(res.body.data.perks).toEqual(['Front-row seating']);
  });
});

describe('Multi-day check-in', () => {
  async function bookFestivalPass() {
    const festival = await runningFestival();
    const ticket = await createTicket(festival.id, { ticketType: 'FULL_FESTIVAL', multiDay: true });
    const res = await book({ ticketId: ticket.id, attendees: attendees(1) });
    return prisma.ticketInstance.findFirstOrThrow({
      where: { booking: { bookingNumber: res.body.data.booking.bookingNumber } },
    });
  }

  it('allows one scan per venue per day and keeps the ticket valid', async () => {
    const { token } = await createAdmin();
    const instance = await bookFestivalPass();
    const scan = (venue?: string) =>
      request(app)
        .post('/api/admin/tickets/check-in')
        .set(authHeader(token))
        .send({ ticketNumber: instance.ticketNumber, venue });

    expect((await scan('Main Hall')).status).toBe(200);
    expect((await scan('Main Hall')).status).toBe(409);
    expect((await scan('Second Venue')).status).toBe(200);

    const after = await prisma.ticketInstance.findUniqueOrThrow({ where: { id: instance.id } });
    expect(after.status).toBe('VALID');
    expect(await prisma.ticketCheckIn.count({ where: { ticketInstanceId: instance.id } })).toBe(2);

    const verify = await request(app)
      .post('/api/admin/tickets/verify')
      .set(authHeader(token))
      .send({ ticketNumber: instance.ticketNumber, venue: 'Main Hall' });
    expect(verify.body.data.valid).toBe(true);
    expect(verify.body.data.alreadyUsed).toBe(true);
  });

  it('rejects a day pass scanned on the wrong day', async () => {
    const { token } = await createAdmin();
    const festival = await runningFestival();
    const ticket = await createTicket(festival.id, { ticketType: 'DAY_PASS', requiresDate: true });
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const res = await book({ ticketId: ticket.id, attendees: [{ name: 'Tomorrow', validDate: tomorrow }] });
    expect(res.status).toBe(201);
    const instance = await prisma.ticketInstance.findFirstOrThrow({
      where: { booking: { bookingNumber: res.body.data.booking.bookingNumber } },
    });

    const scan = await request(app)
      .post('/api/admin/tickets/check-in')
      .set(authHeader(token))
      .send({ ticketNumber: instance.ticketNumber });
    expect(scan.status).toBe(400);
  });
});
