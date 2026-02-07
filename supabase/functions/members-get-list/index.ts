// Get member list Edge Function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { RoomMember } from '../shared/types.ts';
import { 
  createSuccessResponse, 
  createErrorResponse,
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

  if (req.method !== 'GET') {
    return createErrorResponse('method_not_allowed', 'Only GET method is allowed');
  }

  try {
    const url = new URL(req.url);
    
    // Required parameters
    const room_id = url.searchParams.get('room_id');
    
    if (!room_id) {
      return createErrorResponse('missing_params', 'room_id query parameter is required');
    }

    // Optional parameters
    const include_sync_status = url.searchParams.get('include_sync_status') !== 'false'; // default true
    const sort_by = url.searchParams.get('sort_by') || 'joined_at';
    const sort_direction = (url.searchParams.get('sort_direction') as 'asc' | 'desc') || 'asc';

    // Verify room exists
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('room_id, anime_id, episode_number, current_playback_time, is_playing')
      .eq('room_id', room_id)
      .single();

    if (roomError || !room) {
      return createErrorResponse('room_not_found', 'Room not found');
    }

    // Get room members
    let query = supabase
      .from('room_members')
      .select('*')
      .eq('room_id', room_id);

    // Add sorting
    query = query.order(sort_by, { ascending: sort_direction === 'asc' });

    const { data: members, error: membersError } = await query;

    if (membersError) {
      throw membersError;
    }

    // Enhance member data with sync status if requested
    let enhancedMembers = members || [];
    if (include_sync_status) {
      enhancedMembers = enhancedMembers.map(member => {
        const timeDifference = Math.abs(room.current_playback_time - member.current_playback_time);
        const isSynced = timeDifference <= 2; // 2 seconds tolerance
        
        return {
          ...member,
          sync_status: {
            is_synced: isSynced,
            time_difference: timeDifference,
            host_time: room.current_playback_time,
            member_time: member.current_playback_time
          }
        };
      });
    }

    // Calculate room statistics
    const totalMembers = enhancedMembers.length;
    const syncedMembers = enhancedMembers.filter(m => 
      include_sync_status ? m.sync_status?.is_synced : m.is_synced
    ).length;
    const hostMember = enhancedMembers.find(m => m.is_host);

    // Get recent sync activity
    const { data: recentSyncActivity } = await supabase
      .from('sync_states')
      .select('user_id, sync_event_type, created_at, is_synced')
      .eq('room_id', room_id)
      .order('created_at', { ascending: false })
      .limit(10);

    return createSuccessResponse({
      members: enhancedMembers,
      room_info: {
        room_id: room.room_id,
        current_time: room.current_playback_time,
        is_playing: room.is_playing,
        anime_id: room.anime_id,
        episode_number: room.episode_number
      },
      statistics: {
        total_members: totalMembers,
        synced_members: syncedMembers,
        sync_percentage: totalMembers > 0 ? Math.round((syncedMembers / totalMembers) * 100) : 0,
        host: hostMember ? {
          user_id: hostMember.user_id,
          username: hostMember.username,
          avatar_url: hostMember.avatar_url
        } : null
      },
      recent_activity: recentSyncActivity || [],
      filters: {
        include_sync_status,
        sort_by,
        sort_direction
      }
    });

  } catch (error) {
    console.error('Get member list error:', error);
    return createErrorResponse('get_member_list_failed', error.message || 'Failed to get member list');
  }
});