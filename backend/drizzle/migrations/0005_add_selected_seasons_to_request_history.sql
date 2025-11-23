-- Add selected_seasons column to request_history table for tracking season selections in TV series requests
ALTER TABLE request_history ADD COLUMN selected_seasons TEXT;
