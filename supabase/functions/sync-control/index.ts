// Realtime sync control - minimal HTTP calls, mostly database-driven
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { 
  createSuccessResponse, 
  createErrorResponse, 
  validateBody,
  checkRateLimit,
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
    const { room_id, user_id, action, current_time } = validateBody(body, [
      'room_id',
      'user_id', 
      'action'
    ]);

    // Rate limiting check
    const canProceed = await checkRateLimit(user_id, 'sync_control', 1, 2);
    if (!canProceed) {
      return createErrorResponse('rate_limited', 'Too many sync control requests. Please wait.');
    }

    let success = false;
    let message = '';

    switch (action) {
      case 'play':
      case 'pause':
        success = await supabase.rpc('change_playback_state', {
          p_room_id: room_id,
          p_user_id: user_id,
          p_is_playing: action === 'play',
          p_current_time: current_time
        });
        message = `Playback ${action === 'play' ? 'resumed' : 'paused'}`;
        break;

      case 'seek':
        if (current_time === undefined) {
          return createErrorResponse('missing_time', 'Current time required for seek action');
        }
        success = await supabase.rpc('seek_to_time', {
          p_room_id: room_id,
          p_user_id: user_id,
          p_current_time: current_time
        });
        message = 'Seek successful';
        break;

      default:
        return createErrorResponse('invalid_action', 'Action must be play, pause, or seek');
    }

    if (!success) {
      return createErrorResponse('sync_failed', 'Failed to execute sync action - check if user is host');
    }

    // Get updated room state
    const { data: roomState } = await supabase
      .from('rooms')
      .select('room_id, current_playback_time, is_playing, updated_at')
      .eq('room_id', room_id)
      .single();

    return createSuccessResponse({
      room: roomState,
      message,
      note: 'Realtime broadcasts will automatically notify all room members'
    });

  } catch (error) {
    console.error('Sync control error:', error);
    return createErrorResponse('sync_control_failed', error.message || 'Sync control failed');
  }
});