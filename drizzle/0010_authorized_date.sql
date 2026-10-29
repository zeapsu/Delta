ALTER TABLE `transactions` ADD `authorized_date` text;--> statement-breakpoint
-- Backfill: restart every item's /transactions/sync from the beginning so the
-- next sync replays (upserts) the full history with authorized_date filled in.
UPDATE `items` SET `sync_cursor` = NULL;
