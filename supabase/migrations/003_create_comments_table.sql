-- Create comments table with threaded structure
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
    video_timestamp DECIMAL(10,2), -- Optional timestamp for timestamped comments
    is_anchor BOOLEAN DEFAULT false, -- Anchor messages for episode threads
    is_system_message BOOLEAN DEFAULT false, -- System-generated messages
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_comments_anime_id ON comments(anime_id);
CREATE INDEX idx_comments_room_id ON comments(room_id);
CREATE INDEX idx_comments_episode_number ON comments(episode_number);
CREATE INDEX idx_comments_parent_id ON comments(parent_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);
CREATE INDEX idx_comments_created_at ON comments(created_at);
CREATE INDEX idx_comments_video_timestamp ON comments(video_timestamp);
CREATE INDEX idx_comments_is_anchor ON comments(is_anchor);

-- Add constraints
ALTER TABLE comments ADD CONSTRAINT valid_comment_episode CHECK (episode_number > 0);
ALTER TABLE comments ADD CONSTRAINT valid_video_timestamp CHECK (video_timestamp IS NULL OR video_timestamp >= 0);
ALTER TABLE comments ADD CONSTRAINT non_empty_message CHECK (length(trim(message)) > 0);

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_comments_updated_at 
    BEFORE UPDATE ON comments 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to find or create anchor message for episode
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
    -- Try to find existing anchor
    SELECT id INTO anchor_id 
    FROM comments 
    WHERE anime_id = p_anime_id 
        AND room_id = p_room_id 
        AND episode_number = p_episode_number 
        AND is_anchor = true
    LIMIT 1;
    
    -- If no anchor exists, create one
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