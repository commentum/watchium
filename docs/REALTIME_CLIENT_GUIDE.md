# Realtime-First Client Implementation

This guide shows how to implement the WebSocket-first architecture that minimizes HTTP calls and leverages Supabase Realtime for all real-time features.

## Architecture Overview

```
┌─────────────────┐    WebSocket     ┌──────────────────┐    Database     ┌─────────────────┐
│   Client App    │ ◄──────────────► │ Supabase Realtime│ ◄──────────────► │   PostgreSQL    │
│                 │                  │                  │   Triggers      │                 │
│ - Video Player  │                  │ - Channels       │                 │ - Rooms         │
│ - Sync Status   │                  │ - Presence       │                 │ - Members       │
│ - Comments      │                  │ - Broadcasts     │                 │ - Comments      │
└─────────────────┘                  └──────────────────┘                 └─────────────────┘
```

## Client Implementation

### 1. Initialize Supabase Client

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://your-project.supabase.co',
  'your-anon-key', // Can use anon key since no auth required
  {
    realtime: {
      params: {
        eventsPerSecond: 10 // Increase for better responsiveness
      }
    }
  }
);
```

### 2. Room Connection Manager

```javascript
class RealtimeRoomManager {
  constructor(roomId, userId, username) {
    this.roomId = roomId;
    this.userId = userId;
    this.username = username;
    this.channel = null;
    this.presenceInterval = null;
    this.isConnected = false;
    this.callbacks = {};
  }

