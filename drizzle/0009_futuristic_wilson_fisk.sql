ALTER TABLE `transactions` ADD `category_detailed` text;--> statement-breakpoint
-- Backfill: replay each item's /transactions/sync history from the start so
-- existing rows pick up category_detailed (upserts by plaid_transaction_id).
UPDATE `items` SET `sync_cursor` = NULL;
