// Delete room Edge Function
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

  if (req.method !== 'DELETE') {
    return createErrorResponse('method_not_allowed', 'Only DELETE method is allowed');
  }

  try {
    const body = await req.json();
    const { room_id, user_id } = validateBody(body, ['room_id', 'user_id']);

    // Get room details and verify user is host
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('room_id', room_id)
      .single();

    if (roomError || !room) {
      return createErrorResponse('room_not_found', 'Room not found');
    }

    if (room.host_user_id !== user_id) {
      return createErrorResponse('not_host', 'Only the host can delete the room');
    }

    // Notify all members before deletion
    await broadcastToRoom(room_id, 'room_deleted', {
      message: 'Room has been deleted by the host',
      deleted_by: user_id
    });

    // Delete all room members (cascade)
    await supabase
      .from('room_members')
      .delete()
      .eq('room_id', room_id);

    // Delete the room
    const { error: deleteError } = await supabase
      .from('rooms')
      .delete()
      .eq('room_id', room_id);

    if (deleteError) {
      throw deleteError;
    }

    return createSuccessResponse({
      message: 'Room deleted successfully',
      room_id
    });

  } catch (error) {
    console.error('Delete room error:', error);
    return createErrorResponse('delete_room_failed', error.message || 'Failed to delete room');
  }
});