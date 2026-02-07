# API Reference

This document provides comprehensive documentation for all API endpoints in the real-time anime watching platform.

## Base URL

All Edge Functions are accessible via:
```
https://your-project.supabase.co/functions/v1/{function-name}
```

## Authentication

No authentication keys are required for API access. The system is designed to work without Supabase authentication.

## Communication Architecture

The platform uses a hybrid approach:
- **Realtime Communication**: Primary method for sync, presence, and live updates
- **HTTP API**: Essential operations like room management and host controls

## Common Response Format

All API responses follow this format:

### Success Response
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "error": "error_code",
    "message": "Human readable error message",
    "details": { ... }
  }
}
```

## CORS Headers

All endpoints include CORS headers:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type`
- `Access-Control-Allow-Methods: POST, GET, OPTIONS, PUT, DELETE`

---

## Room Management

### Create Room

**Endpoint:** `/rooms-create`  
**Method:** `POST`

Creates a new watching room.

#### Request Body
```json
{
  "title": "string",
  "anime_id": "string",
  "anime_title": "string", 
  "episode_number": "number",
  "video_url": "string",
  "source_id": "string (optional)",
  "host_user_id": "string",
  "host_username": "string",
  "is_public": "boolean",
  "access_key": "string (optional for private rooms)"
}
```

#### Response
```json
{
  "success": true,
  "data": {
    "room": { ...Room object... },
    "access_key": "string (for private rooms)",
    "realtime_channel": "room:abc123def4",
    "presence_key": "host_user_id"
  }
}
```

#### Rate Limits
- 10 rooms per user per hour

---

### Join Room

**Endpoint:** `/rooms-join`  
**Method:** `POST`

Adds a user to an existing room.

#### Request Body
```json
{
  "room_id": "string",
  "user_id": "string", 
  "username": "string",
  "avatar_url": "string (optional)",
  "access_key": "string (required for private rooms)"
}
```

#### Response
```json
{
  "success": true,
  "data": {
    "member": { ...RoomMember object... },
    "room": {
      "room_id": "string",
      "title": "string",
      "anime_title": "string",
      "episode_number": "number",
      "video_url": "string",
      "current_time": "number",
      "is_playing": "boolean",
      "host_username": "string"
    }
  }
}
```

---

### Leave Room

**Endpoint:** `/rooms-leave`  
**Method:** `POST`

Removes a user from a room.

#### Request Body
```json
{
  "room_id": "string",
  "user_id": "string"
}
```

#### Response
```json
{
  "success": true,
  "data": {
    "message": "Successfully left the room",
    "was_host": "boolean"
  }
}
```

---

### Delete Room

**Endpoint:** `/rooms-delete`  
**Method:** `DELETE`

Deletes a room (host only).

#### Request Body
```json
{
  "room_id": "string",
  "user_id": "string"
}
```

#### Response
```json
{
  "success": true,
  "data": {
    "message": "Room deleted successfully",
    "room_id": "string"
  }
}
```

---

### List Public Rooms

**Endpoint:** `/rooms-list-public`  
**Method:** `GET`

Retrieves a list of public rooms.

#### Query Parameters
- `limit` (number, default: 50, max: 100)
- `offset` (number, default: 0)
- `order_by` (string, default: "last_activity")
- `order_direction` ("asc" | "desc", default: "desc")
- `anime_id` (string, optional)
- `min_members` (number, optional)

#### Response
```json
{
  "success": true,
  "data": {
    "rooms": [
      {
        ...Room object...,
        "member_count": "number"
      }
    ],
    "pagination": {
      "total": "number",
      "limit": "number", 
      "offset": "number",
      "has_more": "boolean"
    }
  }
}
```

---

## Synchronization

### Sync Control

**Endpoint:** `/sync/control`  
**Method:** `POST`

Unified endpoint for all host playback controls (play, pause, seek).

#### Request Body
```json
{
  "room_id": "string",
  "user_id": "string",
  "action": "play" | "pause" | "seek",
  "current_time": "number (required for seek action)"
}
```

#### Response
```json
{
  "success": true,
  "data": {
    "room": {
      "room_id": "string",
      "current_time": "number",
      "is_playing": "boolean",
      "updated_at": "string"
    },
    "message": "Playback resumed successfully",
    "note": "Realtime broadcasts will automatically notify all room members"
  }
}
```

#### Rate Limits
- Play/Pause: 1 request per second per user
- Seek: 2 requests per second per user

---

### Get Host Time

**Endpoint:** `/sync-get-host-time`  
**Method:** `GET` or `POST`

Gets current host playback state and user sync status.

#### Query Parameters (GET) or Request Body (POST)
- `room_id` (string, required)
- `user_id` (string, required)

#### Response
```json
{
  "success": true,
  "data": {
    "host_time": {
      "current_time": "number",
      "is_playing": "boolean",
      "playback_speed": "number",
      "last_updated": "string"
    },
    "user_sync_status": {
      "is_synced": "boolean",
      "time_difference": "number",
      "user_current_time": "number"
    },
    "host_info": {
      "user_id": "string",
      "username": "string",
      "avatar_url": "string"
    },
    "room_info": {
      "anime_title": "string",
      "episode_number": "number",
      "title": "string"
    }
  }
}
```

## Realtime Events

Most synchronization happens through Realtime events rather than HTTP calls. See [WEBSOCKET_EVENTS.md](./WEBSOCKET_EVENTS.md) for complete event documentation.

---

## Comments

### Create Comment

**Endpoint:** `/comments-create`  
**Method:** `POST`

Creates a new comment.

