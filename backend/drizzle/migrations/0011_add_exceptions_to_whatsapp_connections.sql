-- Add exceptions configuration to whatsapp_connections
ALTER TABLE whatsapp_connections ADD COLUMN exceptions_enabled INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE whatsapp_connections ADD COLUMN exception_contacts TEXT DEFAULT '[]';