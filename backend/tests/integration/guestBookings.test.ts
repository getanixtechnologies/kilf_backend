import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createFestival, createTicket, authHeader, attendees } from '../utils/factories';

const app = createApp();

async function registerGuest(email: string) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Guest User', email, password: 'Secret123', confirmPassword: 'Secret123' });
  return { token: res.body.token as string, id: res.body.guest.id as string };
}

function customer(email: string) {
  return { name: 'John Doe', email, phone: '+919876543210' };
}

async function setupTicket() {
  const festival = await createFestival();
  return createTicket(festival.id, { price: 500, totalQuantity: 20, availableQuantity: 20 });
}

describe('Booking creation and guest linking', () => {
  it('sets guestId from the token on a booking made while logged in', async () => {
    const ticket = await setupTicket();
    const guest = await registerGuest('a@kilf.dev');

    const res = await request(app)
      .post('/api/bookings')
      .set(authHeader(guest.token))
      .send({ ticketId: ticket.id, quantity: 1, attendees: attendees(1), customer: customer('a@kilf.dev') });

    expect(res.status).toBe(201);
    const booking = await prisma.booking.findUnique({
      where: { bookingNumber: res.body.data.booking.bookingNumber },
    });
    expect(booking?.guestId).toBe(guest.id);
  });

  it('ignores a guestId sent in the body', async () => {
    const ticket = await setupTicket();
    const victim = await registerGuest('victim@kilf.dev');

    const res = await request(app)
      .post('/api/bookings')
      .send({
        ticketId: ticket.id,
        quantity: 1,
        attendees: attendees(1),
        customer: customer('x@example.com'),
        guestId: victim.id,
      });

    expect(res.status).toBe(201);
    const booking = await prisma.booking.findUnique({
      where: { bookingNumber: res.body.data.booking.bookingNumber },
    });
    expect(booking?.guestId).toBeNull();
  });

  it('still works without a token (guestId stays null)', async () => {
    const ticket = await setupTicket();
    const res = await request(app)
      .post('/api/bookings')
      .send({ ticketId: ticket.id, quantity: 2, attendees: attendees(2), customer: customer('anon@example.com') });

    expect(res.status).toBe(201);
    expect(res.body.data.booking.status).toBe('CONFIRMED');
    const booking = await prisma.booking.findUnique({
      where: { bookingNumber: res.body.data.booking.bookingNumber },
    });
    expect(booking?.guestId).toBeNull();
  });

  it('returns 401 when an invalid token is sent', async () => {
    const ticket = await setupTicket();
    const res = await request(app)
      .post('/api/bookings')
      .set(authHeader('not-a-jwt'))
      .send({ ticketId: ticket.id, quantity: 1, attendees: attendees(1), customer: customer('c@example.com') });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/bookings', () => {
  it('lists only the guest’s own bookings, newest first, with the full shape', async () => {
    const ticket = await setupTicket();
    const a = await registerGuest('a@kilf.dev');
    const b = await registerGuest('b@kilf.dev');

    const book = (token: string, email: string) =>
      request(app)
        .post('/api/bookings')
        .set(authHeader(token))
        .send({ ticketId: ticket.id, quantity: 1, attendees: attendees(1), customer: customer(email) });

    const a1 = await book(a.token, 'a@kilf.dev');
    const a2 = await book(a.token, 'a@kilf.dev');
    const b1 = await book(b.token, 'b@kilf.dev');

    const res = await request(app).get('/api/auth/bookings').set(authHeader(a.token));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const numbers = res.body.data.map((x: { bookingNumber: string }) => x.bookingNumber);
    expect(numbers).toEqual([a2.body.data.booking.bookingNumber, a1.body.data.booking.bookingNumber]);
    expect(numbers).not.toContain(b1.body.data.booking.bookingNumber);

    const first = res.body.data[0];
    expect(first.ticket).toEqual({ name: ticket.name });
    expect(first.festival.name).toBeDefined();
    expect(first.customer.email).toBe('a@kilf.dev');
    expect(first.payment.status).toBe('SUCCESS');
    expect(first.ticketInstances).toHaveLength(1);
    expect(first.ticketInstances[0].qrCode).toMatch(/^data:image/);
    expect(first.ticketInstances[0].attendee.name).toBe('Guest 1');
    expect(first.ticketInstances[0].showSession).toBeNull();

    const paged = await request(app).get('/api/auth/bookings?page=2&limit=1').set(authHeader(a.token));
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.data[0].bookingNumber).toBe(a1.body.data.booking.bookingNumber);
  });

  it('requires a valid token', async () => {
    expect((await request(app).get('/api/auth/bookings')).status).toBe(401);
    expect((await request(app).get('/api/auth/bookings').set(authHeader('bad'))).status).toBe(401);
  });
});

describe('GET /api/auth/bookings/:bookingNumber', () => {
  it('opens the guest’s own booking and 404s for another guest’s', async () => {
    const ticket = await setupTicket();
    const a = await registerGuest('a@kilf.dev');
    const b = await registerGuest('b@kilf.dev');

    const created = await request(app)
      .post('/api/bookings')
      .set(authHeader(b.token))
      .send({ ticketId: ticket.id, quantity: 2, attendees: attendees(2), customer: customer('b@kilf.dev') });
    const number = created.body.data.booking.bookingNumber;

    const own = await request(app).get(`/api/auth/bookings/${number}`).set(authHeader(b.token));
    expect(own.status).toBe(200);
    expect(own.body.data.bookingNumber).toBe(number);
    expect(own.body.data.ticketInstances).toHaveLength(2);

    const other = await request(app).get(`/api/auth/bookings/${number}`).set(authHeader(a.token));
    expect(other.status).toBe(404);

    const missing = await request(app).get('/api/auth/bookings/KILF-0000-000000').set(authHeader(a.token));
    expect(missing.status).toBe(404);
  });
});

describe('PATCH /api/auth/me', () => {
  it('updates name and phone, keeps email, and /me returns phone', async () => {
    const a = await registerGuest('a@kilf.dev');
    const res = await request(app)
      .patch('/api/auth/me')
      .set(authHeader(a.token))
      .send({ name: 'New Name', phone: '+91 98765 43210', email: 'hacker@kilf.dev' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'New Name', phone: '+91 98765 43210', email: 'a@kilf.dev' });

    const me = await request(app).get('/api/auth/me').set(authHeader(a.token));
    expect(me.body.data.phone).toBe('+91 98765 43210');
  });

  it.each([
    [{ name: 'A' }, 'body.name'],
    [{ name: 'x'.repeat(101) }, 'body.name'],
    [{ name: 'Valid Name', phone: '12345' }, 'body.phone'],
    [{ name: 'Valid Name', phone: '98765-43210' }, 'body.phone'],
    [{ name: 'Valid Name', phone: '1234567890123456' }, 'body.phone'],
    [{}, 'body.name'],
  ])('rejects %j', async (body, path) => {
    const a = await registerGuest('a@kilf.dev');
    const res = await request(app).patch('/api/auth/me').set(authHeader(a.token)).send(body);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBeDefined();
    expect(res.body.errors.map((e: { path: string }) => e.path)).toContain(path);
  });

  it('requires a token', async () => {
    const res = await request(app).patch('/api/auth/me').send({ name: 'Valid Name' });
    expect(res.status).toBe(401);
  });
});

describe('Elite Pass and optional buyer phone', () => {
  it('books an Elite Pass created in admin without a date or show session', async () => {
    const { token } = await (await import('../utils/factories')).createAdmin();
    const festival = await createFestival();
    const created = await request(app)
      .post('/api/admin/tickets')
      .set(authHeader(token))
      .send({
        festivalId: festival.id,
        name: 'Elite Pass',
        price: 1500,
        totalQuantity: 50,
        salesStart: new Date(Date.now() - 60000).toISOString(),
        salesEnd: new Date(Date.now() + 86400000).toISOString(),
      });
    expect(created.status).toBe(201);

    const res = await request(app)
      .post('/api/bookings')
      .send({ ticketId: created.body.data.id, quantity: 1, customer: { name: 'Elite Buyer', email: 'elite@example.com' } });
    expect(res.status).toBe(201);
    expect(res.body.data.booking.status).toBe('CONFIRMED');
  });

  it.each([undefined, null, ''])('accepts a booking with phone=%j and stores null', async (phone) => {
    const ticket = await setupTicket();
    const res = await request(app)
      .post('/api/bookings')
      .send({ ticketId: ticket.id, quantity: 1, customer: { name: 'No Phone', email: 'nophone@example.com', phone } });
    expect(res.status).toBe(201);
    const c = await prisma.customer.findUnique({ where: { email: 'nophone@example.com' } });
    expect(c?.phone).toBeNull();
  });

  it('keeps a previously saved phone when a later booking omits it', async () => {
    const ticket = await setupTicket();
    await request(app).post('/api/bookings').send({ ticketId: ticket.id, quantity: 1, customer: customer('keep@example.com') });
    await request(app)
      .post('/api/bookings')
      .send({ ticketId: ticket.id, quantity: 1, customer: { name: 'John Doe', email: 'keep@example.com' } });
    const c = await prisma.customer.findUnique({ where: { email: 'keep@example.com' } });
    expect(c?.phone).toBe('+919876543210');
  });

  it('still rejects a phone that is too short', async () => {
    const ticket = await setupTicket();
    const res = await request(app)
      .post('/api/bookings')
      .send({ ticketId: ticket.id, quantity: 1, customer: { name: 'John Doe', email: 'x@example.com', phone: '123' } });
    expect(res.status).toBe(400);
  });
});
