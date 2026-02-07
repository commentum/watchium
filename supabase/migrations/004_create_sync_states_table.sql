-- Create sync_states table for tracking synchronization data
CREATE TABLE sync_states (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id VARCHAR(10) NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    host_time DECIMAL(10,2) NOT NULL,
    member_time DECIMAL(10,2) NOT NULL,
    time_difference DECIMAL(10,2) NOT NULL,
    is_synced BOOLEAN NOT NULL,
    sync_event_type VARCHAR(50) NOT NULL, -- 'heartbeat', 'seek', 'play_pause'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_sync_states_room_id ON sync_states(room_id);
CREATE INDEX idx_sync_states_user_id ON sync_states(user_id);
CREATE INDEX idx_sync_states_created_at ON sync_states(created_at);
CREATE INDEX idx_sync_states_sync_event_type ON sync_states(sync_event_type);

-- Add constraints
ALTER TABLE sync_states ADD CONSTRAINT valid_sync_host_time CHECK (host_time >= 0);
ALTER TABLE sync_states ADD CONSTRAINT valid_sync_member_time CHECK (member_time >= 0);
ALTER TABLE sync_states ADD CONSTRAINT valid_sync_event_type CHECK (sync_event_type IN ('heartbeat', 'seek', 'play_pause', 'join', 'leave'));

-- Function to cleanup old sync states (keep last 24 hours)
CREATE OR REPLACE FUNCTION cleanup_old_sync_states()
RETURNS void AS $$
BEGIN
    DELETE FROM sync_states 
    WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job function (to be called by external scheduler)
CREATE OR REPLACE FUNCTION scheduled_cleanup_sync_states()
RETURNS void AS $$
BEGIN
    PERFORM cleanup_old_sync_states();
    
    -- Log the cleanup
    INSERT INTO sync_states (room_id, user_id, host_time, member_time, time_difference, is_synced, sync_event_type)
    SELECT 
        room_id, 'system' as user_id, 0, 0, 0, true, 'cleanup'
    FROM rooms 
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;