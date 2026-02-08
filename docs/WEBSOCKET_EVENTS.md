# WebSocket Events

Complete guide to real-time events and WebSocket communication in the Watchium platform.

## Overview

Watchium uses Supabase Realtime for all real-time communication, providing instant synchronization with <100ms latency. The WebSocket-first architecture ensures minimal latency and efficient resource usage.

## Connection Setup

### Basic Connection

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://ahigvhlqlikkkjsjikcj.supabase.co',
  'your-anon-key'
);

// Connect to room channel with presence tracking
const channel = supabase.channel(`room:${roomId}`, {
  config: {
    broadcast: { self: true },
    presence: { key: userId }
  }
});
```

### Advanced Configuration

```javascript
const channel = supabase.channel(`room:${roomId}`, {
  config: {
    broadcast: { self: true },
    presence: { 
      key: userId,
      // Custom presence data
      data: {
        username: 'User123',
        avatar_url: 'https://example.com/avatar.jpg'
      }
    }
  }
});
```

## Channel Structure

### Room Channels

- **Format**: `room:{room_id}`
- **Purpose**: All room-specific real-time events
- **Scope**: Room members only (enforced by RLS)

### Presence Tracking

- **Automatic**: Built-in presence system tracks online/offline status
- **Custom Data**: Include user metadata in presence payloads
- **Sync Status**: Presence used for efficient sync status tracking

## Event Types

### Playback Events

#### Play Event
```typescript
interface PlayEvent {
  type: 'play';
  payload: {
    current_time: number;    // New playback time
    user_id: string;         // Host user ID
    username: string;        // Host username
  };
  room_id: string;
  timestamp: number;
}
```

#### Pause Event
```typescript
interface PauseEvent {
  type: 'pause';
  payload: {
    current_time: number;    // Pause time
    user_id: string;         // Host user ID
    username: string;        // Host username
  };
  room_id: string;
  timestamp: number;
}
```

#### Seek Event
```typescript
interface SeekEvent {
  type: 'seek';
  payload: {
    current_time: number;    // New seek time
    user_id: string;         // Host user ID
    username: string;        // Host username
  };
  room_id: string;
  timestamp: number;
}
```

### Member Events

#### Member Joined
```typescript
interface MemberJoinedEvent {
  type: 'member_joined';
  payload: {
    user_id: string;         // New member ID
    username: string;        // New member username
    avatar_url?: string;     // New member avatar
  };
  room_id: string;
  timestamp: number;
}
```

#### Member Left
```typescript
interface MemberLeftEvent {
  type: 'member_left';
  payload: {
    user_id: string;         // Leaving member ID
    username: string;        // Leaving member username
  };
  room_id: string;
  timestamp: number;
}
```

#### New Host
```typescript
interface NewHostEvent {
  type: 'new_host';
  payload: {
    user_id: string;         // New host ID
    username: string;        // New host username
  };
  room_id: string;
  timestamp: number;
}
```

### Comment Events

#### New Comment
```typescript
interface NewCommentEvent {
  type: 'new_comment';
  payload: Comment;          // Full comment object
  room_id: string;
  timestamp: number;
}
```

### Heartbeat Events

#### Heartbeat
```typescript
interface HeartbeatEvent {
  type: 'heartbeat';
  payload: {
    user_id: string;         // User ID
    current_time: number;    // Current playback time
    is_synced: boolean;      // Sync status
  };
  room_id: string;
  timestamp: number;
}
```

## Event Handling

### Database Change Events

Listen for database changes that trigger automatic broadcasts:

```javascript
// Listen for room state changes (play/pause/seek)
channel.on('postgres_changes', 
  { 
    event: 'UPDATE', 
    schema: 'public', 
    table: 'rooms', 
    filter: `room_id=eq.${roomId}` 
  },
  (payload) => {
    // Auto-sync video to host state
    if (payload.new.host_user_id !== userId) {
      video.currentTime = payload.new.current_playback_time;
      if (payload.new.is_playing) {
        video.play();
      } else {
        video.pause();
      }
    }
    
    console.log('Room state changed:', payload.new);
  }
);

// Listen for member changes
channel.on('postgres_changes',
  { 
    event: '*', 
    schema: 'public', 
    table: 'room_members',
    filter: `room_id=eq.${roomId}` 
  },
  (payload) => {
    console.log('Member change:', payload.eventType, payload.new);
    
    if (payload.eventType === 'INSERT') {
      // New member joined
      showNotification(`${payload.new.username} joined the room`);
    } else if (payload.eventType === 'DELETE') {
      // Member left
      showNotification(`${payload.old.username} left the room`);
    }
  }
);

