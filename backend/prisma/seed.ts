import { PrismaClient, SponsorshipLevel } from '@prisma/client';
import { hashPassword } from '../src/utils/password';
import { generateBookingNumber, generateTicketNumber } from '../src/utils/idGenerators';
import { generateQrCodeDataUrl } from '../src/services/qrcode.service';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ---- Admin ----
  const adminPassword = 'Admin@12345';
  const admin = await prisma.admin.upsert({
    where: { email: 'admin@kilf.dev' },
    update: {},
    create: {
      name: 'Festival Admin',
      email: 'admin@kilf.dev',
      passwordHash: await hashPassword(adminPassword),
      role: 'SUPER_ADMIN',
    },
  });
  console.log(`Admin ready: ${admin.email} / ${adminPassword} (DEV ONLY - change in production)`);

  // ---- Gate scanner (can only verify / check in tickets) ----
  const scannerPassword = 'Scanner@12345';
  const scanner = await prisma.admin.upsert({
    where: { email: 'scanner@kilf.dev' },
    update: {},
    create: {
      name: 'Gate Scanner',
      email: 'scanner@kilf.dev',
      passwordHash: await hashPassword(scannerPassword),
      role: 'SCANNER',
    },
  });
  console.log(`Scanner ready: ${scanner.email} / ${scannerPassword} (DEV ONLY - change in production)`);

  // ---- Festival ----
  const now = new Date();
  const festival = await prisma.festival.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Kilf 2026',
      description:
        'A three-day celebration of literature, poetry, and storytelling featuring acclaimed ' +
        'authors, panel discussions, book launches, and workshops.',
      location: 'Bengaluru, India',
      venue: 'Bengaluru International Exhibition Centre',
      startDate: new Date(now.getFullYear() + 1, 1, 6),
      endDate: new Date(now.getFullYear() + 1, 1, 8),
      registrationStart: new Date(now.getFullYear(), now.getMonth(), 1),
      registrationEnd: new Date(now.getFullYear() + 1, 1, 5),
      bannerImage: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570',
      status: 'PUBLISHED',
    },
  });
  console.log(`Festival ready: ${festival.name}`);

  // ---- Tickets ----
  const ticketDefs: Array<{
    name: string;
    description: string;
    price: number;
    totalQuantity: number;
  }> = [
    {
      name: 'General Admission',
      description: 'Access to all main-stage sessions and the exhibition area.',
      price: 500,
      totalQuantity: 500,
    },
    {
      name: 'VIP Pass',
      description: 'Front-row seating, meet-the-author sessions, and a festival goodie bag.',
      price: 2500,
      totalQuantity: 100,
    },
    {
      name: 'Student Pass',
      description: 'Discounted entry for students with a valid ID.',
      price: 250,
      totalQuantity: 300,
    },
    {
      name: 'Early Bird Full Festival',
      description: 'All three days at a discounted early-bird rate.',
      price: 1200,
      totalQuantity: 150,
    },
    {
      name: 'Day Pass',
      description: 'Single-day access, choose any one festival day.',
      price: 300,
      totalQuantity: 400,
    },
    {
      name: 'Full Festival Pass',
      description: 'Unlimited access to all three days of the festival.',
      price: 1500,
      totalQuantity: 200,
    },
  ];

  const tickets = [];
  for (const def of ticketDefs) {
    const ticket = await prisma.ticket.upsert({
      where: { id: deterministicId('ticket', def.name) },
      update: {},
      create: {
        id: deterministicId('ticket', def.name),
        festivalId: festival.id,
        name: def.name,
        description: def.description,
        price: def.price,
        totalQuantity: def.totalQuantity,
        availableQuantity: def.totalQuantity,
        salesStart: new Date(now.getFullYear(), now.getMonth(), 1),
        salesEnd: new Date(now.getFullYear() + 1, 1, 5),
        status: 'ACTIVE',
      },
    });
    tickets.push(ticket);
  }
  console.log(`Tickets ready: ${tickets.length}`);

  // ---- Sample bookings + payments (confirmed, with ticket instances) ----
  const sampleCustomers = [
    { name: 'Aarav Sharma', email: 'aarav.sharma@example.com', phone: '+919876500001' },
    { name: 'Diya Patel', email: 'diya.patel@example.com', phone: '+919876500002' },
    { name: 'Rohan Gupta', email: 'rohan.gupta@example.com', phone: '+919876500003' },
    { name: 'Ananya Iyer', email: 'ananya.iyer@example.com', phone: '+919876500004' },
    { name: 'Kabir Singh', email: 'kabir.singh@example.com', phone: '+919876500005' },
  ];

  let seededBookings = 0;
  for (let i = 0; i < sampleCustomers.length; i += 1) {
    const customerDef = sampleCustomers[i];
    const ticket = tickets[i % tickets.length];
    const quantity = (i % 3) + 1;

    const customer = await prisma.customer.upsert({
      where: { email: customerDef.email },
      update: {},
      create: customerDef,
    });

    const bookingNumber = generateBookingNumber();
    const totalAmount = Number(ticket.price) * quantity;
    const isLastAsPending = i === sampleCustomers.length - 1;
    const isLastAsRefunded = i === sampleCustomers.length - 2;

    const booking = await prisma.booking.create({
      data: {
        bookingNumber,
        festivalId: festival.id,
        customerId: customer.id,
        status: isLastAsPending ? 'PENDING_PAYMENT' : isLastAsRefunded ? 'REFUNDED' : 'CONFIRMED',
        quantity,
        totalAmount,
        expiresAt: isLastAsPending ? new Date(Date.now() + 15 * 60 * 1000) : null,
        cancelledAt: isLastAsRefunded ? new Date() : null,
        cancelReason: isLastAsRefunded ? 'Refunded by admin (seed data)' : null,
        bookingItems: {
          create: [{ ticketId: ticket.id, quantity, unitPrice: ticket.price, subtotal: totalAmount }],
        },
      },
      include: { bookingItems: true },
    });

    if (!isLastAsPending) {
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { availableQuantity: { decrement: quantity } },
      });

      await prisma.payment.create({
        data: {
          bookingId: booking.id,
          provider: 'MOCK',
          providerPaymentId: `mock_pay_seed_${i}`,
          amount: totalAmount,
          status: isLastAsRefunded ? 'REFUNDED' : 'SUCCESS',
          refundedAmount: isLastAsRefunded ? totalAmount : 0,
        },
      });

      if (!isLastAsRefunded) {
        for (const item of booking.bookingItems) {
          for (let q = 0; q < item.quantity; q += 1) {
            const ticketNumber = generateTicketNumber();
            await prisma.ticketInstance.create({
              data: {
                bookingId: booking.id,
                bookingItemId: item.id,
                ticketId: item.ticketId,
                ticketNumber,
                qrCode: await generateQrCodeDataUrl(ticketNumber),
                status: 'VALID',
              },
            });
          }
        }
      }
    } else {
      await prisma.payment.create({
        data: {
          bookingId: booking.id,
          provider: 'MOCK',
          providerPaymentId: `mock_pay_seed_${i}`,
          amount: totalAmount,
          status: 'PENDING',
        },
      });
    }

    seededBookings += 1;
  }
  console.log(`Sample bookings ready: ${seededBookings}`);

  // ---- Sponsors ----
  const sponsorDefs: Array<{
    name: string;
    level: SponsorshipLevel;
    amount: number;
    displayOrder: number;
  }> = [
    { name: 'Penguin Random House', level: 'TITLE', amount: 1000000, displayOrder: 1 },
    { name: 'HarperCollins India', level: 'PLATINUM', amount: 500000, displayOrder: 2 },
    { name: 'Bloomsbury Publishing', level: 'GOLD', amount: 250000, displayOrder: 3 },
    { name: 'Café Coffee Day', level: 'SILVER', amount: 100000, displayOrder: 4 },
    { name: 'City Library Trust', level: 'BRONZE', amount: 50000, displayOrder: 5 },
    { name: 'Local Bookstore Collective', level: 'PARTNER', amount: 0, displayOrder: 6 },
  ];

  for (const def of sponsorDefs) {
    await prisma.sponsor.upsert({
      where: { id: deterministicId('sponsor', def.name) },
      update: {},
      create: {
        id: deterministicId('sponsor', def.name),
        festivalId: festival.id,
        name: def.name,
        description: `${def.name} is proud to support Kilf 2026 as a ${def.level.toLowerCase()} sponsor.`,
        websiteUrl: 'https://example.com',
        contactName: 'Partnerships Team',
        contactEmail: `partnerships@${def.name.toLowerCase().replace(/[^a-z]+/g, '')}.example.com`,
        contactPhone: '+911234567890',
        sponsorshipLevel: def.level,
        amount: def.amount,
        status: 'ACTIVE',
        displayOrder: def.displayOrder,
      },
    });
  }
  console.log(`Sponsors ready: ${sponsorDefs.length}`);

  console.log('Seeding complete.');
}

/** Deterministic UUID-shaped id so re-running the seed is idempotent via upsert. */
function deterministicId(namespace: string, key: string): string {
  const crypto = require('crypto') as typeof import('crypto');
  const hash = crypto.createHash('md5').update(`${namespace}:${key}`).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
