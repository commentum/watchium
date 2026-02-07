# Database Schema

This document describes the complete database schema for the real-time anime watching platform.

## Overview

The system uses PostgreSQL with the following main tables:
- `rooms` - Room metadata and playback state
- `room_members` - Active users in rooms
- `comments` - Threaded comment system
- `sync_states` - Synchronization tracking data

---

## Tables

### rooms

Stores room metadata and current playback state.

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
    current_time DECIMAL(10,2) DEFAULT 0,
    is_playing BOOLEAN DEFAULT false,
    playback_speed DECIMAL(3,2) DEFAULT 1.0,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Columns

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `room_id` | VARCHAR(10) | Unique room identifier (10-char alphanumeric) |
| `title` | VARCHAR(255) | Room display title |
| `anime_id` | VARCHAR(100) | External anime identifier |
| `anime_title` | VARCHAR(255) | Anime display title |
| `episode_number` | INTEGER | Current episode being watched |
| `video_url` | TEXT | URL of video source |
| `source_id` | VARCHAR(100) | Video source identifier |
| `host_user_id` | VARCHAR(100) | Host user identifier |
| `host_username` | VARCHAR(100) | Host display name |
| `is_public` | BOOLEAN | Whether room is publicly discoverable |
| `access_key` | VARCHAR(6) | 6-digit key for private rooms |
| `current_time` | DECIMAL(10,2) | Current video playback time in seconds |
| `is_playing` | BOOLEAN | Whether video is currently playing |
| `playback_speed` | DECIMAL(3,2) | Video playback speed multiplier |
| `last_activity` | TIMESTAMP WITH TIME ZONE | Last activity timestamp |
| `created_at` | TIMESTAMP WITH TIME ZONE | Room creation timestamp |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Last update timestamp |

#### Indexes

```sql
CREATE INDEX idx_rooms_room_id ON rooms(room_id);
CREATE INDEX idx_rooms_anime_id ON rooms(anime_id);
CREATE INDEX idx_rooms_is_public ON rooms(is_public);
CREATE INDEX idx_rooms_last_activity ON rooms(last_activity);
CREATE INDEX idx_rooms_host_user_id ON rooms(host_user_id);
```

#### Constraints

```sql
ALTER TABLE rooms ADD CONSTRAINT valid_episode_number CHECK (episode_number > 0);
ALTER TABLE rooms ADD CONSTRAINT valid_current_time CHECK (current_time >= 0);
ALTER TABLE rooms ADD CONSTRAINT valid_playback_speed CHECK (playback_speed > 0);
ALTER TABLE rooms ADD CONSTRAINT unique_room_id UNIQUE (room_id);
ALTER TABLE rooms ADD CONSTRAINT valid_access_key CHECK (
    is_public = true OR (is_public = false AND access_key IS NOT NULL AND length(access_key) = 6)
);
```

---

### room_members

Tracks active users in rooms with their sync status.

