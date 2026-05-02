-- Rename legacy service types to the unified 'seerr' type
-- Both overseerr and jellyseerr use the same /api/v1/ surface as seerr
UPDATE media_service_configurations SET service_type = 'seerr' WHERE service_type IN ('overseerr', 'jellyseerr');--> statement-breakpoint
UPDATE request_history SET service_type = 'seerr' WHERE service_type IN ('overseerr', 'jellyseerr');
