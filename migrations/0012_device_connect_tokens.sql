-- New-device links identify a pending one-time code without exposing a trip ID or access credential.
ALTER TABLE member_device_codes ADD COLUMN connect_token_hash TEXT;
CREATE UNIQUE INDEX member_device_codes_connect_token ON member_device_codes(connect_token_hash) WHERE connect_token_hash IS NOT NULL;
