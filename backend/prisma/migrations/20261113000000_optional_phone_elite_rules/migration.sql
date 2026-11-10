-- Buyer phone is optional (guest accounts may have none).
ALTER TABLE "customers" ALTER COLUMN "phone" DROP NOT NULL;

-- Elite Pass is valid for the whole festival: no day of visit or show session.
UPDATE "tickets" SET "requires_date" = false, "requires_show_session" = false WHERE "ticket_type" = 'ELITE';
