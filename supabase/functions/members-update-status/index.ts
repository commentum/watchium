// Update member status Edge Function
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

  if (req.method !== 'PUT' && req.method !== 'POST') {
    return createErrorResponse('method_not_allowed', 'Only PUT or POST method is allowed');
  }

  try {
    const body = await req.json();
    const { room_id, user_id, updates } = validateBody(body, ['room_id', 'user_id', 'updates']);

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

    // Validate updates
    const allowedUpdates = ['username', 'avatar_url', 'current_playback_time', 'is_synced'];
    const invalidUpdates = Object.keys(updates).filter(key => !allowedUpdates.includes(key));
    
    if (invalidUpdates.length > 0) {
      return createErrorResponse('invalid_updates', `Invalid update fields: ${invalidUpdates.join(', ')}`);
    }

    // Prepare update data
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    // Apply allowed updates
    if (updates.username !== undefined) {
      if (updates.username.trim().length === 0) {
        return createErrorResponse('invalid_username', 'Username cannot be empty');
      }
      if (updates.username.length > 50) {
        return createErrorResponse('username_too_long', 'Username cannot exceed 50 characters');
      }
      updateData.username = updates.username.trim();
    }

    if (updates.avatar_url !== undefined) {
      updateData.avatar_url = updates.avatar_url;
    }

    if (updates.current_playback_time !== undefined) {
      if (updates.current_playback_time < 0) {
        return createErrorResponse('invalid_time', 'Current time cannot be negative');
      }
      updateData.current_playback_time = updates.current_playback_time;
      updateData.last_heartbeat = new Date().toISOString();
    }

    if (updates.is_synced !== undefined) {
      updateData.is_synced = updates.is_synced;
    }

    // If username is being updated and user is host, update room host username too
    if (updates.username && member.is_host) {
      await supabase
        .from('rooms')
        .update({ 
          host_username: updates.username.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('room_id', room_id)
        .eq('host_user_id', user_id);
    }

    // Update member
    const { data: updatedMember, error: updateError } = await supabase
      .from('room_members')
      .update(updateData)
      .eq('room_id', room_id)
      .eq('user_id', user_id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // Broadcast member update to room
    await broadcastToRoom(room_id, 'member_updated', {
      user_id,
      updates: updateData
    });

    // Create system comment for username change
    if (updates.username && updates.username !== member.username) {
      const { data: room } = await supabase
        .from('rooms')
        .select('anime_id, episode_number')
        .eq('room_id', room_id)
        .single();

      if (room) {
        await supabase
          .from('comments')
          .insert({
            anime_id: room.anime_id,
            room_id,
            episode_number: room.episode_number,
            user_id: 'system',
            username: 'System',
            message: `${member.username} changed their name to ${updates.username}`,
            is_system_message: true
          });
      }
    }

    return createSuccessResponse({
      member: updatedMember,
      message: 'Member status updated successfully'
    });

  } catch (error) {
    console.error('Update member status error:', error);
    return createErrorResponse('update_member_status_failed', error.message || 'Failed to update member status');
  }
});