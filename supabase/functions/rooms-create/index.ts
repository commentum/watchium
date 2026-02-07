// Realtime-focused room management with minimal HTTP calls
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CreateRoomRequest } from '../shared/types.ts';
import { 
  createSuccessResponse, 
  createErrorResponse, 
  validateBody, 
  generateRoomId, 
  generateAccessKey,
  corsHeaders,
  handleOptionsRequest
} from '../shared/utils.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleOptionsRequest();
  }

  if (req.method !== 'POST') {
    return createErrorResponse('method_not_allowed', 'Only POST method is allowed');
  }

  try {
    const body = await req.json();
    const roomData = validateBody<CreateRoomRequest>(body, [
      'title',
      'anime_id', 
      'anime_title',
      'episode_number',
      'video_url',
      'host_user_id',
      'host_username',
      'is_public'
    ]);

    // Generate unique room ID
    const roomId = await generateRoomId();
    
    // Generate access key for private rooms
    let accessKey = roomData.access_key;
    if (!roomData.is_public && !accessKey) {
      accessKey = generateAccessKey();
    }

    // Create the room (this will trigger Realtime broadcast)
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .insert({
        room_id: roomId,
        title: roomData.title,
        anime_id: roomData.anime_id,
        anime_title: roomData.anime_title,
        episode_number: roomData.episode_number,
        video_url: roomData.video_url,
        source_id: roomData.source_id,
        host_user_id: roomData.host_user_id,
        host_username: roomData.host_username,
        is_public: roomData.is_public,
        access_key: accessKey,
        current_playback_time: 0,
        is_playing: false,
        playback_speed: 1.0
      })
      .select()
      .single();

    if (roomError) {
      throw roomError;
    }

    // Add host as first member (this will trigger Realtime broadcast)
    const { error: memberError } = await supabase
      .from('room_members')
      .insert({
        room_id: roomId,
        user_id: roomData.host_user_id,
        username: roomData.host_username,
        is_host: true,
        is_synced: true,
        current_playback_time: 0
      });

    if (memberError) {
      throw memberError;
    }

    // Create anchor comment for the episode
    await supabase.rpc('get_or_create_anchor', {
      p_anime_id: roomData.anime_id,
      p_room_id: roomId,
      p_episode_number: roomData.episode_number,
      p_host_username: roomData.host_username
    });

    return createSuccessResponse({
      room,
      access_key: accessKey,
      realtime_channel: `room:${roomId}`,
      presence_key: roomData.host_user_id
    }, 201);

  } catch (error) {
    console.error('Create room error:', error);
    return createErrorResponse('create_room_failed', error.message || 'Failed to create room');
  }
});