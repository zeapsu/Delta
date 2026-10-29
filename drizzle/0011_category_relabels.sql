CREATE TABLE `category_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`merchant_key` text NOT NULL,
	`category` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now', 'subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_rules_merchant_key_unique` ON `category_rules` (`merchant_key`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `plaid_category` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `category_override` text;--> statement-breakpoint
-- Everything so far is Plaid's own label.
UPDATE `transactions` SET `plaid_category` = `category`;
