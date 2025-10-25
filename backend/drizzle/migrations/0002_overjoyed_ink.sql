ALTER TABLE `media_service_configurations` ADD `max_results` integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `request_history` ADD `phone_number_encrypted` text;--> statement-breakpoint
ALTER TABLE `request_history` ADD `phone_number_iv` text;