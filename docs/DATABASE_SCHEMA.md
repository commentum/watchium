# Database Schema

Complete database architecture guide for the Watchium real-time anime watching platform.

## Overview

The database is designed for high-concurrency real-time applications with optimized indexing, triggers, and row-level security. Built on PostgreSQL with Supabase extensions.

## Table Structure

### Rooms Table

Stores room information and playback state.

```sql
CREATE TABLE rooms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id VARCHAR(10) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    anime_id VARCHAR(100) NOT NULL,
    anime_title VARCHAR(255) NOT NULL,
    episode_number INTEGER NOT NULL DEFAULT 1,
    video_url TEXT NOT NULL,
    source_id VARCHAR(100),
    host_user_id VARCHAR(100) NOT NULL,
    host_username VARCHAR(100) NOT NULL,
    is_public BOOLEAN DEFAULT true,
    access_key VARCHAR(6),
    current_playback_time DECIMAL(10,2) DEFAULT 0,
    is_playing BOOLEAN DEFAULT false,
    playback_speed DECIMAL(3,2) DEFAULT 1.0,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Fields

| Field | Type | Description | Index |
|-------|------|-------------|--------|
| `id` | UUID | Primary key | - |
| `room_id` | VARCHAR(10) | Unique room identifier | ✅ |
| `title` | VARCHAR(255) | Room display title | - |
| `anime_id` | VARCHAR(100) | Anime identifier | ✅ |
| `anime_title` | VARCHAR(255) | Anime title | - |
| `episode_number` | INTEGER | Episode number | - |
| `video_url` | TEXT | Video source URL | - |
| `source_id` | VARCHAR(100) | Optional source identifier | - |
| `host_user_id` | VARCHAR(100) | Host user ID | ✅ |
| `host_username` | VARCHAR(100) | Host username | - |
| `is_public` | BOOLEAN | Public room flag | ✅ |
| `access_key` | VARCHAR(6) | 6-digit access key for private rooms | - |
| `current_playback_time` | DECIMAL(10,2) | Current playback time in seconds | ✅ |
| `is_playing` | BOOLEAN | Playback state | ✅ |
| `playback_speed` | DECIMAL(3,2) | Playback speed multiplier | - |
| `last_activity` | TIMESTAMP WITH TIME ZONE | Last activity timestamp | ✅ |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp | - |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Last update timestamp | - |

#### Constraints

```sql
ALTER TABLE rooms ADD CONSTRAINT valid_episode_number CHECK (episode_number > 0);
ALTER TABLE rooms ADD CONSTRAINT valid_current_playback_time CHECK (current_playback_time >= 0);
ALTER TABLE rooms ADD CONSTRAINT valid_playback_speed CHECK (playback_speed > 0);
ALTER TABLE rooms ADD CONSTRAINT unique_room_id UNIQUE (room_id);
ALTER TABLE rooms ADD CONSTRAINT valid_access_key CHECK (
    is_public = true OR (is_public = false AND access_key IS NOT NULL AND length(access_key) = 6)
);
```

### Room Members Table

Tracks room participants and their sync status.

```sql
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
```

#### Fields

| Field | Type | Description | Index |
|-------|------|-------------|--------|
| `id` | UUID | Primary key | - |
| `room_id` | VARCHAR(10) | Room reference | ✅ |
| `user_id` | VARCHAR(100) | User identifier | ✅ |
| `username` | VARCHAR(100) | Display username | - |
| `avatar_url` | TEXT | Profile picture URL | - |
| `is_host` | BOOLEAN | Host flag | - |
| `is_synced` | BOOLEAN | Sync status | ✅ |
| `current_playback_time` | DECIMAL(10,2) | User's current playback time | - |
| `last_heartbeat` | TIMESTAMP WITH TIME ZONE | Last presence update | ✅ |
| `joined_at` | TIMESTAMP WITH TIME ZONE | Join timestamp | - |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Last update timestamp | - |

#### Constraints

```sql
ALTER TABLE room_members ADD CONSTRAINT valid_member_current_playback_time CHECK (current_playback_time >= 0);
ALTER TABLE room_members ADD CONSTRAINT unique_room_user UNIQUE (room_id, user_id);
```

### Comments Table

Stores threaded comments with episode-based organization.

```sql
CREATE TABLE comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    anime_id VARCHAR(100) NOT NULL,
    room_id VARCHAR(10) REFERENCES rooms(room_id) ON DELETE SET NULL,
    episode_number INTEGER NOT NULL,
    parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    username VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    message TEXT NOT NULL,
    video_timestamp DECIMAL(10,2),
    is_anchor BOOLEAN DEFAULT false,
    is_system_message BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Fields

