# API Reference

Complete API documentation for the Watchium real-time anime watching platform.

## Base URL

```
https://ahigvhlqlikkkjsjikcj.supabase.co/functions/v1
```

## Authentication

No authentication required - open access platform with row-level security.

## Response Format

All responses follow this structure:

```typescript
interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface ErrorResponse {
  success: false;
  error: {
    error: string;
    message: string;
    details?: any;
  }
}
```

## Room Management

### Create Room

**Endpoint**: `POST /rooms-create`

Creates a new watching room with real-time synchronization.

**Request Body**:
```typescript
interface CreateRoomRequest {
  title: string;           // Room display title
  anime_id: string;        // Anime identifier
  anime_title: string;     // Anime title
  episode_number: number;  // Episode number
  video_url: string;      // Video URL
  source_id?: string;     // Optional source identifier
  host_user_id: string;   // Host user ID
  host_username: string;  // Host username
  is_public: boolean;     // Whether room is public
  access_key?: string;    // Optional 6-digit access key for private rooms
}
```

**Response**:
```typescript
{
  success: true;
  data: {
    room: Room;                    // Created room object
    access_key?: string;           // Generated access key (private rooms)
    realtime_channel: string;      // WebSocket channel name
    presence_key: string;          // Presence tracking key
  }
}
```

**Example**:
```javascript
const response = await fetch('https://ahigvhlqlikkkjsjikcj.supabase.co/functions/v1/rooms-create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: "Watching Attack on Titan S1E1 Together",
    anime_id: "aot-season-1",
    anime_title: "Attack on Titan",
    episode_number: 1,
    video_url: "https://example.com/video.mp4",
    host_user_id: "user123",
    host_username: "AnimeFan99",
    is_public: true
  })
});
```

### Join Room

**Endpoint**: `POST /rooms-join`

Join an existing room.

**Request Body**:
```typescript
interface JoinRoomRequest {
  room_id: string;        // Room ID to join
  user_id: string;        // User ID
  username: string;       // Display username
  avatar_url?: string;    // Optional avatar URL
  access_key?: string;    // Required for private rooms
}
```

**Response**:
```typescript
{
  success: true;
  data: {
    member: RoomMember;           // Member object
    room: {                      // Room summary
      room_id: string;
      title: string;
      anime_title: string;
      episode_number: number;
      video_url: string;
      current_time: number;
      is_playing: boolean;
      host_username: string;
    }
  }
}
```

### Leave Room

**Endpoint**: `POST /rooms-leave`

Leave a room and handle host transfer if needed.

**Request Body**:
```typescript
{
  room_id: string;  // Room ID to leave
  user_id: string;  // User ID
}
```

**Response**:
```typescript
{
  success: true;
  data: {
    message: string;      // Success message
    was_host: boolean;    // Whether user was the host
  }
}
```

### Delete Room

**Endpoint**: `DELETE /rooms-delete`

Delete a room (host only).

**Request Body**:
```typescript
{
  room_id: string;  // Room ID to delete
  user_id: string;  // Host user ID
}
```

**Response**:
```typescript
{
  success: true;
  data: {
    message: string;  // Success message
    room_id: string;  // Deleted room ID
  }
}
```

### List Public Rooms

**Endpoint**: `GET /rooms-list-public`

Discover public rooms with filtering options.

**Query Parameters**:
- `limit` (number, default: 50) - Maximum results per page
- `offset` (number, default: 0) - Pagination offset
- `order_by` (string, default: 'last_activity') - Sort field
- `order_direction` ('asc' | 'desc', default: 'desc') - Sort direction
- `anime_id` (string) - Filter by anime ID
- `min_members` (number) - Minimum member count

**Response**:
```typescript
{
  success: true;
  data: {
    rooms: Room[];              // Array of rooms with member counts
    pagination: {
      total: number;           // Total rooms available
      limit: number;           // Current page limit
      offset: number;          // Current page offset
      has_more: boolean;       // Whether more pages exist
    }
  }
}
```