```sql
CREATE TABLE room_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id VARCHAR(10) NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    username VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    is_host BOOLEAN DEFAULT false,
    is_synced BOOLEAN DEFAULT true,
    current_time DECIMAL(10,2) DEFAULT 0,
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### Columns

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `room_id` | VARCHAR(10) | Foreign key to rooms.room_id |
| `user_id` | VARCHAR(100) | User identifier |
| `username` | VARCHAR(100) | User display name |
| `avatar_url` | TEXT | User avatar image URL |
| `is_host` | BOOLEAN | Whether user is room host |
| `is_synced` | BOOLEAN | Whether user is synced with host |
| `current_time` | DECIMAL(10,2) | User's current video time |
| `last_heartbeat` | TIMESTAMP WITH TIME ZONE | Last heartbeat timestamp |
| `joined_at` | TIMESTAMP WITH TIME ZONE | When user joined room |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Last update timestamp |

#### Indexes

```sql
CREATE INDEX idx_room_members_room_id ON room_members(room_id);
CREATE INDEX idx_room_members_user_id ON room_members(user_id);
CREATE INDEX idx_room_members_last_heartbeat ON room_members(last_heartbeat);
CREATE INDEX idx_room_members_is_synced ON room_members(is_synced);
```

#### Constraints

```sql
ALTER TABLE room_members ADD CONSTRAINT valid_member_current_time CHECK (current_time >= 0);
ALTER TABLE room_members ADD CONSTRAINT unique_room_user UNIQUE (room_id, user_id);
```

---

### comments

Threaded comment system with episode-based organization.

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

#### Columns

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `anime_id` | VARCHAR(100) | Anime identifier |
| `room_id` | VARCHAR(10) | Associated room (optional) |
| `episode_number` | INTEGER | Episode number |
| `parent_id` | UUID | Parent comment for threading |
| `user_id` | VARCHAR(100) | Comment author ID |
| `username` | VARCHAR(100) | Comment author name |
| `avatar_url` | TEXT | Author avatar URL |
| `message` | TEXT | Comment content |
| `video_timestamp` | DECIMAL(10,2) | Optional timestamp in video |
| `is_anchor` | BOOLEAN | Whether this is an anchor message |
| `is_system_message` | BOOLEAN | Whether this is a system-generated message |
| `created_at` | TIMESTAMP WITH TIME ZONE | Comment creation time |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Last update time |

#### Indexes

```sql
CREATE INDEX idx_comments_anime_id ON comments(anime_id);
CREATE INDEX idx_comments_room_id ON comments(room_id);
CREATE INDEX idx_comments_episode_number ON comments(episode_number);
CREATE INDEX idx_comments_parent_id ON comments(parent_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);
CREATE INDEX idx_comments_created_at ON comments(created_at);
CREATE INDEX idx_comments_video_timestamp ON comments(video_timestamp);
CREATE INDEX idx_comments_is_anchor ON comments(is_anchor);
```

#### Constraints

```sql
ALTER TABLE comments ADD CONSTRAINT valid_comment_episode CHECK (episode_number > 0);
ALTER TABLE comments ADD CONSTRAINT valid_video_timestamp CHECK (video_timestamp IS NULL OR video_timestamp >= 0);
ALTER TABLE comments ADD CONSTRAINT non_empty_message CHECK (length(trim(message)) > 0);
```

---

### sync_states

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

#### Columns

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `room_id` | VARCHAR(10) | Associated room |
| `user_id` | VARCHAR(100) | User identifier |
| `host_time` | DECIMAL(10,2) | Host's video time |
| `member_time` | DECIMAL(10,2) | Member's video time |
| `time_difference` | DECIMAL(10,2) | Absolute time difference |
| `is_synced` | BOOLEAN | Whether user is considered synced |
| `sync_event_type` | VARCHAR(50) | Type of sync event |
| `created_at` | TIMESTAMP WITH TIME ZONE | Event timestamp |

#### Sync Event Types

- `heartbeat` - Regular heartbeat updates
- `seek` - Host seek operations
- `play_pause` - Play/pause state changes
- `join` - User joining room
- `leave` - User leaving room

#### Indexes

```sql
CREATE INDEX idx_sync_states_room_id ON sync_states(room_id);
CREATE INDEX idx_sync_states_user_id ON sync_states(user_id);
CREATE INDEX idx_sync_states_created_at ON sync_states(created_at);
CREATE INDEX idx_sync_states_sync_event_type ON sync_states(sync_event_type);
```

#### Constraints

```sql
ALTER TABLE sync_states ADD CONSTRAINT valid_sync_host_time CHECK (host_time >= 0);
ALTER TABLE sync_states ADD CONSTRAINT valid_sync_member_time CHECK (member_time >= 0);
ALTER TABLE sync_states ADD CONSTRAINT valid_sync_event_type CHECK (sync_event_type IN ('heartbeat', 'seek', 'play_pause', 'join', 'leave'));
```

---

## Functions

### generate_room_id()

Generates a unique 10-character alphanumeric room ID.

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

### generate_access_key()

Generates a 6-digit numeric access key for private rooms.

```sql
CREATE OR REPLACE FUNCTION generate_access_key()
RETURNS VARCHAR(6) AS $$
BEGIN
    RETURN floor(random() * 1000000)::text;