| Field | Type | Description | Index |
|-------|------|-------------|--------|
| `id` | UUID | Primary key | - |
| `anime_id` | VARCHAR(100) | Anime identifier | ✅ |
| `room_id` | VARCHAR(10) | Room reference | ✅ |
| `episode_number` | INTEGER | Episode number | ✅ |
| `parent_id` | UUID | Parent comment for threading | ✅ |
| `user_id` | VARCHAR(100) | Author user ID | ✅ |
| `username` | VARCHAR(100) | Author username | - |
| `avatar_url` | TEXT | Author avatar | - |
| `message` | TEXT | Comment content | - |
| `video_timestamp` | DECIMAL(10,2) | Optional timestamp in video | ✅ |
| `is_anchor` | BOOLEAN | Thread anchor message | ✅ |
| `is_system_message` | BOOLEAN | System-generated message | - |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp | ✅ |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Last update timestamp | - |

#### Constraints

```sql
ALTER TABLE comments ADD CONSTRAINT valid_comment_episode CHECK (episode_number > 0);
ALTER TABLE comments ADD CONSTRAINT valid_video_timestamp CHECK (video_timestamp IS NULL OR video_timestamp >= 0);
ALTER TABLE comments ADD CONSTRAINT non_empty_message CHECK (length(trim(message)) > 0);
```

### Sync States Table

Tracks synchronization data for analytics and debugging.

```sql
CREATE TABLE sync_states (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id VARCHAR(10) NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    host_time DECIMAL(10,2) NOT NULL,
    member_time DECIMAL(10,2) NOT NULL,
    time_difference DECIMAL(10,2) NOT NULL,
    is_synced BOOLEAN NOT NULL,
    sync_event_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Fields

| Field | Type | Description | Index |
|-------|------|-------------|--------|
| `id` | UUID | Primary key | - |
| `room_id` | VARCHAR(10) | Room reference | ✅ |
| `user_id` | VARCHAR(100) | User identifier | ✅ |
| `host_time` | DECIMAL(10,2) | Host's playback time | - |
| `member_time` | DECIMAL(10,2) | Member's playback time | - |
| `time_difference` | DECIMAL(10,2) | Time difference | - |
| `is_synced` | BOOLEAN | Sync status | - |
| `sync_event_type` | VARCHAR(50) | Event type | ✅ |
| `created_at` | TIMESTAMP WITH TIME ZONE | Creation timestamp | ✅ |

#### Constraints

```sql
ALTER TABLE sync_states ADD CONSTRAINT valid_sync_host_time CHECK (host_time >= 0);
ALTER TABLE sync_states ADD CONSTRAINT valid_sync_member_time CHECK (member_time >= 0);
ALTER TABLE sync_states ADD CONSTRAINT valid_sync_event_type CHECK (sync_event_type IN ('heartbeat', 'seek', 'play_pause', 'join', 'leave'));
```

## Indexes

### Performance Indexes

```sql
-- Rooms table indexes
CREATE INDEX idx_rooms_room_id ON rooms(room_id);
CREATE INDEX idx_rooms_anime_id ON rooms(anime_id);
CREATE INDEX idx_rooms_is_public ON rooms(is_public);
CREATE INDEX idx_rooms_last_activity ON rooms(last_activity);
CREATE INDEX idx_rooms_host_user_id ON rooms(host_user_id);
CREATE INDEX idx_rooms_state ON rooms(room_id, is_playing, current_playback_time, updated_at DESC);

