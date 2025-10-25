-- Add auto_approval_mode column to whatsapp_connections table
ALTER TABLE whatsapp_connections ADD COLUMN auto_approval_mode TEXT DEFAULT 'auto_approve' CHECK(auto_approval_mode IN ('auto_approve', 'auto_deny', 'manual'));
