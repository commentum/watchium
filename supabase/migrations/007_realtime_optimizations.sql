-- Realtime optimizations and additional functions for WebSocket-first architecture

-- Enable Realtime on all tables
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE room_members;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
ALTER PUBLICATION supabase_realtime ADD TABLE sync_states;

-- Create optimized triggers for Realtime broadcasts
CREATE OR REPLACE FUNCTION broadcast_room_update()
RETURNS TRIGGER AS $$
BEGIN
    -- This will automatically trigger Realtime broadcasts
    -- No additional code needed - Supabase handles it
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Optimized heartbeat using presence instead of explicit table updates
CREATE OR REPLACE FUNCTION update_member_presence()
RETURNS TRIGGER AS $$
BEGIN
    -- Update last heartbeat and sync status
    NEW.last_heartbeat = NOW();
    
    -- Calculate sync status based on room state
    SELECT 
        current_playback_time, 
        is_playing 
    INTO NEW.current_playback_time, NEW.is_synced
    FROM rooms 
    WHERE room_id = NEW.room_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Replace heartbeat trigger with presence-based approach
DROP TRIGGER IF EXISTS on_heartbeat_update_activity ON room_members;
CREATE TRIGGER on_member_presence_update
    BEFORE UPDATE ON room_members
    FOR EACH ROW 
    WHEN (OLD.current_playback_time IS DISTINCT FROM NEW.current_playback_time OR OLD.last_heartbeat IS DISTINCT FROM NEW.last_heartbeat)
    EXECUTE FUNCTION update_member_presence();

-- Create function for bulk sync state updates (reduces individual calls)
CREATE OR REPLACE FUNCTION bulk_sync_update(
    p_room_id VARCHAR(10),
    p_host_time DECIMAL(10,2),
    p_sync_event_type VARCHAR(50)
)
RETURNS void AS $$
DECLARE
    member_record RECORD;
BEGIN
    -- Update all members' sync status in one query
    FOR member_record IN 
        SELECT user_id, current_playback_time 
        FROM room_members 
        WHERE room_id = p_room_id
    LOOP
        INSERT INTO sync_states (
            room_id, user_id, host_time, member_time, 
            time_difference, is_synced, sync_event_type
        ) VALUES (
            p_room_id, 
            member_record.user_id, 
            p_host_time, 
            member_record.current_playback_time,
            ABS(p_host_time - member_record.current_playback_time),
            ABS(p_host_time - member_record.current_playback_time) <= 2,
            p_sync_event_type
        );
    END LOOP;
    
    -- Update room activity
    UPDATE rooms 
    SET last_activity = NOW(), updated_at = NOW()
    WHERE room_id = p_room_id;
END;
$$ LANGUAGE plpgsql;

-- Create presence tracking function
CREATE OR REPLACE FUNCTION track_user_presence(
    p_room_id VARCHAR(10),
    p_user_id VARCHAR(100),
    p_current_time DECIMAL(10,2),
    p_is_playing BOOLEAN
)
RETURNS void AS $$
DECLARE
    room_record RECORD;
    time_diff DECIMAL(10,2);
    is_synced BOOLEAN;
BEGIN
    -- Get current room state
    SELECT * INTO room_record
    FROM rooms 
    WHERE room_id = p_room_id;
    
    IF NOT FOUND THEN
        RETURN;
    END IF;
    
    -- Calculate sync status
    time_diff := ABS(room_record.current_playback_time - p_current_time);
    is_synced := time_diff <= 2;
    
    -- Update member presence (this triggers Realtime)
    UPDATE room_members 
    SET 
        current_playback_time = p_current_time,
        is_synced = is_synced,
        last_heartbeat = NOW()
    WHERE room_id = p_room_id AND user_id = p_user_id;
    
    -- Create sync state record (for analytics)
    INSERT INTO sync_states (
        room_id, user_id, host_time, member_time,
        time_difference, is_synced, sync_event_type
    ) VALUES (
        p_room_id, p_user_id, room_record.current_playback_time, p_current_time,
        time_diff, is_synced, 'heartbeat'
    );
END;
$$ LANGUAGE plpgsql;