-- Room members indexes
CREATE INDEX idx_room_members_room_id ON room_members(room_id);
CREATE INDEX idx_room_members_user_id ON room_members(user_id);
CREATE INDEX idx_room_members_last_heartbeat ON room_members(last_heartbeat);
CREATE INDEX idx_room_members_is_synced ON room_members(is_synced);
CREATE INDEX idx_room_members_presence ON room_members(room_id, last_heartbeat DESC, is_synced);

-- Comments indexes
CREATE INDEX idx_comments_anime_id ON comments(anime_id);
CREATE INDEX idx_comments_room_id ON comments(room_id);
CREATE INDEX idx_comments_episode_number ON comments(episode_number);
CREATE INDEX idx_comments_parent_id ON comments(parent_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);
CREATE INDEX idx_comments_created_at ON comments(created_at);
CREATE INDEX idx_comments_video_timestamp ON comments(video_timestamp);
CREATE INDEX idx_comments_is_anchor ON comments(is_anchor);

-- Sync states indexes
CREATE INDEX idx_sync_states_room_id ON sync_states(room_id);
CREATE INDEX idx_sync_states_user_id ON sync_states(user_id);
CREATE INDEX idx_sync_states_created_at ON sync_states(created_at);
CREATE INDEX idx_sync_states_sync_event_type ON sync_states(sync_event_type);
```

## Triggers and Functions

### Automatic Timestamp Updates

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_rooms_updated_at 
    BEFORE UPDATE ON rooms 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_room_members_updated_at 
    BEFORE UPDATE ON room_members 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at 
    BEFORE UPDATE ON comments 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Host Transfer on Leave

```sql
CREATE OR REPLACE FUNCTION transfer_host_on_leave()
RETURNS TRIGGER AS $$
DECLARE
    new_host_id VARCHAR(100);
    new_host_username VARCHAR(100);
    member_count INTEGER;
BEGIN
    IF OLD.is_host = true THEN
        SELECT COUNT(*) INTO member_count
        FROM room_members 
        WHERE room_id = OLD.room_id AND user_id != OLD.user_id;
        
        IF member_count > 0 THEN
            SELECT user_id, username INTO new_host_id, new_host_username
            FROM room_members 
            WHERE room_id = OLD.room_id AND user_id != OLD.user_id
            ORDER BY joined_at ASC
            LIMIT 1;
            
            UPDATE room_members SET is_host = true 
            WHERE room_id = OLD.room_id AND user_id = new_host_id;
            
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
            UPDATE rooms 
            SET last_activity = NOW() - INTERVAL '25 hours'
            WHERE room_id = OLD.room_id;
        END IF;
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_member_leave_transfer_host
    AFTER DELETE ON room_members
    FOR EACH ROW EXECUTE FUNCTION transfer_host_on_leave();
```

### Room Activity Tracking

```sql
CREATE OR REPLACE FUNCTION update_room_activity()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE rooms 
    SET last_activity = NOW(), updated_at = NOW()
    WHERE room_id = NEW.room_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_member_join_update_activity
    AFTER INSERT ON room_members
    FOR EACH ROW EXECUTE FUNCTION update_room_activity();

CREATE TRIGGER on_heartbeat_update_activity
    AFTER UPDATE ON room_members
    FOR EACH ROW 
    WHEN (OLD.last_heartbeat IS DISTINCT FROM NEW.last_heartbeat)
    EXECUTE FUNCTION update_room_activity();