## Synchronization

### Control Playback

**Endpoint**: `POST /sync-control`

Control room playback (play/pause/seek). Host only.

**Request Body**:
```typescript
{
  room_id: string;           // Room ID
  user_id: string;           // User ID (must be host)
  action: 'play' | 'pause' | 'seek';  // Action to perform
  current_time?: number;     // Required for seek action
}
```

**Response**:
```typescript
{
  success: true;
  data: {
    room: {                      // Updated room state
      room_id: string;
      current_time: number;
      is_playing: boolean;
      updated_at: string;
    },
    message: string;              // Action confirmation
    note: string;                 // Realtime broadcast notice
  }
}
```

### Get Host Time

**Endpoint**: `GET /sync-get-host-time` or `POST /sync-get-host-time`

Get current host state and user sync status.

**Query Parameters (GET)**:
- `room_id` (string, required) - Room ID
- `user_id` (string, required) - User ID

**Request Body (POST)**:
```typescript
{
  room_id: string;  // Room ID
  user_id: string;  // User ID
}
```

**Response**:
```typescript
{
  success: true;
  data: {
    host_time: {
      current_time: number;     // Host's current playback time
      is_playing: boolean;      // Whether video is playing
      playback_speed: number;   // Playback speed
      last_updated: string;     // Last update timestamp
    },
    user_sync_status: {
      is_synced: boolean;       // Whether user is in sync
      time_difference: number;  // Time difference in seconds
      user_current_time: number; // User's current time
    },
    host_info: {
      user_id: string;          // Host user ID
      username: string;         // Host username
      avatar_url?: string;      // Host avatar URL
    },
    room_info: {
      anime_title: string;      // Anime title
      episode_number: number;   // Episode number
      title: string;            // Room title
    }
  }
}
```

## Member Management

### Get Member List

**Endpoint**: `GET /members-get-list`

Get room members with sync status and statistics.

**Query Parameters**:
- `room_id` (string, required) - Room ID
- `include_sync_status` (boolean, default: true) - Include sync calculations
- `sort_by` (string, default: 'joined_at') - Sort field
- `sort_direction` ('asc' | 'desc', default: 'asc') - Sort direction

**Response**:
```typescript
{
  success: true;
  data: {
    members: (RoomMember & {
      sync_status?: {           // Only if include_sync_status = true
        is_synced: boolean;
        time_difference: number;
        host_time: number;
        member_time: number;
      };
    })[];
    room_info: {
      room_id: string;
      current_time: number;
      is_playing: boolean;
      anime_id: string;
      episode_number: number;
    };
    statistics: {
      total_members: number;
      synced_members: number;
      sync_percentage: number;
      host: {
        user_id: string;
        username: string;
        avatar_url?: string;
      } | null;
    };
    recent_activity: SyncState[];  // Recent sync events
    filters: {
      include_sync_status: boolean;
      sort_by: string;
      sort_direction: string;
    };
  }
}
```

### Update Member Status

**Endpoint**: `PUT /members-update-status` or `POST /members-update-status`

Update member information (username, avatar, sync status).

**Request Body**:
```typescript
{
  room_id: string;                    // Room ID
  user_id: string;                    // User ID
  updates: {
    username?: string;                // New username
    avatar_url?: string;              // New avatar URL
    current_playback_time?: number;   // Current playback time
    is_synced?: boolean;              // Sync status
  };
}
```

**Response**:
```typescript
{
  success: true;
  data: {
    member: RoomMember;      // Updated member object
    message: string;         // Success message
  }
}
```

## Comments

### Create Comment

**Endpoint**: `POST /comments-create`

Post a new comment (room-specific or general).