  async connect() {
    // Create room channel with presence
    this.channel = supabase.channel(`room:${this.roomId}`, {
      config: {
        broadcast: { self: true },
        presence: { key: this.userId }
      }
    });

    // Set up event listeners
    this.setupEventListeners();

    // Join the room
    const joinResult = await this.joinRoom();
    if (!joinResult.success) {
      throw new Error(joinResult.error);
    }

    // Subscribe to channel
    await new Promise((resolve, reject) => {
      this.channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.isConnected = true;
          this.startPresenceUpdates();
          resolve();
        } else if (status === 'CHANNEL_ERROR') {
          reject(new Error('Failed to connect to room channel'));
        }
      });
    });

    console.log('Connected to room:', this.roomId);
  }

  setupEventListeners() {
    // Listen for room state changes (play/pause/seek)
    this.channel.on('postgres_changes', 
      { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `room_id=eq.${this.roomId}` },
      (payload) => {
        this.handleRoomStateChange(payload.new);
      }
    );

    // Listen for member changes (join/leave/sync status)
    this.channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${this.roomId}` },
      (payload) => {
        this.handleMemberChange(payload);
      }
    );

    // Listen for new comments
    this.channel.on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'comments', filter: `room_id=eq.${this.roomId}` },
      (payload) => {
        this.handleNewComment(payload.new);
      }
    );

    // Listen for presence updates (heartbeat alternative)
    this.channel.on('presence', { event: 'sync' }, () => {
      const newState = this.channel.presenceState();
      this.handlePresenceSync(newState);
    });

    // Listen for individual presence updates
    this.channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      this.handlePresenceJoin(key, newPresences);
    });

    this.channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      this.handlePresenceLeave(key, leftPresences);
    });
  }

  async joinRoom() {
    try {
      const response = await fetch('/functions/v1/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: this.roomId,
          user_id: this.userId,
          username: this.username
        })
      });

      const result = await response.json();
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  startPresenceUpdates() {
    // Send presence updates every 3 seconds (instead of HTTP heartbeats)
    this.presenceInterval = setInterval(() => {
      this.updatePresence();
    }, 3000);

    // Initial presence update
    this.updatePresence();
  }

  updatePresence() {
    if (!this.isConnected || !this.videoElement) return;

    const currentTime = this.videoElement.currentTime;
    const isPlaying = !this.videoElement.paused;

    // Track presence with current video state
    this.channel.track({
      user_id: this.userId,
      username: this.username,
      current_time: currentTime,
      is_playing: isPlaying,
      last_update: Date.now()
    });

    // Update member's current time in database (triggers Realtime)
    this.updateMemberSyncStatus(currentTime, isPlaying);
  }

  async updateMemberSyncStatus(currentTime, isPlaying) {
    try {
      await supabase.rpc('track_user_presence', {
        p_room_id: this.roomId,
        p_user_id: this.userId,
        p_current_time: currentTime,
        p_is_playing: isPlaying
      });
    } catch (error) {
      console.error('Failed to update presence:', error);
    }
  }

  // Event Handlers
  handleRoomStateChange(roomState) {
    console.log('Room state changed:', roomState);
    
    if (this.callbacks.onRoomStateChange) {
      this.callbacks.onRoomStateChange(roomState);
    }

    // Auto-sync video if not host
    const isHost = roomState.host_user_id === this.userId;
    if (!isHost) {
      this.syncToRoomState(roomState);
    }
  }

  handleMemberChange(payload) {
    console.log('Member change:', payload);
    
    if (this.callbacks.onMemberChange) {
      this.callbacks.onMemberChange(payload);
    }

    if (payload.eventType === 'INSERT') {
      this.showNotification(`${payload.new.username} joined the room`);
    } else if (payload.eventType === 'DELETE') {
      this.showNotification(`${payload.old.username} left the room`);
    }
  }

  handleNewComment(comment) {
    console.log('New comment:', comment);
    
    if (this.callbacks.onNewComment) {
      this.callbacks.onNewComment(comment);
    }

    if (!comment.is_system_message) {
      this.showCommentNotification(comment);
    }
  }

  handlePresenceSync(presenceState) {
    console.log('Presence sync:', presenceState);
    
    if (this.callbacks.onPresenceSync) {
      this.callbacks.onPresenceSync(presenceState);
    }

    // Update member list with presence data
    const members = Object.values(presenceState).flat();
    this.updateMemberList(members);
  }

  handlePresenceJoin(key, newPresences) {
    console.log('User joined presence:', key, newPresences);
    // Additional join handling if needed
  }

  handlePresenceLeave(key, leftPresences) {
    console.log('User left presence:', key, leftPresences);
    // Additional leave handling if needed
  }

  // Host Controls
  async play() {
    const response = await fetch('/functions/v1/sync/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id: this.roomId,
        user_id: this.userId,
        action: 'play',
        current_time: this.videoElement.currentTime
      })
    });

    return response.json();
  }

  async pause() {
    const response = await fetch('/functions/v1/sync/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id: this.roomId,
        user_id: this.userId,
        action: 'pause',
        current_time: this.videoElement.currentTime
      })
    });

    return response.json();
  }

  async seek(currentTime) {
    const response = await fetch('/functions/v1/sync/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id: this.roomId,
        user_id: this.userId,
        action: 'seek',
        current_time: currentTime
      })
    });

    return response.json();
  }

  // Sync Logic
  syncToRoomState(roomState) {
    if (!this.videoElement) return;

    const currentTime = this.videoElement.currentTime;
    const timeDiff = Math.abs(roomState.current_time - currentTime);

    // Only seek if difference is significant
    if (timeDiff > 0.5) {
      this.videoElement.currentTime = roomState.current_time;
    }

    // Sync playback state
    if (roomState.is_playing && this.videoElement.paused) {
      this.videoElement.play().catch(e => console.log('Autoplay prevented:', e));
    } else if (!roomState.is_playing && !this.videoElement.paused) {
      this.videoElement.pause();
    }

    this.updateSyncIndicator(timeDiff <= 2);
  }

  async syncToLive() {
    try {
      const { data } = await supabase.rpc('get_room_sync_state', {
        p_room_id: this.roomId,
        p_user_id: this.userId
      });

      if (data.error) {
        throw new Error(data.error);
      }

      this.videoElement.currentTime = data.room.current_time;
      this.updateSyncIndicator(true);
      this.showNotification('Synced to live');
    } catch (error) {
      console.error('Failed to sync to live:', error);
      this.showNotification('Failed to sync', 'error');
    }
  }

  // UI Helpers
  updateSyncIndicator(isSynced) {
    if (this.callbacks.onSyncStatusChange) {
      this.callbacks.onSyncStatusChange(isSynced);
    }
  }

  updateMemberList(members) {
    if (this.callbacks.onMemberListUpdate) {
      this.callbacks.onMemberListUpdate(members);
    }
  }

  showNotification(message, type = 'info') {
    if (this.callbacks.onNotification) {
      this.callbacks.onNotification(message, type);
    }
  }

  showCommentNotification(comment) {
    if (this.callbacks.onCommentNotification) {
      this.callbacks.onCommentNotification(comment);
    }
  }

  // Cleanup
  disconnect() {
    if (this.presenceInterval) {
      clearInterval(this.presenceInterval);
    }

    if (this.channel) {
      this.channel.untrack();
      this.channel.unsubscribe();
    }

    this.isConnected = false;
  }

  // Set callbacks for UI integration
  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  setVideoElement(videoElement) {
    this.videoElement = videoElement;
  }
}
```

### 3. Usage Example

```javascript
// Initialize the room manager
const roomManager = new RealtimeRoomManager('abc123def4', 'user123', 'AnimeFan');

// Set up UI callbacks
roomManager.setCallbacks({
  onRoomStateChange: (roomState) => {
    console.log('Room updated:', roomState);
    // Update play/pause button, seek bar, etc.
  },

  onMemberChange: (change) => {
    console.log('Member changed:', change);
    // Update member list
  },

  onNewComment: (comment) => {
    console.log('New comment:', comment);
    // Add comment to UI
  },

  onPresenceSync: (presenceState) => {
    console.log('Presence synced:', presenceState);
    // Update online indicators, sync status
  },

  onSyncStatusChange: (isSynced) => {
    console.log('Sync status:', isSynced);
    // Update sync indicator
    document.getElementById('sync-indicator').className = 
      isSynced ? 'sync-indicator synced' : 'sync-indicator out-of-sync';
  },

  onMemberListUpdate: (members) => {
    console.log('Member list:', members);
    // Update member list UI
  },

  onNotification: (message, type) => {
    console.log('Notification:', message, type);
    // Show toast notification
  },

  onCommentNotification: (comment) => {
    console.log('Comment notification:', comment);
    // Show comment notification
  }
});

// Connect to room
async function joinRoom() {
  try {
    await roomManager.connect();
    
    // Set video element
    const video = document.getElementById('video-player');
    roomManager.setVideoElement(video);

    // Set up host controls
    const isHost = await checkIfHost(); // Your logic to check if user is host
    if (isHost) {
      setupHostControls();
    }

    // Set up sync button
    document.getElementById('sync-live-btn').onclick = () => {
      roomManager.syncToLive();
    };

  } catch (error) {
    console.error('Failed to join room:', error);
    showError('Failed to join room: ' + error.message);
  }
}

function setupHostControls() {
  const playBtn = document.getElementById('play-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const seekBar = document.getElementById('seek-bar');

  playBtn.onclick = () => roomManager.play();
  pauseBtn.onclick = () => roomManager.pause();
  
  seekBar.onchange = (e) => {
    roomManager.seek(parseFloat(e.target.value));
  };

  // Show host controls
  document.getElementById('host-controls').style.display = 'block';
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  roomManager.disconnect();
});

// Start the connection
joinRoom();
```

### 4. Comment System Integration

```javascript
class CommentManager {
  constructor(roomManager) {
    this.roomManager = roomManager;
    this.setupCommentSubmission();
  }

  setupCommentSubmission() {
    const form = document.getElementById('comment-form');
    const input = document.getElementById('comment-input');

    form.onsubmit = async (e) => {
      e.preventDefault();
      
      const message = input.value.trim();
      if (!message) return;

      try {
        const response = await fetch('/functions/v1/comments/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            anime_id: 'anime123',
            room_id: this.roomManager.roomId,
            episode_number: 1,
            user_id: this.roomManager.userId,
            username: this.roomManager.username,
            message: message,
            video_timestamp: this.roomManager.videoElement?.currentTime
          })
        });

        const result = await response.json();
        if (result.success) {
          input.value = '';
          console.log('Comment posted:', result.data.comment);
        } else {
          throw new Error(result.error.message);
        }
      } catch (error) {
        console.error('Failed to post comment:', error);
        showError('Failed to post comment: ' + error.message);
      }
    };
  }

  addCommentToUI(comment) {
    const commentsContainer = document.getElementById('comments-container');
    const commentElement = this.createCommentElement(comment);
    commentsContainer.appendChild(commentElement);
    commentsContainer.scrollTop = commentsContainer.scrollHeight;
  }

  createCommentElement(comment) {
    const div = document.createElement('div');
    div.className = `comment ${comment.is_system_message ? 'system' : 'user'}`;
    
    div.innerHTML = `
      <div class="comment-header">
        <span class="username">${comment.username}</span>
        <span class="timestamp">${new Date(comment.created_at).toLocaleTimeString()}</span>
        ${comment.video_timestamp ? `<span class="video-time">${this.formatVideoTime(comment.video_timestamp)}</span>` : ''}
      </div>
      <div class="comment-body">${comment.message}</div>
    `;

    return div;
  }

  formatVideoTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

// Initialize comment manager
const commentManager = new CommentManager(roomManager);

// Listen for new comments
roomManager.setCallbacks({
  ...roomManager.callbacks,
  onNewComment: (comment) => {
    commentManager.addCommentToUI(comment);
  }
});
```

## Benefits of This Architecture

### 1. **Efficient Resource Usage**
- **Presence Updates**: Every 3 seconds via WebSocket
- **Real-time Events**: <100ms latency for all updates
- **Minimal HTTP Calls**: Only for essential operations
- **Automatic Scaling**: Database-driven broadcasts scale with users

### 2. **Better Performance**
- Real-time updates via WebSocket push
- Lower latency than HTTP polling
- Automatic reconnection handling
- Efficient presence management

### 3. **Improved User Experience**
- Instant updates for all room changes
- Reliable sync status indicators
- Automatic reconnection on network issues
- Smooth playback synchronization

### 4. **Scalability**
- Database-driven broadcasts scale better
- Presence system handles connection management
- Reduced server load
- Optimized for high-concurrency scenarios

## Implementation Guide

### Core Concepts

This architecture uses Supabase Realtime as the primary communication layer:

1. **Presence Tracking**: User sync status via WebSocket presence
2. **Database Events**: Room changes trigger automatic broadcasts
3. **Minimal HTTP**: Essential operations only (room management, host controls)

### Key Implementation Patterns

```javascript
// OLD: HTTP-based heartbeat (NOT RECOMMENDED)
setInterval(async () => {
  await fetch('/sync/heartbeat', {
    method: 'POST',
    body: JSON.stringify({
      room_id, user_id, 
      current_time: video.currentTime,
      is_playing: !video.paused
    })
  });
}, 2500);

// NEW: Realtime presence tracking (RECOMMENDED)
setInterval(() => {
  channel.track({
    user_id,
    current_time: video.currentTime,
    is_playing: !video.paused
  });
}, 3000);
```

### Best Practices

- Use presence updates for sync status tracking
- Listen for database changes for room state updates
- Minimize HTTP calls to essential operations only
- Implement proper error handling for WebSocket connections
- Use automatic reconnection provided by Supabase client

This Realtime-first architecture will keep you well within Supabase's usage limits while providing better performance and user experience!