-- Create useful functions and triggers for room management

-- Function to generate unique room ID
CREATE OR REPLACE FUNCTION generate_room_id()
RETURNS VARCHAR(10) AS $$
DECLARE
    new_id VARCHAR(10);
    id_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate 10-character alphanumeric ID
        new_id := substring(
            md5(random()::text) 
            FROM (floor(random() * 20) + 1)::int 
            FOR 10
        );
        
        -- Replace numbers with letters for better readability
        new_id := translate(new_id, '0123456789', 'abcdefghij');
        
        -- Check if ID already exists
        SELECT EXISTS(SELECT 1 FROM rooms WHERE room_id = new_id) INTO id_exists;
        
        IF NOT id_exists THEN
            EXIT;
        END IF;
    END LOOP;
    
    RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- Function to generate 6-digit access key
CREATE OR REPLACE FUNCTION generate_access_key()
RETURNS VARCHAR(6) AS $$
BEGIN
    RETURN floor(random() * 1000000)::text;
END;
$$ LANGUAGE plpgsql;

-- Function to transfer host when original host leaves
CREATE OR REPLACE FUNCTION transfer_host_on_leave()
RETURNS TRIGGER AS $$
DECLARE
    new_host_id VARCHAR(100);
    new_host_username VARCHAR(100);
    member_count INTEGER;
BEGIN
    -- Check if leaving member was the host
    IF OLD.is_host = true THEN
        -- Count remaining members
        SELECT COUNT(*) INTO member_count
        FROM room_members 
        WHERE room_id = OLD.room_id AND user_id != OLD.user_id;
        
        IF member_count > 0 THEN
            -- Select the oldest member as new host
            SELECT user_id, username INTO new_host_id, new_host_username
            FROM room_members 
            WHERE room_id = OLD.room_id AND user_id != OLD.user_id
            ORDER BY joined_at ASC
            LIMIT 1;
            
            -- Update new host
            UPDATE room_members 
            SET is_host = true 
            WHERE room_id = OLD.room_id AND user_id = new_host_id;
            
            -- Update rooms table
            UPDATE rooms 
            SET host_user_id = new_host_id, 
                host_username = new_host_username
            WHERE room_id = OLD.room_id;
            
            -- Create system comment about host transfer
            INSERT INTO comments (
                anime_id, room_id, episode_number, user_id, username, 
                message, is_system_message
            )
            SELECT 
                anime_id, room_id, episode_number, 'system', 'System',
                new_host_username || ' became the new host',
                true
            FROM rooms 
            WHERE room_id = OLD.room_id;
        ELSE
            -- No members left, mark room for deletion
            UPDATE rooms 
            SET last_activity = NOW() - INTERVAL '25 hours' -- Will be cleaned up
            WHERE room_id = OLD.room_id;
        END IF;
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for host transfer
CREATE TRIGGER on_member_leave_transfer_host
    AFTER DELETE ON room_members
    FOR EACH ROW EXECUTE FUNCTION transfer_host_on_leave();

-- Function to update room activity
CREATE OR REPLACE FUNCTION update_room_activity()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE rooms 
    SET last_activity = NOW(), updated_at = NOW()
    WHERE room_id = NEW.room_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for activity updates
CREATE TRIGGER on_member_join_update_activity
    AFTER INSERT ON room_members
    FOR EACH ROW EXECUTE FUNCTION update_room_activity();

CREATE TRIGGER on_heartbeat_update_activity
    AFTER UPDATE ON room_members
    FOR EACH ROW 
    WHEN (OLD.last_heartbeat IS DISTINCT FROM NEW.last_heartbeat)
    EXECUTE FUNCTION update_room_activity();