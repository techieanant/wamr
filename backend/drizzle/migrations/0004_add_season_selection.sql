-- Add columns for season selection feature to conversation_sessions table
ALTER TABLE conversation_sessions ADD COLUMN available_seasons TEXT;
ALTER TABLE conversation_sessions ADD COLUMN selected_seasons TEXT;