// Listen for new comments
channel.on('postgres_changes',
  { 
    event: 'INSERT', 
    schema: 'public', 
    table: 'comments',
    filter: `room_id=eq.${roomId}` 
  },
  (payload) => {
    if (!payload.new.is_system_message) {
      addCommentToUI(payload.new);
    }
  }
);
```

### Presence Events

```javascript
// Track member presence
channel.on('presence', { event: 'join' }, (payload) => {
  console.log('User joined presence:', payload);
  updateMemberList(payload);
});

channel.on('presence', { event: 'leave' }, (payload) => {
  console.log('User left presence:', payload);
  updateMemberList(payload);
});

channel.on('presence', { event: 'sync' }, (payload) => {
  console.log('Presence sync:', payload);
  // Update sync status indicators
});
```

### Broadcast Events

```javascript
// Listen for custom broadcast events
channel.on('broadcast', { event: 'play' }, (payload) => {
  console.log('Play broadcast:', payload);
  handlePlayEvent(payload.payload);
});

channel.on('broadcast', { event: 'pause' }, (payload) => {
  console.log('Pause broadcast:', payload);
  handlePauseEvent(payload.payload);
});

channel.on('broadcast', { event: 'seek' }, (payload) => {
  console.log('Seek broadcast:', payload);
  handleSeekEvent(payload.payload);
});
```

## Presence Tracking

### Sending Presence Updates

```javascript
// Track user presence every 3 seconds
const presenceInterval = setInterval(() => {
  channel.track({
    user_id: userId,
    current_time: video.currentTime,
    is_playing: !video.paused,
    username: currentUsername,
    avatar_url: currentAvatarUrl
  });
}, 3000);

// Clean up on disconnect
channel.on('close', () => {
  clearInterval(presenceInterval);
});
```

### Receiving Presence Data

```javascript
// Get current presence state
const presenceState = channel.presenceState();

// Get presence for specific user
const userPresence = channel.presenceState()[userId];

// Get all online users
const onlineUsers = Object.keys(channel.presenceState());
```

## Synchronization Algorithm

### Host-Client Sync Model

1. **Host Authority**: Only host can control playback
2. **Real-time Broadcasts**: All host actions trigger immediate broadcasts
3. **Client Sync**: Clients auto-sync to host state on events
4. **Presence Tracking**: 3-second heartbeat for sync status

### Sync Tolerance

- **Threshold**: 2 seconds difference
- **Status**: Users within tolerance are "in sync"
- **Calculation**: `abs(host_time - member_time) <= 2`

### Implementation Example

```javascript
class VideoSyncManager {
  constructor(channel, userId, videoElement) {
    this.channel = channel;
    this.userId = userId;
    this.video = videoElement;
    this.isHost = false;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // Listen for playback events
    this.channel.on('broadcast', { event: 'play' }, (payload) => {
      if (payload.payload.user_id !== this.userId) {
        this.video.currentTime = payload.payload.current_time;
        this.video.play();
      }
    });

    this.channel.on('broadcast', { event: 'pause' }, (payload) => {
      if (payload.payload.user_id !== this.userId) {
        this.video.currentTime = payload.payload.current_time;
        this.video.pause();
      }
    });

    this.channel.on('broadcast', { event: 'seek' }, (payload) => {
      if (payload.payload.user_id !== this.userId) {
        this.video.currentTime = payload.payload.current_time;
      }
    });

    // Track video events for host
    this.video.addEventListener('play', () => {
      if (this.isHost) {
        this.broadcastPlay();
      }
    });

    this.video.addEventListener('pause', () => {
      if (this.isHost) {
        this.broadcastPause();
      }
    });

    this.video.addEventListener('seek', () => {
      if (this.isHost) {
        this.broadcastSeek();
      }
    });
  }

  async broadcastPlay() {
    await fetch('/functions/v1/sync/control', {
      method: 'POST',
      body: JSON.stringify({
        room_id: this.roomId,
        user_id: this.userId,
        action: 'play',
        current_time: this.video.currentTime
      })
    });
  }

  async broadcastPause() {
    await fetch('/functions/v1/sync/control', {
      method: 'POST',
      body: JSON.stringify({
        room_id: this.roomId,
        user_id: this.userId,
        action: 'pause',
        current_time: this.video.currentTime
      })
    });
  }

  async broadcastSeek() {
    await fetch('/functions/v1/sync/control', {
      method: 'POST',
      body: JSON.stringify({
        room_id: this.roomId,
        user_id: this.userId,
        action: 'seek',
        current_time: this.video.currentTime
      })
    });
  }

  startPresenceTracking() {
    this.presenceInterval = setInterval(() => {
      this.channel.track({
        user_id: this.userId,
        current_time: this.video.currentTime,
        is_playing: !this.video.paused
      });
    }, 3000);
  }

