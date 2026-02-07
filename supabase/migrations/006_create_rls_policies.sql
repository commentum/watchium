-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_states ENABLE ROW LEVEL SECURITY;

-- Rooms table policies
CREATE POLICY "Anyone can view public rooms" ON rooms
    FOR SELECT USING (is_public = true);

CREATE POLICY "Anyone can view rooms with access key" ON rooms
    FOR SELECT USING (
        is_public = false AND 
        access_key IS NOT NULL
    );

CREATE POLICY "Anyone can create rooms" ON rooms
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Host can update room" ON rooms
    FOR UPDATE USING (
        host_user_id = current_setting('app.current_user_id', true)
    );

CREATE POLICY "Host can delete room" ON rooms
    FOR DELETE USING (
        host_user_id = current_setting('app.current_user_id', true)
    );

-- Room members table policies
CREATE POLICY "Anyone can view room members" ON room_members
    FOR SELECT USING (true);

CREATE POLICY "Anyone can join room" ON room_members
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own member status" ON room_members
    FOR UPDATE USING (
        user_id = current_setting('app.current_user_id', true)
    );

CREATE POLICY "Users can leave room" ON room_members
    FOR DELETE USING (
        user_id = current_setting('app.current_user_id', true)
    );

-- Comments table policies
CREATE POLICY "Anyone can view comments" ON comments
    FOR SELECT USING (true);

CREATE POLICY "Anyone can create comments" ON comments
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own comments" ON comments
    FOR UPDATE USING (
        user_id = current_setting('app.current_user_id', true) AND
        is_system_message = false
    );

CREATE POLICY "Users can delete their own comments" ON comments
    FOR DELETE USING (
        user_id = current_setting('app.current_user_id', true) AND
        is_system_message = false
    );

-- Sync states table policies
CREATE POLICY "Anyone can view sync states" ON sync_states
    FOR SELECT USING (true);

CREATE POLICY "Anyone can create sync states" ON sync_states
    FOR INSERT WITH CHECK (true);

-- Create function to check room access
CREATE OR REPLACE FUNCTION check_room_access(
    p_room_id VARCHAR(10),
    p_access_key VARCHAR(6) DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    room_exists BOOLEAN;
    is_public BOOLEAN;
    required_key VARCHAR(6);
BEGIN
    SELECT is_public, access_key, true INTO is_public, required_key, room_exists
    FROM rooms 
    WHERE room_id = p_room_id;
    
    IF NOT room_exists THEN
        RETURN false;
    END IF;
    
    -- Public rooms are always accessible
    IF is_public THEN
        RETURN true;
    END IF;
    
    -- Private rooms require correct access key
    IF p_access_key IS NOT NULL AND p_access_key = required_key THEN
        RETURN true;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function for rate limiting
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_user_id VARCHAR(100),
    p_action VARCHAR(50),
    p_window_minutes INTEGER DEFAULT 1,
    p_max_requests INTEGER DEFAULT 60
)
RETURNS BOOLEAN AS $$
DECLARE
    request_count INTEGER;
BEGIN
    -- Count requests in the time window
    SELECT COUNT(*) INTO request_count
    FROM sync_states
    WHERE user_id = p_user_id
        AND sync_event_type = p_action
        AND created_at > NOW() - INTERVAL '1 minute' * p_window_minutes;
    
    RETURN request_count < p_max_requests;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to cleanup inactive rooms
CREATE OR REPLACE FUNCTION cleanup_inactive_rooms()
RETURNS void AS $$
DECLARE
    inactive_rooms RECORD;
BEGIN
    -- Delete rooms inactive for more than 24 hours
    FOR inactive_rooms IN 
        SELECT room_id 
        FROM rooms 
        WHERE last_activity < NOW() - INTERVAL '24 hours'
    LOOP
        -- Delete room members (cascade will handle room deletion)
        DELETE FROM room_members WHERE room_id = inactive_rooms.room_id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;