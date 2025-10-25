CREATE TABLE `admin_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`last_login_at` text
);
--> statement-breakpoint
CREATE TABLE `conversation_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`phone_number_hash` text NOT NULL,
	`state` text NOT NULL,
	`media_type` text,
	`search_query` text,
	`search_results` text,
	`selected_result_index` integer,
	`selected_result` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media_service_configurations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_type` text NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`api_key_encrypted` text NOT NULL,
	`api_key_iv` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`priority` integer NOT NULL,
	`quality_profile` text,
	`root_folder` text,
	`last_health_check` text,
	`health_status` text DEFAULT 'UNKNOWN' NOT NULL,
	`version` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `request_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`phone_number_hash` text NOT NULL,
	`media_type` text NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`tmdb_id` integer,
	`tvdb_id` integer,
	`service_type` text,
	`service_config_id` integer,
	`status` text NOT NULL,
	`conversation_log` text,
	`submitted_at` text,
	`error_message` text,
	`admin_notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `whatsapp_connections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`phone_number_hash` text NOT NULL,
	`status` text NOT NULL,
	`last_connected_at` text,
	`qr_code_generated_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_users_username_unique` ON `admin_users` (`username`);--> statement-breakpoint
CREATE INDEX `idx_admin_username` ON `admin_users` (`username`);--> statement-breakpoint
CREATE INDEX `idx_conversation_phone` ON `conversation_sessions` (`phone_number_hash`);--> statement-breakpoint
CREATE INDEX `idx_conversation_expires` ON `conversation_sessions` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_conversation_state` ON `conversation_sessions` (`state`);--> statement-breakpoint
CREATE INDEX `idx_service_type` ON `media_service_configurations` (`service_type`);--> statement-breakpoint
CREATE INDEX `idx_service_enabled` ON `media_service_configurations` (`enabled`);--> statement-breakpoint
CREATE INDEX `idx_service_priority` ON `media_service_configurations` (`priority`);--> statement-breakpoint
CREATE INDEX `idx_request_phone` ON `request_history` (`phone_number_hash`);--> statement-breakpoint
CREATE INDEX `idx_request_status` ON `request_history` (`status`);--> statement-breakpoint
CREATE INDEX `idx_request_created` ON `request_history` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_request_service` ON `request_history` (`service_config_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_connections_phone_number_hash_unique` ON `whatsapp_connections` (`phone_number_hash`);--> statement-breakpoint
CREATE INDEX `idx_whatsapp_phone` ON `whatsapp_connections` (`phone_number_hash`);