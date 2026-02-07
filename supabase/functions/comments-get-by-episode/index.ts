// Get comments by episode Edge Function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Comment, CommentListOptions } from '../shared/types.ts';
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
    const anime_id = url.searchParams.get('anime_id');
    const episode_number = url.searchParams.get('episode_number');
    
    if (!anime_id || !episode_number) {
      return createErrorResponse('missing_params', 'anime_id and episode_number query parameters are required');
    }

    // Optional parameters
    const options: CommentListOptions = {
      limit: parseInt(url.searchParams.get('limit') || '50'),
      offset: parseInt(url.searchParams.get('offset') || '0'),
      order_by: url.searchParams.get('order_by') || 'created_at',
      order_direction: (url.searchParams.get('order_direction') as 'asc' | 'desc') || 'desc',
      parent_id: url.searchParams.get('parent_id') || undefined,
      include_system: url.searchParams.get('include_system') === 'true'
    };

    // Validate limit
    if (options.limit! > 100) {
      options.limit = 100;
    }

    // Build query
    let query = supabase
      .from('comments')
      .select('*')
      .eq('anime_id', anime_id)
      .eq('episode_number', parseInt(episode_number));

    // Filter by parent_id if specified (for threaded comments)
    if (options.parent_id) {
      query = query.eq('parent_id', options.parent_id);
    } else {
      // If no parent_id, get only anchor messages (top-level threads)
      query = query.eq('is_anchor', true);
    }

    // Filter system messages unless explicitly included
    if (!options.include_system) {
      query = query.eq('is_system_message', false);
    }

    // Add ordering
    query = query.order(options.order_by!, { ascending: options.order_direction === 'asc' });

    // Add pagination
    query = query.range(options.offset!, options.offset! + options.limit! - 1);

    const { data: comments, error } = await query;

    if (error) {
      throw error;
    }

    // If we got anchor messages, fetch replies for each
    let commentsWithReplies = comments || [];
    if (!options.parent_id) {
      // For each anchor, get its replies
      commentsWithReplies = await Promise.all(
        (comments || []).map(async (anchor: Comment) => {
          const { data: replies } = await supabase
            .from('comments')
            .select('*')
            .eq('parent_id', anchor.id)
            .eq('is_system_message', false)
            .order('created_at', { ascending: true });

          return {
            ...anchor,
            replies: replies || []
          };
        })
      );
    }

    // Get total count for pagination
    let totalCountQuery = supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('anime_id', anime_id)
      .eq('episode_number', parseInt(episode_number));

    if (options.parent_id) {
      totalCountQuery = totalCountQuery.eq('parent_id', options.parent_id);
    } else {
      totalCountQuery = totalCountQuery.eq('is_anchor', true);
    }

    if (!options.include_system) {
      totalCountQuery = totalCountQuery.eq('is_system_message', false);
    }

    const { count: totalCount } = await totalCountQuery;

    return createSuccessResponse({
      comments: commentsWithReplies,
      pagination: {
        total: totalCount || 0,
        limit: options.limit,
        offset: options.offset,
        has_more: (options.offset! + commentsWithReplies.length) < (totalCount || 0)
      },
      filters: {
        anime_id,
        episode_number: parseInt(episode_number),
        parent_id: options.parent_id,
        include_system: options.include_system
      }
    });

  } catch (error) {
    console.error('Get comments error:', error);
    return createErrorResponse('get_comments_failed', error.message || 'Failed to get comments');
  }
});