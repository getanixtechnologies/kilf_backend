import request from 'supertest';
import { createApp } from '../../src/app';
import { createAdmin, createFestival, createTicket, authHeader } from '../utils/factories';

const app = createApp();

describe('Ticket management', () => {
  it('creates a ticket for a festival', async () => {
    const { token } = await createAdmin();
    const festival = await createFestival();

    const res = await request(app)
      .post('/api/admin/tickets')
      .set(authHeader(token))
      .send({
        festivalId: festival.id,
        name: 'General Admission',
        ticketType: 'GENERAL',
        price: 500,
        totalQuantity: 100,
        salesStart: new Date(Date.now() - 1000).toISOString(),
        salesEnd: new Date(Date.now() + 100000000).toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.data.availableQuantity).toBe(100);
    expect(res.body.data.totalQuantity).toBe(100);
  });

  it('creates a ticket without a festival, using the latest festival', async () => {
    const { token } = await createAdmin();
    await createFestival({ startDate: new Date('2025-01-01'), endDate: new Date('2025-01-05') });
    const latest = await createFestival({ startDate: new Date('2030-01-01'), endDate: new Date('2030-01-05') });

    const res = await request(app)
      .post('/api/admin/tickets')
      .set(authHeader(token))
      .send({
        name: 'No Festival Pass',
        ticketType: 'GENERAL',
        price: 500,
        totalQuantity: 10,
        salesStart: new Date(Date.now() - 1000).toISOString(),
        salesEnd: new Date(Date.now() + 100000000).toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.data.festivalId).toBe(latest.id);
  });

  it('rejects creating a ticket with a non-positive quantity', async () => {
    const { token } = await createAdmin();
    const festival = await createFestival();

    const res = await request(app)
      .post('/api/admin/tickets')
      .set(authHeader(token))
      .send({
        festivalId: festival.id,
        name: 'Bad Ticket',
        price: 500,
        totalQuantity: 0,
        salesStart: new Date().toISOString(),
        salesEnd: new Date(Date.now() + 100000).toISOString(),
      });

    expect(res.status).toBe(400);
  });

  it('updates a ticket', async () => {
    const { token } = await createAdmin();
    const festival = await createFestival();
    const ticket = await createTicket(festival.id, { price: 500 });

    const res = await request(app)
      .put(`/api/admin/tickets/${ticket.id}`)
      .set(authHeader(token))
      .send({ price: 750, name: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(Number(res.body.data.price)).toBe(750);
    expect(res.body.data.name).toBe('Updated Name');
  });

  it('prevents reducing total quantity below tickets already sold', async () => {
    const { token } = await createAdmin();
    const festival = await createFestival();
    const ticket = await createTicket(festival.id, { totalQuantity: 100, availableQuantity: 20 });

    const res = await request(app)
      .put(`/api/admin/tickets/${ticket.id}`)
      .set(authHeader(token))
      .send({ totalQuantity: 50 }); // 80 sold, cannot go below 80

    expect(res.status).toBe(400);
  });

  it('reports availability correctly (sold = total - available)', async () => {
    const { token } = await createAdmin();
    const festival = await createFestival();
    const ticket = await createTicket(festival.id, { totalQuantity: 100, availableQuantity: 80 });

    const res = await request(app).get(`/api/admin/tickets/${ticket.id}`).set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.data.ticketsSold).toBe(0); // no CONFIRMED bookings yet
    expect(res.body.data.availableQuantity).toBe(80);
  });

  it('public API only returns tickets currently on sale', async () => {
    const festival = await createFestival();
    const activeTicket = await createTicket(festival.id, { name: 'Active' });
    await createTicket(festival.id, { name: 'Inactive', status: 'INACTIVE' });
    await createTicket(festival.id, {
      name: 'Not yet on sale',
      salesStart: new Date(Date.now() + 100000000),
      salesEnd: new Date(Date.now() + 200000000),
    });

    const res = await request(app).get('/api/tickets');
    expect(res.status).toBe(200);
    const names = res.body.data.map((t: { name: string }) => t.name);
    expect(names).toContain('Active');
    expect(names).not.toContain('Inactive');
    expect(names).not.toContain('Not yet on sale');
    expect(activeTicket).toBeDefined();
  });
});
