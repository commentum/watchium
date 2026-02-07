// Get comment history Edge Function
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
    
    if (!anime_id) {
      return createErrorResponse('missing_params', 'anime_id query parameter is required');
    }

    // Optional parameters
    const episode_number = url.searchParams.get('episode_number');
    const start_date = url.searchParams.get('start_date');
    const end_date = url.searchParams.get('end_date');
    const user_id = url.searchParams.get('user_id');
    
    const options: CommentListOptions = {
      limit: parseInt(url.searchParams.get('limit') || '100'),
      offset: parseInt(url.searchParams.get('offset') || '0'),
      order_by: url.searchParams.get('order_by') || 'created_at',
      order_direction: (url.searchParams.get('order_direction') as 'asc' | 'desc') || 'desc',
      include_system: url.searchParams.get('include_system') === 'true'
    };

    // Validate limit
    if (options.limit! > 200) {
      options.limit = 200;
    }

    // Build query
    let query = supabase
      .from('comments')
      .select('*')
      .eq('anime_id', anime_id);

    // Filter by episode if specified
    if (episode_number) {
      query = query.eq('episode_number', parseInt(episode_number));
    }

    // Filter by date range if specified
    if (start_date) {
      query = query.gte('created_at', start_date);
    }
    if (end_date) {
      query = query.lte('created_at', end_date);
    }

    // Filter by user if specified
    if (user_id) {
      query = query.eq('user_id', user_id);
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

    // Group comments by episode for better organization
    const commentsByEpisode: { [episode: number]: Comment[] } = {};
    (comments || []).forEach(comment => {
      if (!commentsByEpisode[comment.episode_number]) {
        commentsByEpisode[comment.episode_number] = [];
      }
      commentsByEpisode[comment.episode_number].push(comment);
    });

    // Get statistics
    const { data: stats } = await supabase
      .from('comments')
      .select('episode_number, user_id, created_at')
      .eq('anime_id', anime_id);

    let uniqueEpisodes = new Set<number>();
    let uniqueUsers = new Set<string>();
    let totalComments = 0;

    if (stats) {
      stats.forEach(stat => {
        uniqueEpisodes.add(stat.episode_number);
        uniqueUsers.add(stat.user_id);
        totalComments++;
      });
    }

    // Get most active episodes
    const episodeCounts: { [episode: number]: number } = {};
    if (stats) {
      stats.forEach(stat => {
        episodeCounts[stat.episode_number] = (episodeCounts[stat.episode_number] || 0) + 1;
      });
    }

    const mostActiveEpisodes = Object.entries(episodeCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([episode, count]) => ({
        episode_number: parseInt(episode),
        comment_count: count
      }));

    return createSuccessResponse({
      comments: comments || [],
      comments_by_episode: commentsByEpisode,
      statistics: {
        total_comments: totalComments,
        unique_episodes: uniqueEpisodes.size,
        unique_users: uniqueUsers.size,
        most_active_episodes: mostActiveEpisodes
      },
      pagination: {
        total: totalComments,
        limit: options.limit,
        offset: options.offset,
        has_more: (options.offset! + (comments?.length || 0)) < totalComments
      },
      filters: {
        anime_id,
        episode_number: episode_number ? parseInt(episode_number) : undefined,
        start_date,
        end_date,
        user_id,
        include_system: options.include_system
      }
    });

  } catch (error) {
    console.error('Get comment history error:', error);
    return createErrorResponse('get_comment_history_failed', error.message || 'Failed to get comment history');
  }
});