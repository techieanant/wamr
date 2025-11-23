-- Migration: Add season notification tracking fields
-- Created: 2025-11-14
-- Purpose: Track which seasons have been notified about and total available seasons

-- Add notified_seasons column to track which seasons user has been notified about
ALTER TABLE request_history ADD COLUMN notified_seasons TEXT;

-- Add total_seasons column to track total available seasons (for detecting new season releases)
ALTER TABLE request_history ADD COLUMN total_seasons INTEGER;
