-- Festival timezone for event-day calculation
ALTER TABLE "festivals" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- Ticket validity period and re-entry
ALTER TABLE "tickets" ADD COLUMN "validity_days" INTEGER;
ALTER TABLE "tickets" ADD COLUMN "allow_reentry" BOOLEAN NOT NULL DEFAULT false;

-- Per-day check-ins may repeat when re-entry is allowed
ALTER TABLE "ticket_check_ins" ADD COLUMN "entry_number" INTEGER NOT NULL DEFAULT 1;
DROP INDEX IF EXISTS "ticket_check_ins_ticket_instance_id_check_in_date_venue_key";
CREATE UNIQUE INDEX "ticket_check_ins_ticket_instance_id_check_in_date_venue_entry_number_key"
  ON "ticket_check_ins"("ticket_instance_id", "check_in_date", "venue", "entry_number");