END;
$$ LANGUAGE plpgsql;
```

### get_or_create_anchor()

Finds or creates an anchor message for episode threading.

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

### check_room_access()

Validates room access based on public/private status and access key.

```sql
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
```

### check_rate_limit()

Implements rate limiting for user actions.

```sql
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

---

## Triggers

### update_updated_at_column()

Automatically updates `updated_at` timestamp on row modifications.

```sql
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

CREATE TRIGGER update_comments_updated_at 
    BEFORE UPDATE ON comments 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### transfer_host_on_leave()

Transfers host ownership when original host leaves.

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
            
            UPDATE room_members 
            SET is_host = true 
            WHERE room_id = OLD.room_id AND user_id = new_host_id;
            
            UPDATE rooms 
            SET host_user_id = new_host_id, 
                host_username = new_host_username
            WHERE room_id = OLD.room_id;
            
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

### update_room_activity()

Updates room activity timestamp on member actions.

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

---

## Row Level Security (RLS)

### Policies

All tables have RLS enabled with the following policies:

#### rooms
- Anyone can view public rooms
- Anyone can view rooms with valid access key
- Anyone can create rooms
- Host can update/delete their rooms

#### room_members
- Anyone can view room members
- Anyone can join rooms
- Users can update/leave their own member records

#### comments
- Anyone can view comments
- Anyone can create comments
- Users can update/delete their own non-system comments

#### sync_states
- Anyone can view/create sync states

---

## Performance Optimization

### Indexes Summary

- **Primary Keys**: All tables have UUID primary keys
- **Foreign Keys**: All foreign key columns are indexed
- **Query Patterns**: Common query patterns are indexed
- **Time-based**: Timestamps are indexed for time-based queries

### Cleanup Functions

- `cleanup_inactive_rooms()` - Removes rooms inactive for 24+ hours
- `cleanup_old_sync_states()` - Removes sync states older than 24 hours
- `scheduled_cleanup_sync_states()` - Wrapper for scheduled cleanup

### Connection Pooling

Configure connection pooling based on expected load:
- **Development**: 5-10 connections
- **Production**: 20-50 connections
- **High Traffic**: 100+ connections

---

## Data Retention

### Automatic Cleanup

- **Inactive Rooms**: Deleted after 24 hours of inactivity
- **Sync States**: Deleted after 24 hours
- **Comments**: Retained indefinitely (for history)

### Manual Cleanup

```sql
-- Clean rooms inactive for more than 7 days
DELETE FROM rooms 
WHERE last_activity < NOW() - INTERVAL '7 days';

-- Clean sync states older than 7 days
DELETE FROM sync_states 
WHERE created_at < NOW() - INTERVAL '7 days';
```

---

## Backup Strategy

### Daily Backups

- Full database backup daily at 2 AM UTC
- Retain backups for 30 days
- Store in multiple regions

### Point-in-Time Recovery

- Enable WAL archiving
- 15-minute recovery point objective
- Test recovery monthly

---

## Monitoring

### Key Metrics

- Active room count
- Concurrent users per room
- Sync latency percentiles
- Comment creation rate
- Database connection usage

### Alerts

- Room creation failures
- High sync latency (>2 seconds)
- Database connection exhaustion
- Storage space warnings

---

## Migration Strategy

### Version Control

All schema changes are managed through numbered migration files:
- `001_create_rooms_table.sql`
- `002_create_room_members_table.sql`
- etc.

### Rollback Plan

Each migration has a corresponding rollback script:
- `001_rollback_rooms_table.sql`
- `002_rollback_room_members_table.sql`
- etc.

### Testing

- Schema changes tested in staging first
- Performance impact measured
- Rollback procedures validated