-- Optimized room state change function
CREATE OR REPLACE FUNCTION change_playback_state(
    p_room_id VARCHAR(10),
    p_user_id VARCHAR(100),
    p_is_playing BOOLEAN,
    p_current_time DECIMAL(10,2) DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    is_host BOOLEAN;
    room_record RECORD;
BEGIN
    -- Verify user is host
    SELECT is_host INTO is_host
    FROM room_members 
    WHERE room_id = p_room_id AND user_id = p_user_id;
    
    IF NOT FOUND OR NOT is_host THEN
        RETURN FALSE;
    END IF;
    
    -- Update room state (this triggers Realtime broadcast)
    UPDATE rooms 
    SET 
        is_playing = p_is_playing,
        current_playback_time = COALESCE(p_current_time, current_playback_time),
        updated_at = NOW()
    WHERE room_id = p_room_id
    RETURNING * INTO room_record;
    
    -- Bulk update all members' sync status
    PERFORM bulk_sync_update(p_room_id, room_record.current_playback_time, 'play_pause');
    
    -- Mark all members as needing sync (except host)
    UPDATE room_members 
    SET is_synced = false
    WHERE room_id = p_room_id AND user_id != p_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Optimized seek function
CREATE OR REPLACE FUNCTION seek_to_time(
    p_room_id VARCHAR(10),
    p_user_id VARCHAR(100),
    p_current_time DECIMAL(10,2)
)
RETURNS BOOLEAN AS $$
DECLARE
    is_host BOOLEAN;
    room_record RECORD;
BEGIN
    -- Validate input
    IF p_current_time < 0 THEN
        RETURN FALSE;
    END IF;
    
    -- Verify user is host
    SELECT is_host INTO is_host
    FROM room_members 
    WHERE room_id = p_room_id AND user_id = p_user_id;
    
    IF NOT FOUND OR NOT is_host THEN
        RETURN FALSE;
    END IF;
    
    -- Update room state (this triggers Realtime broadcast)
    UPDATE rooms 
    SET 
        current_playback_time = p_current_time,
        updated_at = NOW()
    WHERE room_id = p_room_id
    RETURNING * INTO room_record;
    
    -- Bulk update sync states
    PERFORM bulk_sync_update(p_room_id, p_current_time, 'seek');
    
    -- Mark all members as out of sync (except host)
    UPDATE room_members 
    SET is_synced = false
    WHERE room_id = p_room_id AND user_id != p_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Create function for getting room state with minimal queries
CREATE OR REPLACE FUNCTION get_room_sync_state(
    p_room_id VARCHAR(10),
    p_user_id VARCHAR(100)
)
RETURNS JSON AS $$
DECLARE
    room_record RECORD;
    member_record RECORD;
    member_count INTEGER;
    synced_count INTEGER;
    result JSON;
BEGIN
    -- Get room info first
    SELECT * INTO room_record
    FROM rooms 
    WHERE room_id = p_room_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object('error', 'Room not found');
    END IF;
    
    -- Get member info
    SELECT 
        user_id as member_user_id,
        username as member_username,
        is_synced as member_is_synced,
        current_playback_time as member_current_time
    INTO member_record
    FROM room_members 
    WHERE room_id = p_room_id AND user_id = p_user_id;
    
    -- Get member counts
    SELECT COUNT(*) INTO member_count
    FROM room_members 
    WHERE room_id = p_room_id;
    
    SELECT COUNT(*) INTO synced_count
    FROM room_members 
    WHERE room_id = p_room_id AND is_synced = true;
    
    -- Build result
    result := json_build_object(
        'room', json_build_object(
            'room_id', room_record.room_id,
            'current_time', room_record.current_playback_time,
            'is_playing', room_record.is_playing,
            'playback_speed', room_record.playback_speed,
            'anime_title', room_record.anime_title,
            'episode_number', room_record.episode_number
        ),
        'user_sync', json_build_object(
            'is_synced', COALESCE(member_record.member_is_synced, false),
            'time_difference', ABS(room_record.current_playback_time - COALESCE(member_record.member_current_time, 0)),
            'user_current_time', COALESCE(member_record.member_current_time, 0)
        ),
        'room_stats', json_build_object(
            'total_members', member_count,
            'synced_members', synced_count,
            'sync_percentage', CASE WHEN member_count > 0 THEN 
                ROUND((synced_members::float / member_count::float) * 100) ELSE 0 END
        ),
        'host_info', json_build_object(
            'user_id', room_record.host_user_id,
            'username', room_record.host_username
        )
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create optimized cleanup function
CREATE OR REPLACE FUNCTION cleanup_realtime_data()
RETURNS void AS $$
BEGIN
    -- Remove inactive members (no heartbeat for 30 seconds)
    DELETE FROM room_members 
    WHERE last_heartbeat < NOW() - INTERVAL '30 seconds';
    
    -- Remove old sync states (keep last 6 hours for analytics)
    DELETE FROM sync_states 
    WHERE created_at < NOW() - INTERVAL '6 hours';
    
    -- Remove empty rooms (no members for 1 hour)
    DELETE FROM rooms 
    WHERE room_id NOT IN (SELECT DISTINCT room_id FROM room_members)
    AND last_activity < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- Create index for presence queries
CREATE INDEX IF NOT EXISTS idx_room_members_presence 
ON room_members (room_id, last_heartbeat DESC, is_synced);

-- Create index for room state queries
CREATE INDEX IF NOT EXISTS idx_rooms_state 
ON rooms (room_id, is_playing, current_playback_time, updated_at DESC);

-- Grant necessary permissions for Realtime
GRANT SELECT ON rooms TO authenticated;
GRANT SELECT ON room_members TO authenticated;
GRANT SELECT ON comments TO authenticated;
GRANT SELECT ON sync_states TO authenticated;

-- Enable Row Level Security for Realtime
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_states ENABLE ROW LEVEL SECURITY;
