-- Allow processing messages from self and from groups (opt-in, default off)
ALTER TABLE whatsapp_connections ADD COLUMN process_from_self INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE whatsapp_connections ADD COLUMN process_groups INTEGER DEFAULT 0 NOT NULL;
