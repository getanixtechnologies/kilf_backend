import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createAdmin, createFestival, createTicket, authHeader, attendees } from '../utils/factories';

const app = createApp();

function customerPayload(email: string) {
  return { name: 'Revenue Tester', email, phone: '+919876543210' };
}

describe('Revenue calculations', () => {
  it('computes gross revenue and average ticket value from confirmed bookings', async () => {
    const { token } = await createAdmin();
    const festival = await createFestival();
    const ticket = await createTicket(festival.id, { price: 500, totalQuantity: 10, availableQuantity: 10 });

    await request(app)
      .post('/api/bookings')
      .send({ ticketId: ticket.id, quantity: 2, attendees: attendees(2), customer: customerPayload('r1@example.com') });
    await request(app)
      .post('/api/bookings')
      .send({ ticketId: ticket.id, quantity: 1, attendees: attendees(1), customer: customerPayload('r2@example.com') });

    const res = await request(app).get('/api/admin/revenue/summary').set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.data.grossRevenue).toBe(1500); // (2+1) * 500
    expect(res.body.data.ticketsSold).toBe(3);
    expect(res.body.data.averageTicketValue).toBe(500);
    expect(res.body.data.refunds).toBe(0);
    expect(res.body.data.netRevenue).toBe(1500);
  });

  it('excludes failed payments from gross revenue', async () => {
    const { token } = await createAdmin();
    const festival = await createFestival();
    const ticket = await createTicket(festival.id, { price: 500, totalQuantity: 10, availableQuantity: 10 });

    await request(app)
      .post('/api/bookings')
      .send({ ticketId: ticket.id, quantity: 1, attendees: attendees(1), customer: customerPayload('fail-revenue@example.com') });

    const res = await request(app).get('/api/admin/revenue/summary').set(authHeader(token));
    expect(res.body.data.grossRevenue).toBe(0);
    expect(res.body.data.ticketsSold).toBe(0);
  });

  it('subtracts refunds from net revenue but keeps them in gross', async () => {
    const { token } = await createAdmin();
    const festival = await createFestival();
    const ticket = await createTicket(festival.id, { price: 1000, totalQuantity: 10, availableQuantity: 10 });

    const bookingRes = await request(app)
      .post('/api/bookings')
      .send({ ticketId: ticket.id, quantity: 1, attendees: attendees(1), customer: customerPayload('r3@example.com') });
    const booking = await prisma.booking.findUnique({
      where: { bookingNumber: bookingRes.body.data.booking.bookingNumber },
    });

    await request(app)
      .post(`/api/admin/bookings/${booking!.id}/refund`)
      .set(authHeader(token))
      .send({ reason: 'test refund' });

    const res = await request(app).get('/api/admin/revenue/summary').set(authHeader(token));
    expect(res.body.data.grossRevenue).toBe(1000);
    expect(res.body.data.refunds).toBe(1000);
    expect(res.body.data.netRevenue).toBe(0);
  });

  it('breaks revenue down by ticket', async () => {
    const { token } = await createAdmin();
    const festival = await createFestival();
    const general = await createTicket(festival.id, {
      name: 'General',
      price: 500,
      totalQuantity: 10,
      availableQuantity: 10,
    });
    const vip = await createTicket(festival.id, {
      name: 'VIP',
      price: 2000,
      totalQuantity: 10,
      availableQuantity: 10,
    });

    await request(app)
      .post('/api/bookings')
      .send({ ticketId: general.id, quantity: 2, attendees: attendees(2), customer: customerPayload('g@example.com') });
    await request(app)
      .post('/api/bookings')
      .send({ ticketId: vip.id, quantity: 1, attendees: attendees(1), customer: customerPayload('v@example.com') });

    const res = await request(app).get('/api/admin/revenue/tickets').set(authHeader(token));
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.data.map((r: { name: string; revenue: number }) => [r.name, r.revenue]));
    expect(byName['General']).toBe(1000);
    expect(byName['VIP']).toBe(2000);
  });
});
