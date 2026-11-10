import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createAdmin, createFestival, createTicket, authHeader, attendees } from '../utils/factories';

const app = createApp();

// Check-in only admits tickets on festival days, so these festivals run today.
const runningToday = () => ({
  startDate: new Date(),
  endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
});

describe('Ticket verification / check-in', () => {
  async function bookOneTicket() {
    const festival = await createFestival(runningToday());
    const ticket = await createTicket(festival.id, { totalQuantity: 5, availableQuantity: 5 });
    const bookingRes = await request(app)
      .post('/api/bookings')
      .send({
        ticketId: ticket.id,
        quantity: 1, attendees: attendees(1),
        customer: { name: 'Scan Me', email: `scan.${Date.now()}@example.com`, phone: '+919876543210' },
      });
    const instance = await prisma.ticketInstance.findFirstOrThrow({
      where: { booking: { bookingNumber: bookingRes.body.data.booking.bookingNumber } },
    });
    return instance;
  }

  it('verifies a valid, not-yet-used ticket', async () => {
    const { token } = await createAdmin();
    const instance = await bookOneTicket();

    const res = await request(app)
      .post('/api/admin/tickets/verify')
      .set(authHeader(token))
      .send({ ticketNumber: instance.ticketNumber });

    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.alreadyUsed).toBe(false);
  });

  it('checks in a valid ticket and rejects a second check-in', async () => {
    const { token } = await createAdmin();
    const instance = await bookOneTicket();

    const first = await request(app)
      .post('/api/admin/tickets/check-in')
      .set(authHeader(token))
      .send({ ticketNumber: instance.ticketNumber });
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe('USED');

    const second = await request(app)
      .post('/api/admin/tickets/check-in')
      .set(authHeader(token))
      .send({ ticketNumber: instance.ticketNumber });
    expect(second.status).toBe(409);

    const verifyAfter = await request(app)
      .post('/api/admin/tickets/verify')
      .set(authHeader(token))
      .send({ ticketNumber: instance.ticketNumber });
    expect(verifyAfter.body.data.alreadyUsed).toBe(true);
  });

  it('reports an unknown ticket number as invalid', async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .post('/api/admin/tickets/verify')
      .set(authHeader(token))
      .send({ ticketNumber: 'LF-2026-999999' });

    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(false);
  });
});

describe('Scanner (gate staff) accounts', () => {
  async function bookOneTicket() {
    const festival = await createFestival(runningToday());
    const ticket = await createTicket(festival.id, { totalQuantity: 5, availableQuantity: 5 });
    const res = await request(app)
      .post('/api/bookings')
      .send({
        ticketId: ticket.id,
        quantity: 1,
        attendees: attendees(1),
        customer: { name: 'Gate Guest', email: `gate.${Date.now()}@example.com`, phone: '+919876543210' },
      });
    return prisma.ticketInstance.findFirstOrThrow({
      where: { booking: { bookingNumber: res.body.data.booking.bookingNumber } },
    });
  }

  it('lets a scanner verify and check in a ticket', async () => {
    const { token } = await createAdmin({ role: 'SCANNER' });
    const instance = await bookOneTicket();

    const verify = await request(app)
      .post('/api/admin/tickets/verify')
      .set(authHeader(token))
      .send({ ticketNumber: instance.ticketNumber });
    expect(verify.status).toBe(200);
    expect(verify.body.data.valid).toBe(true);

    const checkIn = await request(app)
      .post('/api/admin/tickets/check-in')
      .set(authHeader(token))
      .send({ ticketNumber: instance.ticketNumber });
    expect(checkIn.status).toBe(200);
  });

  it('keeps a scanner out of every other admin route', async () => {
    const { token } = await createAdmin({ role: 'SCANNER' });

    for (const path of [
      '/api/admin/tickets',
      '/api/admin/bookings',
      '/api/admin/dashboard/stats',
      '/api/admin/revenue/summary',
      '/api/admin/enquiries',
      '/api/admin/early-bird',
      '/api/admin/sponsors',
      '/api/admin/festivals',
      '/api/admin/show-sessions',
      '/api/admin/audit-logs',
      '/api/admin/scanners',
    ]) {
      const res = await request(app).get(path).set(authHeader(token));
      expect({ path, status: res.status }).toEqual({ path, status: 403 });
    }
  });

  it('lets a scanner read their own profile', async () => {
    const { token } = await createAdmin({ role: 'SCANNER' });
    const res = await request(app).get('/api/admin/auth/me').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('SCANNER');
  });

  it('lets admins (not scanners) create scanners, who can then log in', async () => {
    const { token: scannerToken } = await createAdmin({ role: 'SCANNER' });
    const { token: superToken } = await createAdmin({ role: 'SUPER_ADMIN' });
    const body = { name: 'Gate One', email: `gate1.${Date.now()}@kilf.dev`, password: 'GatePass@123' };

    const denied = await request(app).post('/api/admin/scanners').set(authHeader(scannerToken)).send(body);
    expect(denied.status).toBe(403);

    const created = await request(app).post('/api/admin/scanners').set(authHeader(superToken)).send(body);
    expect(created.status).toBe(201);
    expect(created.body.data.scanner.role).toBe('SCANNER');
    expect(created.body.data.scanner.passwordHash).toBeUndefined();
    expect(created.body.data.temporaryPassword).toBe(body.password);

    const dup = await request(app).post('/api/admin/scanners').set(authHeader(superToken)).send(body);
    expect(dup.status).toBe(409);

    const login = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: body.email, password: body.password });
    expect(login.status).toBe(200);
    expect(login.body.admin.role).toBe('SCANNER');

    const list = await request(app).get('/api/admin/scanners').set(authHeader(superToken));
    expect(list.body.data.some((s: { email: string }) => s.email === body.email)).toBe(true);
  });

  it('blocks a deactivated scanner', async () => {
    const { token: superToken } = await createAdmin({ role: 'SUPER_ADMIN' });
    const { admin, token } = await createAdmin({ role: 'SCANNER' });

    const off = await request(app)
      .patch(`/api/admin/scanners/${admin.id}`)
      .set(authHeader(superToken))
      .send({ isActive: false });
    expect(off.status).toBe(200);

    const res = await request(app)
      .post('/api/admin/tickets/verify')
      .set(authHeader(token))
      .send({ ticketNumber: 'LF-2026-000000' });
    expect(res.status).toBe(401);
  });

  it('cannot edit a non-scanner account through the scanner endpoint', async () => {
    const { token: superToken } = await createAdmin({ role: 'SUPER_ADMIN' });
    const { admin } = await createAdmin({ role: 'ADMIN' });
    const res = await request(app)
      .patch(`/api/admin/scanners/${admin.id}`)
      .set(authHeader(superToken))
      .send({ isActive: false });
    expect(res.status).toBe(404);
  });
});
