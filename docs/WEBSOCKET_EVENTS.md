# WebSocket Events

This document describes all real-time events that are broadcast through Supabase Realtime channels for seamless room synchronization.

## Connection

Clients connect to room-specific channels with presence tracking:

```javascript
const channel = supabase.channel(`room:${roomId}`, {
  config: {
    broadcast: { self: true },
    presence: { key: userId }
  }
});
```

## Event Types

The system uses two primary event mechanisms:

1. **Database Change Events**: Automatic broadcasts from table updates
2. **Presence Events**: User presence and sync status tracking

## Database Change Events

These events are automatically triggered by database changes and broadcast to all room members.

### Room State Changes

**Trigger**: Updates to the `rooms` table

#### Events
- `postgres_changes` with `event: 'UPDATE'` on `rooms` table

#### Payload Structure
```json
{
  "schema": "public",
  "table": "rooms",
  "event_type": "UPDATE",
  "new": {
    "room_id": "abc123def4",
    "current_time": 123.45,
    "is_playing": true,
    "updated_at": "2024-01-01T12:00:00Z"
  },
  "old": {
    "current_time": 100.00,
    "is_playing": false
  }
}
```

#### Client Handling
```javascript
channel.on('postgres_changes', 
  { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `room_id=eq.${roomId}` },
  (payload) => {
    const roomState = payload.new;
    
    // Auto-sync video if not host
    if (roomState.host_user_id !== currentUserId) {
      video.currentTime = roomState.current_time;
      if (roomState.is_playing) {
        video.play();
      } else {
        video.pause();
      }
    }
    
    // Update UI
    updatePlaybackControls(roomState);
  }
);
```

### Member Changes

**Trigger**: Updates to the `room_members` table

#### Events
- `postgres_changes` with `event: 'INSERT'` - Member joined
- `postgres_changes` with `event: 'DELETE'` - Member left  
- `postgres_changes` with `event: 'UPDATE'` - Member status changed

#### Join Event Payload
```json
{
  "schema": "public",
  "table": "room_members", 
  "event_type": "INSERT",
  "new": {
    "id": "uuid",
    "room_id": "abc123def4",
    "user_id": "user456",
    "username": "Viewer123",
    "avatar_url": "https://example.com/avatar.jpg",
    "is_host": false,
    "is_synced": true,
    "current_time": 0,
    "joined_at": "2024-01-01T12:00:00Z"
  }
}
```

#### Leave Event Payload
```json
{
  "schema": "public",
  "table": "room_members",
  "event_type": "DELETE", 
  "old": {
    "user_id": "user456",
    "username": "Viewer123",
    "is_host": false
  }
}
```

#### Status Update Payload
```json
{
  "schema": "public",
  "table": "room_members",
  "event_type": "UPDATE",
  "new": {
    "user_id": "user456", 
    "is_synced": false,
    "current_time": 150.75,
    "last_heartbeat": "2024-01-01T12:00:00Z"
  },
  "old": {
    "is_synced": true,
    "current_time": 148.20
  }
}
```

### Comment Events

**Trigger**: Inserts into the `comments` table

#### Event Payload
```json
{
  "schema": "public",
  "table": "comments",
  "event_type": "INSERT",
  "new": {
    "id": "uuid",
    "anime_id": "aot-1",
    "room_id": "abc123def4", 
    "episode_number": 1,
    "parent_id": null,
    "user_id": "user456",
    "username": "Viewer123",
    "avatar_url": "https://example.com/avatar.jpg",
    "message": "This opening is amazing!",
    "video_timestamp": 120.5,
    "is_anchor": false,
    "is_system_message": false,
    "created_at": "2024-01-01T12:00:00Z"
  }
}
```

## Presence Events

Presence events track user sync status and availability in real-time.

### Presence Sync

**Trigger**: Regular presence updates from clients (every 3 seconds)

#### Event
```javascript
channel.on('presence', { event: 'sync' }, () => {
  const newState = channel.presenceState();
  // Handle full presence state sync
});
```

#### State Structure
```json
{
  "user123": [
    {
      "user_id": "user123",
      "username": "AnimeFan", 
      "current_time": 123.45,
      "is_playing": true,
      "last_update": 1704110400000
    }
  ],
  "user456": [
    {
      "user_id": "user456",
      "username": "Viewer123",
      "current_time": 125.20, 
      "is_playing": true,
      "last_update": 1704110403000
    }
  ]
}
```

### Presence Join

**Trigger**: User comes online or joins room

#### Event
```javascript
channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
  console.log(`User ${key} joined:`, newPresences);
});
```

### Presence Leave

**Trigger**: User goes offline or leaves room

#### Event  
```javascript
channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
  console.log(`User ${key} left:`, leftPresences);
});
```

---

## Client Implementation Guide

### Event Handling Pattern

