-- Migration: Add episode notification tracking field
-- Created: 2025-11-14
-- Purpose: Track which episodes have been notified about for weekly episode notifications

-- Add notified_episodes column to track which episodes user has been notified about
-- Structure: {"1": [1,2,3,4], "2": [1,2]} where keys are season numbers and values are arrays of episode numbers
ALTER TABLE request_history ADD COLUMN notified_episodes TEXT;
