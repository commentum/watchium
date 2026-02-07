// Leave room Edge Function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { 
  createSuccessResponse, 
  createErrorResponse, 
  validateBody, 
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
    const { room_id, user_id } = validateBody(body, ['room_id', 'user_id']);

    // Get member details before deletion
    const { data: member, error: memberError } = await supabase
      .from('room_members')
      .select('*')
      .eq('room_id', room_id)
      .eq('user_id', user_id)
      .single();

    if (memberError || !member) {
      return createErrorResponse('not_in_room', 'User is not in this room');
    }

    // Get room details for system comment
    const { data: room } = await supabase
      .from('rooms')
      .select('anime_id, episode_number')
      .eq('room_id', room_id)
      .single();

    // Create sync state record for leave event
    await supabase
      .from('sync_states')
      .insert({
        room_id,
        user_id,
        host_time: 0,
        member_time: 0,
        time_difference: 0,
        is_synced: true,
        sync_event_type: 'leave'
      });

    // Remove user from room (this will trigger host transfer if needed)
    const { error: deleteError } = await supabase
      .from('room_members')
      .delete()
      .eq('room_id', room_id)
      .eq('user_id', user_id);

    if (deleteError) {
      throw deleteError;
    }

    // Create system comment about user leaving
    if (room) {
      await supabase
        .from('comments')
        .insert({
          anime_id: room.anime_id,
          room_id,
          episode_number: room.episode_number,
          user_id: 'system',
          username: 'System',
          message: `${member.username} left the room`,
          is_system_message: true
        });
    }

    // Broadcast member left event
    await broadcastToRoom(room_id, 'member_left', {
      user_id,
      username: member.username
    });

    // Check if room is now empty and mark for cleanup
    const { data: remainingMembers } = await supabase
      .from('room_members')
      .select('user_id')
      .eq('room_id', room_id);

    if (!remainingMembers || remainingMembers.length === 0) {
      await supabase
        .from('rooms')
        .update({ last_activity: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() }) // 25 hours ago
        .eq('room_id', room_id);
    }

    return createSuccessResponse({
      message: 'Successfully left the room',
      was_host: member.is_host
    });

  } catch (error) {
    console.error('Leave room error:', error);
    return createErrorResponse('leave_room_failed', error.message || 'Failed to leave room');
  }
});