  stopPresenceTracking() {
    if (this.presenceInterval) {
      clearInterval(this.presenceInterval);
    }
  }
}
```

## Error Handling

### Connection Errors

```javascript
channel
  .on('error', (error) => {
    console.error('Channel error:', error);
    showNotification('Connection error. Attempting to reconnect...');
  })
  .on('close', (event) => {
    console.log('Channel closed:', event);
    if (!event.wasClean) {
      // Attempt reconnection
      setTimeout(() => {
        this.connectToRoom(roomId);
      }, 1000);
    }
  });
```

### Subscription Errors

```javascript
const subscription = await channel.subscribe((status) => {
  if (status === 'SUBSCRIBED') {
    console.log('Successfully subscribed to room');
  } else if (status === 'CHANNEL_ERROR') {
    console.error('Channel subscription failed');
    showNotification('Failed to join room. Please try again.');
  }
});
```

## Performance Optimization

### Efficient Event Handling

```javascript
// Debounce rapid events
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Debounce video seek events
const debouncedSeek = debounce((time) => {
  if (this.isHost) {
    this.broadcastSeek();
  }
}, 500);

video.addEventListener('seek', () => {
  debouncedSeek(video.currentTime);
});
```

### Batch Presence Updates

```javascript
// Batch multiple presence updates
let pendingPresenceUpdate = null;
let presenceTimeout = null;

const schedulePresenceUpdate = (data) => {
  pendingPresenceUpdate = { ...pendingPresenceUpdate, ...data };
  
  if (presenceTimeout) {
    clearTimeout(presenceTimeout);
  }
  
  presenceTimeout = setTimeout(() => {
    if (pendingPresenceUpdate) {
      channel.track(pendingPresenceUpdate);
      pendingPresenceUpdate = null;
    }
  }, 100);
};
```

## Client Libraries

### JavaScript/TypeScript

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, key);
const channel = supabase.channel(`room:${roomId}`, config);
```

### Python

```python
import asyncio
import websockets
import json

async def connect_to_room(room_id, user_id, api_key):
    uri = f"wss://ahigvhlqlikkkjsjikcj.supabase.co/realtime/v1/ws/{room_id}?apikey={api_key}&token={user_id}"
    
    async with websockets.connect(uri) as websocket:
        # Join room
        await websocket.send(json.dumps({
            "event": "phx_join",
            "topic": f"room:{room_id}",
            "payload": {},
            "ref": "1"
        }))
        
        # Listen for events
        async for message in websocket:
            data = json.loads(message)
            handle_websocket_event(data)
```

### React Hook

```javascript
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

export function useRealtimeRoom(roomId, userId) {
  const [members, setMembers] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  
  useEffect(() => {
    const supabase = createClient(url, key);
    const channel = supabase.channel(`room:${roomId}`, {
      config: {
        broadcast: { self: true },
        presence: { key: userId }
      }
    });

    channel
      .on('presence', { event: 'sync' }, (payload) => {
        setMembers(Object.values(payload.presences));
      })
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      channel.unsubscribe();
    };
  }, [roomId, userId]);

  return { members, isConnected };
}
```

## Debugging

### Enable Debug Logging

```javascript
// Enable debug mode for development
const channel = supabase.channel(`room:${roomId}`, {
  config: {
    broadcast: { self: true },
    presence: { key: userId },
    debug: true  // Enable debug logging
  }
});
```

### Monitor Connection State

```javascript
channel.on('system', {}, (payload) => {
  console.log('System event:', payload);
});

channel.subscribe((status, err) => {
  console.log('Subscription status:', status, err);
});
```

### Event Logging

```javascript
// Log all events for debugging
channel.on('*', (payload, ref) => {
  console.log(`Event ${payload.type}:`, payload);
});
```

## Best Practices

1. **Connection Management**: Always handle connection errors and implement reconnection logic
2. **Event Debouncing**: Debounce rapid events like seeking to avoid excessive broadcasts
3. **Presence Efficiency**: Use presence tracking for sync status instead of polling
4. **Error Boundaries**: Wrap WebSocket code in error boundaries
5. **Resource Cleanup**: Always unsubscribe and clean up intervals on unmount
6. **Rate Limiting**: Respect server-side rate limits in client code
7. **State Management**: Use presence state for efficient member list updates

## Troubleshooting

### Common Issues

1. **Connection Failed**: Check API key and room ID validity
2. **No Events Received**: Verify RLS policies and room membership
3. **Sync Issues**: Check presence tracking and event handling
4. **Performance Problems**: Reduce event frequency and implement debouncing
5. **Memory Leaks**: Ensure proper cleanup of intervals and subscriptions

### Debug Commands

```javascript
// Check connection status
console.log('Channel state:', channel.state);

// Check presence state
console.log('Presence state:', channel.presenceState());

// Check subscriptions
console.log('Subscriptions:', channel.subscriptions);
```

This WebSocket event system provides the foundation for real-time synchronization in the Watchium platform, enabling seamless multi-user anime watching experiences.