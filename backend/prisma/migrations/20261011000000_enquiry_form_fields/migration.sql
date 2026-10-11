-- Align enquiries with the website form: email/phone/organisation required, message optional
UPDATE "enquiries" SET "email" = '' WHERE "email" IS NULL;
UPDATE "enquiries" SET "phone" = '' WHERE "phone" IS NULL;
UPDATE "enquiries" SET "organisation" = '' WHERE "organisation" IS NULL;

ALTER TABLE "enquiries" ALTER COLUMN "email" SET NOT NULL,
ALTER COLUMN "phone" SET NOT NULL,
ALTER COLUMN "organisation" SET NOT NULL,
ALTER COLUMN "notes" DROP NOT NULL;
