-- Bütçe dağıtımı kaldırıldı: otomatik esnek hesap kayıtları silinir, sistem zarfları normal kategoriye döner
DELETE FROM "transactions" WHERE "note" = 'Esnek hesaba gitti (otomatik)';--> statement-breakpoint
DELETE FROM "allocations" WHERE "envelope_id" IN (SELECT "id" FROM "envelopes" WHERE "system" = 'overdraft');--> statement-breakpoint
UPDATE "envelopes" SET "archived" = true WHERE "system" = 'overdraft';--> statement-breakpoint
UPDATE "envelopes" SET "system" = NULL WHERE "system" = 'payments';--> statement-breakpoint
UPDATE "users" SET "auto_allocate" = false;
