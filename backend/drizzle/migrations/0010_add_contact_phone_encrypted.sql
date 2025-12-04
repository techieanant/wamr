-- 0010_add_contact_phone_encrypted.sql
ALTER TABLE contacts ADD COLUMN phone_number_encrypted TEXT;
-- No index necessary for encrypted value
