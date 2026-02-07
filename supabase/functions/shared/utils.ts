// Shared utilities for Supabase Edge Functions
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { APIError, ApiResponse } from './types.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// CORS headers for all responses
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

// Error response helper
export function createErrorResponse(error: string, message: string, details?: any): Response {
  const errorResponse: ApiResponse = {
    success: false,
    error: { error, message, details }
  };
  
  return new Response(JSON.stringify(errorResponse), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Success response helper
export function createSuccessResponse<T>(data: T, status = 200): Response {
  const successResponse: ApiResponse<T> = {
    success: true,
    data
  };
  
  return new Response(JSON.stringify(successResponse), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Validate request body
export function validateBody<T>(body: unknown, requiredFields: (keyof T)[]): T {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid request body');
  }
  
  const data = body as T;
  
  for (const field of requiredFields) {
    if (!(field in data) || data[field] === undefined || data[field] === null) {
      throw new Error(`Missing required field: ${String(field)}`);
    }
  }
  
  return data;
}

// Generate unique room ID
export async function generateRoomId(): Promise<string> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Check if ID already exists
  const { data: existingRoom } = await supabase
    .from('rooms')
    .select('room_id')
    .eq('room_id', result)
    .single();
  
  if (existingRoom) {
    return generateRoomId(); // Recursive call if ID exists
  }
  
  return result;
}

// Generate 6-digit access key
export function generateAccessKey(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Broadcast WebSocket event to room members
export async function broadcastToRoom(
  room_id: string, 
  event: string, 
  payload: any
): Promise<void> {
  try {
    // This would integrate with Supabase Realtime
    // For now, we'll use a database trigger approach
    await supabase.rpc('broadcast_room_event', {
      p_room_id: room_id,
      p_event_type: event,
      p_payload: payload
    });
  } catch (error) {
    console.error('Failed to broadcast to room:', error);
  }
}

// Rate limiting check
export async function checkRateLimit(
  user_id: string, 
  action: string, 
  windowMinutes = 1, 
  maxRequests = 60
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_user_id: user_id,
      p_action: action,
      p_window_minutes: windowMinutes,
      p_max_requests: maxRequests
    });
    
    if (error) throw error;
    return data || false;
  } catch (error) {
    console.error('Rate limit check failed:', error);
    return true; // Allow on error
  }
}

// Validate room access
export async function validateRoomAccess(
  room_id: string, 
  access_key?: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('check_room_access', {
      p_room_id: room_id,
      p_access_key: access_key
    });
    
    if (error) throw error;
    return data || false;
  } catch (error) {
    console.error('Room access validation failed:', error);
    return false;
  }
}

// Get room by ID
export async function getRoom(room_id: string) {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('room_id', room_id)
    .single();
  
  if (error) throw error;
  return data;
}

// Get room members
export async function getRoomMembers(room_id: string) {
  const { data, error } = await supabase
    .from('room_members')
    .select('*')
    .eq('room_id', room_id)
    .order('joined_at', { ascending: true });
  
  if (error) throw error;
  return data || [];
}

// Update user sync status
export async function updateSyncStatus(
  room_id: string, 
  user_id: string, 
  is_synced: boolean, 
  current_time: number
): Promise<void> {
  await supabase
    .from('room_members')
    .update({
      is_synced,
      current_playback_time: current_time,
      last_heartbeat: new Date().toISOString()
    })
    .eq('room_id', room_id)
    .eq('user_id', user_id);
}

// Create sync state record
export async function createSyncState(
  room_id: string,
  user_id: string,
  host_time: number,
  member_time: number,
  sync_event_type: string
): Promise<void> {
  const time_difference = Math.abs(host_time - member_time);
  const is_synced = time_difference <= 2; // 2 seconds tolerance
  
  await supabase
    .from('sync_states')
    .insert({
      room_id,
      user_id,
      host_time,
      member_time,
      time_difference,
      is_synced,
      sync_event_type
    });
  
  // Update member sync status
  await updateSyncStatus(room_id, user_id, is_synced, member_time);
}

// Cleanup inactive members
export async function cleanupInactiveMembers(): Promise<void> {
  const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();
  
  const { data: inactiveMembers } = await supabase
    .from('room_members')
    .select('room_id, user_id')
    .lt('last_heartbeat', thirtySecondsAgo);
  
  if (inactiveMembers) {
    for (const member of inactiveMembers) {
      await supabase
        .from('room_members')
        .delete()
        .eq('room_id', member.room_id)
        .eq('user_id', member.user_id);
    }
  }
}

// Handle OPTIONS requests for CORS
export function handleOptionsRequest(): Response {
  return new Response('ok', { headers: corsHeaders });
}