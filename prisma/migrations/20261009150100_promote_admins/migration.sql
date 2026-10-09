-- Existing beheerders could see every customer, so they become superbeheerders and keep that access.
-- (Separate migration: a new enum value cannot be used in the transaction that adds it.)
UPDATE "User" SET "role" = 'SUPERADMIN' WHERE "role" = 'ADMIN';