```

### Realtime Presence Updates

```sql
CREATE OR REPLACE FUNCTION update_member_presence()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_heartbeat = NOW();
    
    SELECT 
        current_playback_time, 
        is_playing 
    INTO NEW.current_playback_time, NEW.is_synced
    FROM rooms 
    WHERE room_id = NEW.room_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_member_presence_update
    BEFORE UPDATE ON room_members
    FOR EACH ROW 
    WHEN (OLD.current_playback_time IS DISTINCT FROM NEW.current_playback_time OR OLD.last_heartbeat IS DISTINCT FROM NEW.last_heartbeat)
    EXECUTE FUNCTION update_member_presence();
```

## Utility Functions

### Room ID Generation

```sql
CREATE OR REPLACE FUNCTION generate_room_id()
RETURNS VARCHAR(10) AS $$
DECLARE
    new_id VARCHAR(10);
    id_exists BOOLEAN;
BEGIN
    LOOP
        new_id := substring(
            md5(random()::text) 
            FROM (floor(random() * 20) + 1)::int 
            FOR 10
        );
        
        new_id := translate(new_id, '0123456789', 'abcdefghij');
        
        SELECT EXISTS(SELECT 1 FROM rooms WHERE room_id = new_id) INTO id_exists;
        
        IF NOT id_exists THEN
            EXIT;
        END IF;
    END LOOP;
    
    RETURN new_id;
END;
$$ LANGUAGE plpgsql;
```

### Access Key Generation

```sql
CREATE OR REPLACE FUNCTION generate_access_key()
RETURNS VARCHAR(6) AS $$
BEGIN
    RETURN floor(random() * 1000000)::text;
END;
$$ LANGUAGE plpgsql;
```

### Comment Anchor Management

```sql
CREATE OR REPLACE FUNCTION get_or_create_anchor(
    p_anime_id VARCHAR(100),
    p_room_id VARCHAR(10),
    p_episode_number INTEGER,
    p_host_username VARCHAR(100)
)
RETURNS UUID AS $$
DECLARE
    anchor_id UUID;
BEGIN
    SELECT id INTO anchor_id 
    FROM comments 
    WHERE anime_id = p_anime_id 
        AND room_id = p_room_id 
        AND episode_number = p_episode_number 
        AND is_anchor = true
    LIMIT 1;
    
    IF anchor_id IS NULL THEN
        INSERT INTO comments (
            anime_id, room_id, episode_number, parent_id,
            user_id, username, message, is_anchor, is_system_message
        ) VALUES (
            p_anime_id, p_room_id, p_episode_number, NULL,
            'system', p_host_username, 
            'Discussion for Episode ' || p_episode_number, 
            true, true
        ) RETURNING id INTO anchor_id;
    END IF;
    
    RETURN anchor_id;
END;
$$ LANGUAGE plpgsql;
```

### Realtime Optimization Functions

#### Bulk Sync Updates

```sql
CREATE OR REPLACE FUNCTION bulk_sync_update(
    p_room_id VARCHAR(10),
    p_host_time DECIMAL(10,2),
    p_sync_event_type VARCHAR(50)
)
RETURNS void AS $$
DECLARE
    member_record RECORD;
BEGIN
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
    
    UPDATE rooms 
    SET last_activity = NOW(), updated_at = NOW()
    WHERE room_id = p_room_id;
END;
$$ LANGUAGE plpgsql;
```

#### Playback Control

```sql
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
    SELECT is_host INTO is_host
    FROM room_members 
    WHERE room_id = p_room_id AND user_id = p_user_id;
    
    IF NOT FOUND OR NOT is_host THEN
        RETURN FALSE;
    END IF;
    
    UPDATE rooms 
    SET 
        is_playing = p_is_playing,
        current_playback_time = COALESCE(p_current_time, current_playback_time),
        updated_at = NOW()
    WHERE room_id = p_room_id
    RETURNING * INTO room_record;
    
    PERFORM bulk_sync_update(p_room_id, room_record.current_playback_time, 'play_pause');
    
    UPDATE room_members 
    SET is_synced = false
    WHERE room_id = p_room_id AND user_id != p_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

#### Seek Control

