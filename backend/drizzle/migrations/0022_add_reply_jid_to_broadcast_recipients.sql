-- Add reply_jid to broadcast_recipients. The schema defines replyJid on this
-- table (used as the fallback send target for LID-only contacts), but the
-- original 0020 migration omitted the column. Code inserts/selects it, so the
-- missing column crashed the broadcast scheduler tick on deployed databases
-- that were built purely from migrations.
ALTER TABLE `broadcast_recipients` ADD COLUMN `reply_jid` text;
