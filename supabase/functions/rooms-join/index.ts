// Join room Edge Function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { JoinRoomRequest, RoomMember } from '../shared/types.ts';
import { 
  createSuccessResponse, 
  createErrorResponse, 
  validateBody, 
  validateRoomAccess,
  broadcastToRoom,
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
    const joinData = validateBody<JoinRoomRequest>(body, [
      'room_id',
      'user_id',
      'username'
    ]);

    // Validate room access
    const hasAccess = await validateRoomAccess(joinData.room_id, joinData.access_key);
    if (!hasAccess) {
      return createErrorResponse('access_denied', 'Invalid room ID or access key');
    }

    // Check if user is already in the room
    const { data: existingMember } = await supabase
      .from('room_members')
      .select('*')
      .eq('room_id', joinData.room_id)
      .eq('user_id', joinData.user_id)
      .single();

    if (existingMember) {
      return createErrorResponse('already_joined', 'User is already in this room');
    }

    // Get room details
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('room_id', joinData.room_id)
      .single();

    if (roomError || !room) {
      return createErrorResponse('room_not_found', 'Room not found');
    }

    // Add user to room
    const { data: member, error: memberError } = await supabase
      .from('room_members')
      .insert({
        room_id: joinData.room_id,
        user_id: joinData.user_id,
        username: joinData.username,
        avatar_url: joinData.avatar_url,
        is_host: false,
        is_synced: true,
        current_playback_time: room.current_playback_time
      })
      .select()
      .single();

    if (memberError) {
      throw memberError;
    }

    // Create sync state record for join event
    await supabase
      .from('sync_states')
      .insert({
        room_id: joinData.room_id,
        user_id: joinData.user_id,
        host_time: room.current_playback_time,
        member_time: room.current_playback_time,
        time_difference: 0,
        is_synced: true,
        sync_event_type: 'join'
      });

    // Create system comment about user joining
    await supabase
      .from('comments')
      .insert({
        anime_id: room.anime_id,
        room_id: joinData.room_id,
        episode_number: room.episode_number,
        user_id: 'system',
        username: 'System',
        message: `${joinData.username} joined the room`,
        is_system_message: true
      });

    // Broadcast member joined event
    await broadcastToRoom(joinData.room_id, 'member_joined', {
      user_id: joinData.user_id,
      username: joinData.username,
      avatar_url: joinData.avatar_url
    });

    return createSuccessResponse({
      member,
      room: {
        room_id: room.room_id,
        title: room.title,
        anime_title: room.anime_title,
        episode_number: room.episode_number,
        video_url: room.video_url,
        current_time: room.current_playback_time,
        is_playing: room.is_playing,
        host_username: room.host_username
      }
    }, 201);

  } catch (error) {
    console.error('Join room error:', error);
    return createErrorResponse('join_room_failed', error.message || 'Failed to join room');
  }
});