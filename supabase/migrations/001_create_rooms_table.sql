-- Create rooms table
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

-- Create indexes for performance
CREATE INDEX idx_rooms_room_id ON rooms(room_id);
CREATE INDEX idx_rooms_anime_id ON rooms(anime_id);
CREATE INDEX idx_rooms_is_public ON rooms(is_public);
CREATE INDEX idx_rooms_last_activity ON rooms(last_activity);
CREATE INDEX idx_rooms_host_user_id ON rooms(host_user_id);

-- Add constraints
ALTER TABLE rooms ADD CONSTRAINT valid_episode_number CHECK (episode_number > 0);
ALTER TABLE rooms ADD CONSTRAINT valid_current_playback_time CHECK (current_playback_time >= 0);
ALTER TABLE rooms ADD CONSTRAINT valid_playback_speed CHECK (playback_speed > 0);
ALTER TABLE rooms ADD CONSTRAINT unique_room_id UNIQUE (room_id);
ALTER TABLE rooms ADD CONSTRAINT valid_access_key CHECK (
    is_public = true OR (is_public = false AND access_key IS NOT NULL AND length(access_key) = 6)
);
