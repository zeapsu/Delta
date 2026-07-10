CREATE TABLE `investment_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`plaid_investment_transaction_id` text NOT NULL,
	`date` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`subtype` text NOT NULL,
	`security_name` text,
	`ticker_symbol` text,
	`quantity` real,
	`price` real,
	`amount` integer NOT NULL,
	`fees` integer,
	`currency` text DEFAULT 'USD' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now', 'subsec') * 1000) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `investment_transactions_plaid_investment_transaction_id_unique` ON `investment_transactions` (`plaid_investment_transaction_id`);--> statement-breakpoint
CREATE INDEX `investment_transactions_account_id_date_idx` ON `investment_transactions` (`account_id`,`date`);