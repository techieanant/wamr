CREATE TABLE IF NOT EXISTS `broadcasts` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `parent_id` integer,
  `label` text,
  `message_text` text NOT NULL,
  `schedule_type` text NOT NULL,
  `status` text NOT NULL,
  `send_at` text,
  `recurring_pattern` text,
  `recurring_time` text,
  `recurring_weekday` integer,
  `recurring_month_day` integer,
  `next_run_at` text,
  `throttle_ms` integer DEFAULT 2500 NOT NULL,
  `jitter_ms` integer DEFAULT 500 NOT NULL,
  `recipient_contact_ids` text DEFAULT '[]' NOT NULL,
  `total_recipients` integer DEFAULT 0 NOT NULL,
  `sent_count` integer DEFAULT 0 NOT NULL,
  `failed_count` integer DEFAULT 0 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_broadcast_status` ON `broadcasts` (`status`);
CREATE INDEX IF NOT EXISTS `idx_broadcast_parent` ON `broadcasts` (`parent_id`);
CREATE INDEX IF NOT EXISTS `idx_broadcast_send_at` ON `broadcasts` (`send_at`);
CREATE INDEX IF NOT EXISTS `idx_broadcast_next_run` ON `broadcasts` (`next_run_at`);

CREATE TABLE IF NOT EXISTS `broadcast_recipients` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `broadcast_id` integer NOT NULL REFERENCES `broadcasts`(`id`) ON DELETE CASCADE,
  `contact_id` integer NOT NULL,
  `phone` text,
  `contact_name` text,
  `status` text DEFAULT 'pending' NOT NULL,
  `error` text,
  `sent_at` text
);
CREATE INDEX IF NOT EXISTS `idx_broadcast_recip_broadcast` ON `broadcast_recipients` (`broadcast_id`);
CREATE INDEX IF NOT EXISTS `idx_broadcast_recip_status` ON `broadcast_recipients` (`status`);
