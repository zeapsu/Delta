CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`plaid_account_id` text NOT NULL,
	`name` text NOT NULL,
	`official_name` text,
	`type` text NOT NULL,
	`subtype` text,
	`mask` text,
	`current_balance` integer,
	`available_balance` integer,
	`currency` text DEFAULT 'USD' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now', 'subsec') * 1000) NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_plaid_account_id_unique` ON `accounts` (`plaid_account_id`);--> statement-breakpoint
CREATE TABLE `balance_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`current_balance` integer NOT NULL,
	`snapshot_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category` text NOT NULL,
	`monthly_amount` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now', 'subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_category_unique` ON `budgets` (`category`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plaid_item_id` text NOT NULL,
	`access_token` text NOT NULL,
	`institution_name` text,
	`created_at` integer DEFAULT (unixepoch('now', 'subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_plaid_item_id_unique` ON `items` (`plaid_item_id`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`plaid_transaction_id` text NOT NULL,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`name` text NOT NULL,
	`merchant_name` text,
	`category` text,
	`pending` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch('now', 'subsec') * 1000) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_plaid_transaction_id_unique` ON `transactions` (`plaid_transaction_id`);--> statement-breakpoint
CREATE INDEX `transactions_account_id_date_idx` ON `transactions` (`account_id`,`date`);