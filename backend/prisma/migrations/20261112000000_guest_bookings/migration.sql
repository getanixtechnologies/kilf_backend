-- AlterTable
ALTER TABLE "guests" ADD COLUMN "phone" TEXT;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN "guest_id" TEXT;

-- CreateIndex
CREATE INDEX "bookings_guest_id_idx" ON "bookings"("guest_id");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: link existing bookings to the guest account with the same email.
UPDATE "bookings" b
SET "guest_id" = g."id"
FROM "customers" c, "guests" g
WHERE b."customer_id" = c."id"
  AND lower(c."email") = lower(g."email")
  AND b."guest_id" IS NULL;
