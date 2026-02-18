-- Configurable: mark linked session as online on connect (default off so phone keeps notifications)
ALTER TABLE whatsapp_connections ADD COLUMN mark_online_on_connect INTEGER DEFAULT 0 NOT NULL;
