import request from 'supertest';
import { createApp } from '../../src/app';
import { createAdmin, authHeader } from '../utils/factories';

const app = createApp();

const valid = { name: 'John Doe', email: 'John@Example.com', phone: '+46 70 123 4567', organisation: 'Acme', notes: 'Need more info.' };

describe('Enquiries', () => {
  it('creates an enquiry and returns 201 with id and pending status', async () => {
    const res = await request(app).post('/api/enquiries').send(valid);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      message: 'Enquiry submitted successfully',
      data: { status: 'PENDING' },
    });
    expect(res.body.data.id).toBeTruthy();
  });

  it('requires name, email, phone and organisation; topic and message are optional', async () => {
    for (const missing of ['name', 'email', 'phone', 'organisation']) {
      const res = await request(app).post('/api/enquiries').send({ ...valid, [missing]: undefined });
      expect(res.status).toBe(400);
    }
    const { notes: _notes, ...noNotes } = valid;
    expect((await request(app).post('/api/enquiries').send(noNotes)).status).toBe(201);
  });

  it('returns validation errors for bad input', async () => {
    for (const bad of [{ name: 'J' }, { organisation: '' }, { email: 'nope' }, { phone: 'abc' }]) {
      const res = await request(app).post('/api/enquiries').send({ ...valid, ...bad });
      expect(res.status).toBe(400);
    }
  });

  it('sanitises HTML and normalises contact fields', async () => {
    await request(app).post('/api/enquiries').send({ ...valid, notes: '<script>x</script>Hello there' });
    const { token } = await createAdmin();
    const list = await request(app).get('/api/admin/enquiries').set(authHeader(token));
    expect(list.body.data[0]).toMatchObject({ email: 'john@example.com', phone: '+46701234567', notes: 'xHello there' });
  });

  it('admin can list, view, update status and delete', async () => {
    const created = await request(app).post('/api/enquiries').send(valid);
    const id = created.body.data.id;
    const { token } = await createAdmin({ role: 'SUPER_ADMIN' });

    expect((await request(app).get('/api/admin/enquiries')).status).toBe(401);
    expect((await request(app).get(`/api/admin/enquiries/${id}`).set(authHeader(token))).status).toBe(200);

    const upd = await request(app)
      .patch(`/api/admin/enquiries/${id}/status`)
      .set(authHeader(token))
      .send({ status: 'RESOLVED' });
    expect(upd.body.data.status).toBe('RESOLVED');

    const filtered = await request(app).get('/api/admin/enquiries?status=PENDING').set(authHeader(token));
    expect(filtered.body.data).toHaveLength(0);

    expect((await request(app).delete(`/api/admin/enquiries/${id}`).set(authHeader(token))).status).toBe(200);
    expect((await request(app).get(`/api/admin/enquiries/${id}`).set(authHeader(token))).status).toBe(404);
  });
});
