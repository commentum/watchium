// List public rooms Edge Function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Room, RoomListOptions } from '../shared/types.ts';
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
    
    // Parse query parameters
    const options: RoomListOptions = {
      limit: parseInt(url.searchParams.get('limit') || '50'),
      offset: parseInt(url.searchParams.get('offset') || '0'),
      order_by: url.searchParams.get('order_by') || 'last_activity',
      order_direction: (url.searchParams.get('order_direction') as 'asc' | 'desc') || 'desc',
      anime_id: url.searchParams.get('anime_id') || undefined,
      min_members: url.searchParams.get('min_members') ? parseInt(url.searchParams.get('min_members')!) : undefined
    };

    // Validate limit
    if (options.limit! > 100) {
      options.limit = 100;
    }

    // Build query
    let query = supabase
      .from('rooms')
      .select(`
        *,
        room_members!inner(count)
      `)
      .eq('is_public', true);

    // Add filters
    if (options.anime_id) {
      query = query.eq('anime_id', options.anime_id);
    }

    // Add member count filter
    if (options.min_members) {
      query = query.gte('room_members.count', options.min_members);
    }

    // Add ordering
    query = query.order(options.order_by!, { ascending: options.order_direction === 'asc' });

    // Add pagination
    query = query.range(options.offset!, options.offset! + options.limit! - 1);

    const { data: rooms, error } = await query;

    if (error) {
      throw error;
    }

    // Get member counts for each room
    const roomsWithCounts = await Promise.all(
      (rooms || []).map(async (room) => {
        const { count } = await supabase
          .from('room_members')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', room.room_id);

        return {
          ...room,
          member_count: count || 0
        };
      })
    );

    // Sort by member count if that's the primary sort
    if (options.order_by === 'member_count') {
      roomsWithCounts.sort((a, b) => {
        const diff = b.member_count - a.member_count;
        return options.order_direction === 'asc' ? -diff : diff;
      });
    }

    // Get total count for pagination
    const { count: totalCount } = await supabase
      .from('rooms')
      .select('*', { count: 'exact', head: true })
      .eq('is_public', true);

    return createSuccessResponse({
      rooms: roomsWithCounts,
      pagination: {
        total: totalCount || 0,
        limit: options.limit,
        offset: options.offset,
        has_more: (options.offset! + roomsWithCounts.length) < (totalCount || 0)
      }
    });

  } catch (error) {
    console.error('List rooms error:', error);
    return createErrorResponse('list_rooms_failed', error.message || 'Failed to list rooms');
  }
});