```sql
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
    IF p_current_time < 0 THEN
        RETURN FALSE;
    END IF;
    
    SELECT is_host INTO is_host
    FROM room_members 
    WHERE room_id = p_room_id AND user_id = p_user_id;
    
    IF NOT FOUND OR NOT is_host THEN
        RETURN FALSE;
    END IF;
    
    UPDATE rooms 
    SET 
        current_playback_time = p_current_time,
        updated_at = NOW()
    WHERE room_id = p_room_id
    RETURNING * INTO room_record;
    
    PERFORM bulk_sync_update(p_room_id, p_current_time, 'seek');
    
    UPDATE room_members 
    SET is_synced = false
    WHERE room_id = p_room_id AND user_id != p_user_id;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

## Row Level Security (RLS)

### Security Policies

```sql
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
```

### Security Functions

```sql
-- Room access validation
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
    
    IF is_public THEN
        RETURN true;
    END IF;
    
    IF p_access_key IS NOT NULL AND p_access_key = required_key THEN
        RETURN true;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Rate limiting
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
    SELECT COUNT(*) INTO request_count
    FROM sync_states
    WHERE user_id = p_user_id
        AND sync_event_type = p_action
        AND created_at > NOW() - INTERVAL '1 minute' * p_window_minutes;
    
    RETURN request_count < p_max_requests;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Data Retention

### Cleanup Functions

```sql
-- Cleanup old sync states (keep last 24 hours)
CREATE OR REPLACE FUNCTION cleanup_old_sync_states()
RETURNS void AS $$
BEGIN
    DELETE FROM sync_states 
    WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Cleanup inactive members (no heartbeat for 30 seconds)
CREATE OR REPLACE FUNCTION cleanup_realtime_data()
RETURNS void AS $$
BEGIN
    DELETE FROM room_members 
    WHERE last_heartbeat < NOW() - INTERVAL '30 seconds';
    
    DELETE FROM sync_states 
    WHERE created_at < NOW() - INTERVAL '6 hours';
    
    DELETE FROM rooms 
    WHERE room_id NOT IN (SELECT DISTINCT room_id FROM room_members)
    AND last_activity < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;
```

## Realtime Configuration

### Publication Setup

```sql
-- Enable Realtime on all tables
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE room_members;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
ALTER PUBLICATION supabase_realtime ADD TABLE sync_states;
```

### Permissions

```sql
-- Grant necessary permissions for Realtime
GRANT SELECT ON rooms TO authenticated;
GRANT SELECT ON room_members TO authenticated;
GRANT SELECT ON comments TO authenticated;
GRANT SELECT ON sync_states TO authenticated;
```

## Performance Tuning

### Recommended Settings

```sql
-- Connection settings
ALTER SYSTEM SET max_connections = 100;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET work_mem = '4MB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';

-- Realtime optimization
ALTER SYSTEM SET wal_level = minimal;
ALTER SYSTEM SET synchronous_commit = off;
ALTER SYSTEM SET fsync = off;
```

### Monitoring Queries

```sql
-- Room activity monitoring
SELECT 
    room_id,
    title,
    COUNT(*) as member_count,
    last_activity,
    is_playing
FROM rooms r
LEFT JOIN room_members rm ON r.room_id = rm.room_id
GROUP BY r.room_id
ORDER BY last_activity DESC;

-- Sync performance monitoring
SELECT 
    room_id,
    sync_event_type,
    COUNT(*) as event_count,
    AVG(time_difference) as avg_time_diff,
    COUNT(CASE WHEN is_synced THEN 1 END) as synced_count
FROM sync_states
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY room_id, sync_event_type
ORDER BY event_count DESC;

-- Presence monitoring
SELECT 
    room_id,
    COUNT(*) as active_members,
    COUNT(CASE WHEN is_synced THEN 1 END) as synced_members,
    MAX(last_heartbeat) as last_heartbeat
FROM room_members
WHERE last_heartbeat > NOW() - INTERVAL '5 minutes'
GROUP BY room_id;
```

This database schema provides the foundation for high-performance real-time synchronization while maintaining data integrity and security.