#### Request Body
```json
{
  "anime_id": "string",
  "room_id": "string (optional)",
  "episode_number": "number",
  "parent_id": "string (optional)",
  "user_id": "string",
  "username": "string",
  "avatar_url": "string (optional)",
  "message": "string",
  "video_timestamp": "number (optional)"
}
```

#### Response
```json
{
  "success": true,
  "data": {
    "comment": { ...Comment object... },
    "message": "Comment created successfully"
  }
}
```

#### Rate Limits
- 5 comments per minute per user
- Maximum message length: 1000 characters

---

### Get Comments by Episode

**Endpoint:** `/comments-get-by-episode`  
**Method:** `GET`

Retrieves comments for a specific episode.

#### Query Parameters
- `anime_id` (string, required)
- `episode_number` (number, required)
- `limit` (number, default: 50, max: 100)
- `offset` (number, default: 0)
- `order_by` (string, default: "created_at")
- `order_direction` ("asc" | "desc", default: "desc")
- `parent_id` (string, optional - for threaded comments)
- `include_system` (boolean, default: false)

#### Response
```json
{
  "success": true,
  "data": {
    "comments": [
      {
        ...Comment object...,
        "replies": [ ...Comment objects... ]
      }
    ],
    "pagination": {
      "total": "number",
      "limit": "number",
      "offset": "number", 
      "has_more": "boolean"
    },
    "filters": {
      "anime_id": "string",
      "episode_number": "number",
      "parent_id": "string",
      "include_system": "boolean"
    }
  }
}
```

---

### Get Comment History

**Endpoint:** `/comments-get-history`  
**Method:** `GET`

Retrieves comment history with statistics.

#### Query Parameters
- `anime_id` (string, required)
- `episode_number` (number, optional)
- `start_date` (string, optional - ISO 8601)
- `end_date` (string, optional - ISO 8601)
- `user_id` (string, optional)
- `limit` (number, default: 100, max: 200)
- `offset` (number, default: 0)
- `order_by` (string, default: "created_at")
- `order_direction` ("asc" | "desc", default: "desc")
- `include_system` (boolean, default: false)

#### Response
```json
{
  "success": true,
  "data": {
    "comments": [ ...Comment objects... ],
    "comments_by_episode": {
      "1": [ ...Comment objects... ],
      "2": [ ...Comment objects... ]
    },
    "statistics": {
      "total_comments": "number",
      "unique_episodes": "number",
      "unique_users": "number",
      "most_active_episodes": [
        {
          "episode_number": "number",
          "comment_count": "number"
        }
      ]
    },
    "pagination": {
      "total": "number",
      "limit": "number",
      "offset": "number",
      "has_more": "boolean"
    }
  }
}
```

---

## Members

### Get Member List

**Endpoint:** `/members-get-list`  
**Method:** `GET`

Retrieves list of room members with sync status.

#### Query Parameters
- `room_id` (string, required)
- `include_sync_status` (boolean, default: true)
- `sort_by` (string, default: "joined_at")
- `sort_direction` ("asc" | "desc", default: "asc")

#### Response
```json
{
  "success": true,
  "data": {
    "members": [
      {
        ...RoomMember object...,
        "sync_status": {
          "is_synced": "boolean",
          "time_difference": "number",
          "host_time": "number",
          "member_time": "number"
        }
      }
    ],
    "room_info": {
      "room_id": "string",
      "current_time": "number",
      "is_playing": "boolean",
      "anime_id": "string",
      "episode_number": "number"
    },
    "statistics": {
      "total_members": "number",
      "synced_members": "number",
      "sync_percentage": "number",
      "host": {
        "user_id": "string",
        "username": "string",
        "avatar_url": "string"
      }
    },
    "recent_activity": [ ...SyncState objects... ]
  }
}
```

---

### Update Member Status

**Endpoint:** `/members-update-status`  
**Method:** `PUT` or `POST`

Updates member information.

#### Request Body
```json
{
  "room_id": "string",
  "user_id": "string",
  "updates": {
    "username": "string (optional)",
    "avatar_url": "string (optional)",
    "current_time": "number (optional)",
    "is_synced": "boolean (optional)"
  }
}
```

#### Response
```json
{
  "success": true,
  "data": {
    "member": { ...RoomMember object... },
    "message": "Member status updated successfully"
  }
}
```

#### Validation Rules
- Username: Required, max 50 characters, cannot be empty
- Current time: Must be non-negative
- Only allowed fields can be updated

---

## Error Codes

| Error Code | Description |
|------------|-------------|
| `method_not_allowed` | HTTP method not supported |
| `missing_params` | Required parameters missing |
| `invalid_request` | Invalid request format |
| `room_not_found` | Room does not exist |
| `not_in_room` | User is not a member of the room |
| `not_host` | User is not the room host |
| `access_denied` | Invalid room access credentials |
| `already_joined` | User is already in the room |
| `rate_limited` | Too many requests |
| `create_room_failed` | Failed to create room |
| `join_room_failed` | Failed to join room |
| `leave_room_failed` | Failed to leave room |
| `delete_room_failed` | Failed to delete room |
| `sync_control_failed` | Sync control operation failed |
| `create_comment_failed` | Failed to create comment |
| `get_comments_failed` | Failed to retrieve comments |
| `get_member_list_failed` | Failed to get member list |
| `update_member_status_failed` | Failed to update member status |

---

## Rate Limiting

Rate limits are enforced per user per action type:

- **Room Creation**: 10 per hour
- **Sync Control**: 2 per second  
- **Comments**: 5 per minute
- **Room Management**: 20 per hour

When rate limited, the API returns a 429 status with error code `rate_limited`.

---

## WebSocket Events

All endpoints broadcast real-time events to room members via Supabase Realtime. See [WEBSOCKET_EVENTS.md](./WEBSOCKET_EVENTS.md) for detailed event documentation.