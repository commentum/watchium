// Get host time Edge Function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { 
  createSuccessResponse, 
  createErrorResponse, 
  validateBody,
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

  if (req.method !== 'GET' && req.method !== 'POST') {
    return createErrorResponse('method_not_allowed', 'Only GET or POST method is allowed');
  }

  try {
    let room_id: string;
    let user_id: string;

    if (req.method === 'GET') {
      const url = new URL(req.url);
      room_id = url.searchParams.get('room_id');
      user_id = url.searchParams.get('user_id');
      
      if (!room_id || !user_id) {
        return createErrorResponse('missing_params', 'room_id and user_id query parameters are required');
      }
    } else {
      const body = await req.json();
      const data = validateBody(body, ['room_id', 'user_id']);
      room_id = data.room_id;
      user_id = data.user_id;
    }

    // Verify user is in the room
    const { data: member, error: memberError } = await supabase
      .from('room_members')
      .select('*')
      .eq('room_id', room_id)
      .eq('user_id', user_id)
      .single();

    if (memberError || !member) {
      return createErrorResponse('not_in_room', 'User is not in this room');
    }

    // Get current room state
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('room_id', room_id)
      .single();

    if (roomError || !room) {
      return createErrorResponse('room_not_found', 'Room not found');
    }

    // Calculate time difference for this user
    const timeDifference = Math.abs(room.current_playback_time - member.current_playback_time);
    const isSynced = timeDifference <= 2; // 2 seconds tolerance

    // Get host member info
    const { data: hostMember } = await supabase
      .from('room_members')
      .select('username, avatar_url')
      .eq('room_id', room_id)
      .eq('user_id', room.host_user_id)
      .single();

    return createSuccessResponse({
      host_time: {
        current_time: room.current_playback_time,
        is_playing: room.is_playing,
        playback_speed: room.playback_speed,
        last_updated: room.updated_at
      },
      user_sync_status: {
        is_synced: isSynced,
        time_difference: timeDifference,
        user_current_time: member.current_playback_time
      },
      host_info: {
        user_id: room.host_user_id,
        username: hostMember?.username || room.host_username,
        avatar_url: hostMember?.avatar_url
      },
      room_info: {
        anime_title: room.anime_title,
        episode_number: room.episode_number,
        title: room.title
      }
    });

  } catch (error) {
    console.error('Get host time error:', error);
    return createErrorResponse('get_host_time_failed', error.message || 'Failed to get host time');
  }
});