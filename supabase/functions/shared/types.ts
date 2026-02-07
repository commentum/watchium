// Shared types for Supabase Edge Functions

export interface Room {
  id: string;
  room_id: string;
  title: string;
  anime_id: string;
  anime_title: string;
  episode_number: number;
  video_url: string;
  source_id?: string;
  host_user_id: string;
  host_username: string;
  is_public: boolean;
  access_key?: string;
  current_playback_time: number;
  is_playing: boolean;
  playback_speed: number;
  last_activity: string;
  created_at: string;
  updated_at: string;
}

export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  username: string;
  avatar_url?: string;
  is_host: boolean;
  is_synced: boolean;
  current_playback_time: number;
  last_heartbeat: string;
  joined_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  anime_id: string;
  room_id?: string;
  episode_number: number;
  parent_id?: string;
  user_id: string;
  username: string;
  avatar_url?: string;
  message: string;
  video_timestamp?: number;
  is_anchor: boolean;
  is_system_message: boolean;
  created_at: string;
  updated_at: string;
}

export interface SyncState {
  id: string;
  room_id: string;
  user_id: string;
  host_time: number;
  member_time: number;
  time_difference: number;
  is_synced: boolean;
  sync_event_type: 'heartbeat' | 'seek' | 'play_pause' | 'join' | 'leave';
  created_at: string;
}

// API Request/Response types
export interface CreateRoomRequest {
  title: string;
  anime_id: string;
  anime_title: string;
  episode_number: number;
  video_url: string;
  source_id?: string;
  host_user_id: string;
  host_username: string;
  is_public: boolean;
  access_key?: string;
}

export interface JoinRoomRequest {
  room_id: string;
  user_id: string;
  username: string;
  avatar_url?: string;
  access_key?: string;
}

export interface HeartbeatRequest {
  room_id: string;
  user_id: string;
  current_time: number;
  is_playing: boolean;
}

export interface PlayPauseRequest {
  room_id: string;
  user_id: string;
  is_playing: boolean;
  current_time?: number;
}

export interface SeekRequest {
  room_id: string;
  user_id: string;
  current_time: number;
}

export interface CreateCommentRequest {
  anime_id: string;
  room_id?: string;
  episode_number: number;
  parent_id?: string;
  user_id: string;
  username: string;
  avatar_url?: string;
  message: string;
  video_timestamp?: number;
}

// WebSocket Event types
export interface WebSocketEvent {
  type: string;
  payload: any;
  room_id: string;
  timestamp: number;
}

export interface PlaybackEvent extends WebSocketEvent {
  type: 'play' | 'pause' | 'seek';
  payload: {
    current_time: number;
    user_id: string;
    username: string;
  };
}

export interface HeartbeatEvent extends WebSocketEvent {
  type: 'heartbeat';
  payload: {
    user_id: string;
    current_time: number;
    is_synced: boolean;
  };
}

export interface MemberJoinedEvent extends WebSocketEvent {
  type: 'member_joined';
  payload: {
    user_id: string;
    username: string;
    avatar_url?: string;
  };
}

export interface MemberLeftEvent extends WebSocketEvent {
  type: 'member_left';
  payload: {
    user_id: string;
    username: string;
  };
}

export interface NewHostEvent extends WebSocketEvent {
  type: 'new_host';
  payload: {
    user_id: string;
    username: string;
  };
}

export interface NewCommentEvent extends WebSocketEvent {
  type: 'new_comment';
  payload: Comment;
}

// Error types
export interface APIError {
  error: string;
  message: string;
  details?: any;
}

export interface SuccessResponse<T = any> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: APIError;
}

// Utility types
export type ApiResponse<T = any> = SuccessResponse<T> | ErrorResponse;

// Database query options
export interface QueryOptions {
  limit?: number;
  offset?: number;
  order_by?: string;
  order_direction?: 'asc' | 'desc';
}

export interface RoomListOptions extends QueryOptions {
  anime_id?: string;
  is_public?: boolean;
  min_members?: number;
}

export interface CommentListOptions extends QueryOptions {
  episode_number?: number;
  parent_id?: string;
  include_system?: boolean;
}