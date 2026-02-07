-- Create room_members table
CREATE TABLE room_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id VARCHAR(10) NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    username VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    is_host BOOLEAN DEFAULT false,
    is_synced BOOLEAN DEFAULT true,
    current_playback_time DECIMAL(10,2) DEFAULT 0,
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_room_members_room_id ON room_members(room_id);
CREATE INDEX idx_room_members_user_id ON room_members(user_id);
CREATE INDEX idx_room_members_last_heartbeat ON room_members(last_heartbeat);
CREATE INDEX idx_room_members_is_synced ON room_members(is_synced);

-- Add constraints
ALTER TABLE room_members ADD CONSTRAINT valid_member_current_playback_time CHECK (current_playback_time >= 0);
ALTER TABLE room_members ADD CONSTRAINT unique_room_user UNIQUE (room_id, user_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_room_members_updated_at 
    BEFORE UPDATE ON room_members 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
