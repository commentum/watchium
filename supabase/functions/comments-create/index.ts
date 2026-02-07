// Create comment Edge Function
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CreateCommentRequest, Comment } from '../shared/types.ts';
import { 
  createSuccessResponse, 
  createErrorResponse, 
  validateBody, 
  checkRateLimit,
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
    const commentData = validateBody<CreateCommentRequest>(body, [
      'anime_id',
      'episode_number',
      'user_id',
      'username',
      'message'
    ]);

    // Rate limiting check
    const canProceed = await checkRateLimit(commentData.user_id, 'comment', 5, 1);
    if (!canProceed) {
      return createErrorResponse('rate_limited', 'Too many comments. Please wait before posting again.');
    }

    // Validate message length
    if (commentData.message.trim().length === 0) {
      return createErrorResponse('empty_message', 'Comment message cannot be empty');
    }

    if (commentData.message.length > 1000) {
      return createErrorResponse('message_too_long', 'Comment message cannot exceed 1000 characters');
    }

    // Validate video timestamp if provided
    if (commentData.video_timestamp !== undefined && commentData.video_timestamp < 0) {
      return createErrorResponse('invalid_timestamp', 'Video timestamp cannot be negative');
    }

    // If room_id is provided, verify user is in the room
    if (commentData.room_id) {
      const { data: member, error: memberError } = await supabase
        .from('room_members')
        .select('user_id')
        .eq('room_id', commentData.room_id)
        .eq('user_id', commentData.user_id)
        .single();

      if (memberError || !member) {
        return createErrorResponse('not_in_room', 'User is not in this room');
      }
    }

    // Determine parent_id - if not provided, find or create anchor for this episode
    let parentId = commentData.parent_id;
    if (!parentId && commentData.room_id) {
      // Get or create anchor message for this episode
      const { data: anchor } = await supabase.rpc('get_or_create_anchor', {
        p_anime_id: commentData.anime_id,
        p_room_id: commentData.room_id,
        p_episode_number: commentData.episode_number,
        p_host_username: commentData.username
      });
      
      parentId = anchor;
    }

    // Create the comment
    const { data: comment, error: commentError } = await supabase
      .from('comments')
      .insert({
        anime_id: commentData.anime_id,
        room_id: commentData.room_id,
        episode_number: commentData.episode_number,
        parent_id: parentId,
        user_id: commentData.user_id,
        username: commentData.username,
        avatar_url: commentData.avatar_url,
        message: commentData.message.trim(),
        video_timestamp: commentData.video_timestamp,
        is_anchor: false,
        is_system_message: false
      })
      .select()
      .single();

    if (commentError) {
      throw commentError;
    }

    // Broadcast new comment to room if applicable
    if (commentData.room_id) {
      await broadcastToRoom(commentData.room_id, 'new_comment', comment);
    }

    return createSuccessResponse({
      comment,
      message: 'Comment created successfully'
    }, 201);

  } catch (error) {
    console.error('Create comment error:', error);
    return createErrorResponse('create_comment_failed', error.message || 'Failed to create comment');
  }
});