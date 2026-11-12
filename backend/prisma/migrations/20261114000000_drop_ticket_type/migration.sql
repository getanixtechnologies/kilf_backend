-- Ticket type is removed: pass rules come only from each ticket's own settings.
ALTER TABLE "tickets" DROP COLUMN "ticket_type";

DROP TYPE "TicketType";
