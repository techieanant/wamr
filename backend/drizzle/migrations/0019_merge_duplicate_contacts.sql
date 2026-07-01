-- Merge duplicate contacts with the same contactName.
-- Before the fromMe fix, self-messages created contacts keyed on the bot's own
-- phone hash while normal messages used the sender's phone hash — two rows, same name.
--
-- Strategy: for each contactName with duplicates, keep the oldest contact (lowest id),
-- reassign request_history entries from the duplicates, then delete them.
-- Uses simple subqueries for broader SQLite compatibility.

-- Step 1: Update request_history entries that point to a duplicate contact hash
-- to instead point to the survivor hash (lowest id contact with that name).
UPDATE request_history
SET phone_number_hash = (
  SELECT c1.phone_number_hash
  FROM contacts c1
  WHERE c1.contact_name = (
    SELECT c2.contact_name
    FROM contacts c2
    WHERE c2.phone_number_hash = request_history.phone_number_hash
  )
  ORDER BY c1.id ASC
  LIMIT 1
)
WHERE phone_number_hash IN (
  SELECT c.phone_number_hash
  FROM contacts c
  WHERE c.contact_name IN (
    SELECT contact_name
    FROM contacts
    WHERE contact_name IS NOT NULL
    GROUP BY contact_name
    HAVING COUNT(*) > 1
  )
  AND c.id != (
    SELECT MIN(c3.id)
    FROM contacts c3
    WHERE c3.contact_name = c.contact_name
  )
);

-- Step 2: Delete duplicate contact rows (all but the lowest-id entry per name)
DELETE FROM contacts
WHERE id NOT IN (
  SELECT MIN(c.id)
  FROM contacts c
  GROUP BY c.contact_name
)
AND contact_name IS NOT NULL;
