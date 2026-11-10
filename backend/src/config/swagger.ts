import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

const localServer = { url: `http://localhost:${env.PORT}`, description: 'Local development' };
const apiUrl = env.API_URL?.replace(/\/+$/, '');
// The configured API_URL is listed first so Swagger UI selects it by default;
// localhost stays available as a secondary choice.
const servers =
  apiUrl && apiUrl !== localServer.url
    ? [{ url: apiUrl, description: 'API server' }, localServer]
    : [localServer];

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Literature Festival API',
      version: '1.0.0',
      description:
        'REST API for the Literature Festival Admin Panel and public festival website: ' +
        'authentication, festival & ticket management, bookings, payments, check-in, sponsors and revenue.',
    },
    servers,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        ApiSuccess: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' },
            message: { type: 'string' },
          },
        },
        ApiError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            errors: { type: 'array', items: {} },
          },
        },
        GuestBooking: {
          type: 'object',
          properties: {
            bookingNumber: { type: 'string' },
            status: { type: 'string' },
            quantity: { type: 'integer' },
            subtotalAmount: { type: 'string' },
            gstAmount: { type: 'string' },
            totalAmount: { type: 'string' },
            currency: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            ticket: {
              type: 'object',
              properties: { name: { type: 'string' }, ticketType: { type: 'string' } },
            },
            festival: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                startDate: { type: 'string', format: 'date-time' },
                endDate: { type: 'string', format: 'date-time' },
              },
            },
            payment: {
              type: 'object',
              nullable: true,
              properties: {
                status: { type: 'string' },
                method: { type: 'string', nullable: true },
                razorpayPaymentId: { type: 'string', nullable: true },
                paidAt: { type: 'string', format: 'date-time', nullable: true },
              },
            },
            customer: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                email: { type: 'string' },
                phone: { type: 'string' },
              },
            },
            ticketInstances: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  ticketNumber: { type: 'string' },
                  qrCode: { type: 'string', description: 'QR data-URL image accepted by the checker scanner' },
                  status: { type: 'string' },
                  attendee: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      validDate: { type: 'string', format: 'date', nullable: true },
                    },
                  },
                  showSession: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      name: { type: 'string' },
                      startTime: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    tags: [
      { name: 'Admin Auth' },
      { name: 'Admin Dashboard' },
      { name: 'Admin Festivals' },
      { name: 'Admin Tickets' },
      { name: 'Admin Bookings' },
      { name: 'Admin Check-in' },
      { name: 'Admin Sponsors' },
      { name: 'Admin Revenue' },
      { name: 'Admin Audit Logs' },
      { name: 'Public Tickets' },
      { name: 'Public Bookings' },
      { name: 'Public Sponsors' },
      { name: 'Webhooks' },
    ],
  },
  apis: ['./src/routes/**/*.ts', './dist/routes/**/*.js'],
};

export const swaggerSpec = swaggerJsdoc(options);