**Request Body**:
```typescript
interface CreateCommentRequest {
  anime_id: string;        // Anime ID
  room_id?: string;        // Room ID (optional for general comments)
  episode_number: number;  // Episode number
  parent_id?: string;      // Parent comment ID for replies
  user_id: string;        // User ID
  username: string;       // Username
  avatar_url?: string;    // Avatar URL
  message: string;        // Comment message
  video_timestamp?: number; // Optional video timestamp
}
```

**Response**:
```typescript
{
  success: true;
  data: {
    comment: Comment;        // Created comment object
    message: string;         // Success message
  }
}
```

### Get Comments by Episode

**Endpoint**: `GET /comments-get-by-episode`

Get comments for a specific episode with threading support.

**Query Parameters**:
- `anime_id` (string, required) - Anime ID
- `episode_number` (number, required) - Episode number
- `parent_id` (string) - Get replies to specific comment
- `limit` (number, default: 50) - Results per page
- `offset` (number, default: 0) - Pagination offset
- `order_by` (string, default: 'created_at') - Sort field
- `order_direction` ('asc' | 'desc', default: 'desc') - Sort direction
- `include_system` (boolean, default: false) - Include system messages

**Response**:
```typescript
{
  success: true;
  data: {
    comments: (Comment & {
      replies?: Comment[];      // Replies if getting top-level comments
    })[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      has_more: boolean;
    };
    filters: {
      anime_id: string;
      episode_number: number;
      parent_id?: string;
      include_system: boolean;
    };
  }
}
```

### Get Comment History

**Endpoint**: `GET /comments-get-history`

Get comment analytics and history with filtering.

**Query Parameters**:
- `anime_id` (string, required) - Anime ID
- `episode_number` (number) - Filter by episode
- `start_date` (string) - Start date (ISO format)
- `end_date` (string) - End date (ISO format)
- `user_id` (string) - Filter by user
- `limit` (number, default: 100) - Results per page
- `offset` (number, default: 0) - Pagination offset
- `order_by` (string, default: 'created_at') - Sort field
- `order_direction` ('asc' | 'desc', default: 'desc') - Sort direction
- `include_system` (boolean, default: false) - Include system messages

**Response**:
```typescript
{
  success: true;
  data: {
    comments: Comment[];
    comments_by_episode: {      // Grouped by episode
      [episode: number]: Comment[];
    };
    statistics: {
      total_comments: number;
      unique_episodes: number;
      unique_users: number;
      most_active_episodes: {
        episode_number: number;
        comment_count: number;
      }[];
    };
    pagination: {
      total: number;
      limit: number;
      offset: number;
      has_more: boolean;
    };
    filters: {
      anime_id: string;
      episode_number?: number;
      start_date?: string;
      end_date?: string;
      user_id?: string;
      include_system: boolean;
    };
  }
}
```

## Error Codes

| Error Code | Description | HTTP Status |
|------------|-------------|-------------|
| `method_not_allowed` | HTTP method not supported | 405 |
| `missing_params` | Required parameters missing | 400 |
| `invalid_body` | Invalid request body format | 400 |
| `room_not_found` | Room does not exist | 404 |
| `access_denied` | Invalid room access key | 403 |
| `already_joined` | User already in room | 409 |
| `not_in_room` | User not in room | 404 |
| `not_host` | User is not room host | 403 |
| `rate_limited` | Too many requests | 429 |
| `invalid_action` | Invalid sync action | 400 |
| `missing_time` | Current time required for seek | 400 |
| `invalid_updates` | Invalid update fields | 400 |
| `invalid_username` | Invalid username format | 400 |
| `username_too_long` | Username exceeds length limit | 400 |
| `invalid_time` | Invalid time value | 400 |
| `empty_message` | Comment message cannot be empty | 400 |
| `message_too_long` | Comment message too long | 400 |
| `invalid_timestamp` | Invalid video timestamp | 400 |
| `create_room_failed` | Room creation failed | 500 |
| `join_room_failed` | Room join failed | 500 |
| `leave_room_failed` | Room leave failed | 500 |
| `delete_room_failed` | Room deletion failed | 500 |
| `sync_control_failed` | Sync control failed | 500 |
| `get_host_time_failed` | Host time retrieval failed | 500 |
| `get_member_list_failed` | Member list retrieval failed | 500 |
| `update_member_status_failed` | Member status update failed | 500 |
| `create_comment_failed` | Comment creation failed | 500 |
| `get_comments_failed` | Comment retrieval failed | 500 |
| `get_comment_history_failed` | Comment history retrieval failed | 500 |

