-- AlterTable
ALTER TABLE "tickets" ADD COLUMN "id_prefix" VARCHAR(10);

-- CreateIndex
CREATE UNIQUE INDEX "tickets_id_prefix_key" ON "tickets"("id_prefix");
