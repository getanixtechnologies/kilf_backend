-- AlterTable
ALTER TABLE "admins" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('QR', 'MANUAL');
CREATE TYPE "VerificationAction" AS ENUM ('VERIFY', 'CHECK_IN');
CREATE TYPE "VerificationOutcome" AS ENUM ('VALID', 'CHECKED_IN', 'DUPLICATE', 'NOT_FOUND', 'INVALID');

-- CreateTable
CREATE TABLE "verification_logs" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT,
    "ticket_number" TEXT NOT NULL,
    "ticket_instance_id" TEXT,
    "method" "VerificationMethod" NOT NULL DEFAULT 'MANUAL',
    "action" "VerificationAction" NOT NULL,
    "outcome" "VerificationOutcome" NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "verification_logs_admin_id_idx" ON "verification_logs"("admin_id");
CREATE INDEX "verification_logs_ticket_number_idx" ON "verification_logs"("ticket_number");
CREATE INDEX "verification_logs_created_at_idx" ON "verification_logs"("created_at");

-- AddForeignKey
ALTER TABLE "verification_logs" ADD CONSTRAINT "verification_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