```javascript
class RoomClient {
  constructor(roomId, userId) {
    this.roomId = roomId;
    this.userId = userId;
    this.channel = null;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.channel = supabase
      .channel(`room:${this.roomId}`)
      .on('broadcast', { event: 'play' }, (payload) => {
        this.handlePlay(payload.payload);
      })
      .on('broadcast', { event: 'pause' }, (payload) => {
        this.handlePause(payload.payload);
      })
      .on('broadcast', { event: 'seek' }, (payload) => {
        this.handleSeek(payload.payload);
      })
      .on('broadcast', { event: 'member_joined' }, (payload) => {
        this.handleMemberJoined(payload.payload);
      })
      .on('broadcast', { event: 'member_left' }, (payload) => {
        this.handleMemberLeft(payload.payload);
      })
      .on('broadcast', { event: 'new_comment' }, (payload) => {
        this.handleNewComment(payload.payload);
      })
      .on('broadcast', { event: 'heartbeat' }, (payload) => {
        this.handleHeartbeat(payload.payload);
      })
      .subscribe();
  }

  handlePlay(payload) {
    if (payload.user_id !== this.userId) {
      this.video.currentTime = payload.current_time;
      this.video.play();
      this.updatePlaybackState(true);
      this.showNotification(`${payload.username} resumed playback`);
    }
  }

  handlePause(payload) {
    if (payload.user_id !== this.userId) {
      this.video.currentTime = payload.current_time;
      this.video.pause();
      this.updatePlaybackState(false);
      this.showNotification(`${payload.username} paused playback`);
    }
  }

  handleSeek(payload) {
    if (payload.user_id !== this.userId) {
      this.video.currentTime = payload.current_time;
      this.updateSeekPosition(payload.current_time);
      this.showNotification(`${payload.username} seeked to ${this.formatTime(payload.current_time)}`);
    }
  }

  handleMemberJoined(payload) {
    this.addMemberToList(payload);
    this.updateMemberCount();
    this.showNotification(`${payload.username} joined the room`);
  }

  handleMemberLeft(payload) {
    this.removeMemberFromList(payload.user_id);
    this.updateMemberCount();
    this.showNotification(`${payload.username} left the room`);
  }

  handleNewComment(payload) {
    this.addComment(payload);
    if (!payload.is_system_message) {
      this.showCommentNotification(payload);
    }
  }

  handleHeartbeat(payload) {
    this.updateMemberSyncStatus(payload.user_id, payload.is_synced);
  }

  disconnect() {
    if (this.channel) {
      this.channel.unsubscribe();
    }
  }
}
```

### Event Throttling

Some events should be throttled to prevent UI spam:

```javascript
class ThrottledEventHandler {
  constructor() {
    this.lastNotification = 0;
    this.notificationQueue = [];
  }

  throttledNotification(message, delay = 1000) {
    const now = Date.now();
    if (now - this.lastNotification > delay) {
      this.showNotification(message);
      this.lastNotification = now;
    } else {
      this.queueNotification(message);
    }
  }

  queueNotification(message) {
    this.notificationQueue.push(message);
    setTimeout(() => {
      if (this.notificationQueue.length > 0) {
        const nextMessage = this.notificationQueue.shift();
        this.showNotification(nextMessage);
        this.lastNotification = Date.now();
      }
    }, 1000);
  }
}
```

### Error Handling

Always handle WebSocket errors gracefully:

```javascript
this.channel
  .on('broadcast', { event: '*' }, (payload) => {
    try {
      this.handleEvent(payload);
    } catch (error) {
      console.error('Error handling event:', error);
      // Continue processing other events
    }
  })
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('Connected to room channel');
    } else if (status === 'CHANNEL_ERROR') {
      console.error('Channel error, attempting to reconnect...');
      this.attemptReconnect();
    }
  });
```

---

## Performance Considerations

### Event Frequency

- **Heartbeat**: Every 2-3 seconds per user
- **Playback Events**: On user action (play/pause/seek)
- **Member Events**: When users join/leave
- **Comment Events**: When comments are posted

### Memory Management

- Clean up event listeners when leaving rooms
- Limit stored event history
- Use object pooling for frequent event objects

### Network Optimization

- Batch multiple updates when possible
- Use efficient JSON serialization
- Compress large payloads if needed

---

## Testing Events

Use the Supabase dashboard to test events:

```sql
-- Test broadcast event
SELECT supabase.rpc('broadcast_room_event', {
  p_room_id => 'test-room-id',
  p_event_type => 'test_event',
  p_payload => '{"message": "Hello World"}'::jsonb
});
```

---

## Debugging

Enable debug logging to trace events:

```javascript
supabase.realtime.setAuth('your-token');
supabase.realtime.onConnect(() => {
  console.log('Realtime connected');
});

supabase.realtime.onDisconnect(() => {
  console.log('Realtime disconnected');
});
```