## Rate Limits

| Action | Limit | Window | Description |
|--------|-------|--------|-------------|
| `room_creation` | 10 | 1 hour | Create new rooms |
| `sync_control` | 2 | 1 second | Play/pause/seek controls |
| `comments` | 5 | 1 minute | Post comments |
| `room_management` | 20 | 1 hour | Join/leave/delete rooms |

## WebSocket Events

Real-time events are broadcast via Supabase Realtime channels:

### Channel Structure
- **Room Channel**: `room:{room_id}` - All room-specific events
- **Presence**: Automatic presence tracking for sync status

### Event Types
- `play` - Host started playback
- `pause` - Host paused playback  
- `seek` - Host seeked to new time
- `member_joined` - New member joined
- `member_left` - Member left room
- `new_host` - Host transferred
- `new_comment` - New comment posted

### Event Payload Format
```typescript
interface WebSocketEvent {
  type: string;
  payload: any;
  room_id: string;
  timestamp: number;
}
```

## SDK Integration

### JavaScript/TypeScript

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://ahigvhlqlikkkjsjikcj.supabase.co',
  'your-anon-key'
);

// Real-time connection
const channel = supabase.channel(`room:${roomId}`, {
  config: {
    broadcast: { self: true },
    presence: { key: userId }
  }
});

// Listen for room changes
channel.on('postgres_changes', 
  { event: 'UPDATE', schema: 'public', table: 'rooms' },
  (payload) => {
    console.log('Room updated:', payload.new);
  }
);

// Join presence
channel.on('presence', { event: 'join' }, (payload) => {
  console.log('User joined:', payload);
});

await channel.subscribe();
```

### Python

```python
import requests
import asyncio
import websockets

# HTTP API calls
async def create_room():
    response = requests.post(
        'https://ahigvhlqlikkkjsjikcj.supabase.co/functions/v1/rooms-create',
        json={
            'title': 'Watch Party',
            'anime_id': 'test-anime',
            'anime_title': 'Test Anime',
            'episode_number': 1,
            'video_url': 'https://example.com/video.mp4',
            'host_user_id': 'user123',
            'host_username': 'TestUser',
            'is_public': True
        }
    )
    return response.json()

# WebSocket connection
async def connect_realtime(room_id, user_id):
    uri = f"wss://ahigvhlqlikkkjsjikcj.supabase.co/realtime/v1/ws/{room_id}?apikey=your-key&token={user_id}"
    async with websockets.connect(uri) as websocket:
        await websocket.send(json.dumps({
            'event': 'phx_join',
            'topic': f'room:{room_id}',
            'payload': {},
            'ref': '1'
        }))
        
        async for message in websocket:
            data = json.loads(message)
            print(f"Received: {data}")
```

## Best Practices

1. **Use Realtime for Synchronization**: Leverage WebSocket events for real-time updates instead of polling
2. **Handle Connection Loss**: Implement reconnection logic for network interruptions
3. **Rate Limit Client-Side**: Respect server rate limits to avoid 429 errors
4. **Validate Input**: Always validate user input before sending to API
5. **Error Handling**: Implement comprehensive error handling for all API calls
6. **Presence Tracking**: Use presence system for efficient sync status monitoring
7. **Cleanup Resources**: Properly close WebSocket connections when leaving rooms

## Support

For API support:
- Check the error messages for specific issues
- Review rate limits if receiving 429 errors
- Verify room IDs and access keys for access issues
- Monitor Realtime connection status for sync problems