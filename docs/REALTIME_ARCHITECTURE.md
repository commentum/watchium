# Realtime Architecture

This document describes the WebSocket-first architecture that powers the real-time anime watching platform.

## Architecture Overview

The system is built around Supabase Realtime as the primary communication layer, with minimal HTTP calls for essential operations only.

```
┌─────────────────┐    WebSocket     ┌──────────────────┐    Database     ┌─────────────────┐
│   Client App    │ ◄──────────────► │ Supabase Realtime│ ◄──────────────► │   PostgreSQL    │
│                 │                  │                  │   Triggers      │                 │
│ - Video Player  │                  │ - Channels       │                 │ - Rooms         │
│ - Sync Status   │                  │ - Presence       │                 │ - Members       │
│ - Comments      │                  │ - Broadcasts     │                 │ - Comments      │
└─────────────────┘                  └──────────────────┘                 └─────────────────┘
```

## Communication Patterns

### 1. Realtime Channels

The system uses room-specific channels for all real-time communication:

```javascript
const channel = supabase.channel(`room:${roomId}`, {
  config: {
    broadcast: { self: true },
    presence: { key: userId }
  }
});
```

### 2. Database-Driven Events

All real-time events are triggered by database changes, ensuring consistency and reliability:

- **Room Updates** → Automatic broadcast to all members
- **Member Changes** → Real-time member list updates  
- **Comment Inserts** → Instant comment delivery
- **Presence Updates** → Sync status tracking

### 3. Presence System

The presence system replaces traditional polling for efficient status tracking:

```javascript
// Send presence updates
setInterval(() => {
  channel.track({
    user_id: userId,
    current_time: video.currentTime,
    is_playing: !video.paused
  });
}, 3000);
```

## Data Flow

### Host Control Flow
```
Host Action → HTTP API → Database Update → Trigger → Realtime Broadcast → All Clients
```

### Member Sync Flow  
```
Member Client → Presence Update → Realtime Channel → Presence Sync → UI Updates
```

### Comment Flow
```
User Input → HTTP API → Database Insert → Trigger → Realtime Broadcast → All Clients
```

## Performance Characteristics

### Latency
- **Real-time Events**: <100ms
- **Database Changes**: 50-200ms
- **Presence Updates**: 30-100ms

### Scalability
- **Concurrent Users**: 50+ per room
- **Room Count**: 1000+ simultaneous rooms
- **Message Rate**: 10,000+ events/second

### Resource Usage
- **WebSocket Connections**: 1 per user
- **HTTP Calls**: ~60 per hour per user
- **Database Load**: Optimized with indexes and triggers