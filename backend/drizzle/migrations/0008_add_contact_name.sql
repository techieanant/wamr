-- Add contact_name column to request_history table
ALTER TABLE request_history ADD COLUMN contact_name TEXT;

-- Add contact_name column to conversation_sessions table
ALTER TABLE conversation_sessions ADD COLUMN contact_name TEXT;
