# Realtime Client Guide

Comprehensive guide for implementing client-side real-time functionality for the Watchium platform.

## Overview

This guide covers how to integrate your frontend application with the Watchium real-time backend using Supabase Realtime. The client implementation handles WebSocket connections, event handling, and automatic synchronization.

## Prerequisites

### Dependencies

```bash
# Install Supabase client library
npm install @supabase/supabase-js

# For React applications
npm install @supabase/supabase-js react

# For vanilla JavaScript
npm install @supabase/supabase-js
```

### Environment Setup

```javascript
// config/realtime.js
export const SUPABASE_URL = 'https://ahigvhlqlikkkjsjikcj.supabase.co';
export const SUPABASE_ANON_KEY = 'your-anon-key';
export const SUPABASE_SERVICE_ROLE_KEY = 'your-service-role-key';
```

## Basic Connection

### Initialize Supabase Client

```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ahigvhlqlikkkjsjikcj.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'your-anon-key'
);
```

### Create Room Channel

```javascript
class RealtimeRoom {
  constructor(roomId, userId, username) {
    this.roomId = roomId;
    this.userId = userId;
    this.username = username;
    this.channel = null;
    this.isConnected = false;
    this.members = new Map();
    this.setupChannel();
  }
  
  setupChannel() {
    this.channel = supabase.channel(`room:${this.roomId}`, {
      config: {
        broadcast: { self: true },
        presence: { 
          key: this.userId,
          data: {
            username: this.username,
            avatar_url: null
          }
        }
      }
    });
    
    this.setupEventHandlers();
  }
  
  async connect() {
    try {
      const subscription = await this.channel.subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          this.isConnected = true;
          this.onConnected();
        } else if (status === 'CHANNEL_ERROR') {
          this.isConnected = false;
          this.onError(err);
        }
      });
      
      return subscription;
    } catch (error) {
      this.onError(error);
      throw error;
    }
  }
  
  disconnect() {
    if (this.channel) {
      this.channel.unsubscribe();
      this.isConnected = false;
      this.onDisconnected();
    }
  }
}
```

## Event Handling

### Setup Event Handlers

```javascript
setupEventHandlers() {
  // Database change events
  this.channel.on('postgres_changes', 
    { event: 'UPDATE', schema: 'public', table: 'rooms' },
    (payload) => {
      this.handleRoomStateChange(payload);
    }
  );
  
  this.channel.on('postgres_changes',
    { event: '*', schema: 'public', table: 'room_members' },
    (payload) => {
      this.handleMemberChange(payload);
    }
  );
  
  this.channel.on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'comments' },
    (payload) => {
      this.handleNewComment(payload);
    }
  );
  
  // Presence events
  this.channel.on('presence', { event: 'join' }, (payload) => {
    this.handleMemberJoined(payload);
  });
  
  this.channel.on('presence', { event: 'leave' }, (payload) => {
    this.handleMemberLeft(payload);
  });
  
  this.channel.on('presence', { event: 'sync' }, (payload) => {
    this.handlePresenceSync(payload);
  });
  
  // Broadcast events
  this.channel.on('broadcast', { event: 'play' }, (payload) => {
    this.handlePlayEvent(payload);
  });
  
  this.channel.on('broadcast', { event: 'pause' }, (payload) => {
    this.handlePauseEvent(payload);
  });
  
  this.channel.on('broadcast', { event: 'seek' }, (payload) => {
    this.handleSeekEvent(payload);
  });
}
```

### Room State Changes

```javascript
handleRoomStateChange(payload) {
  const { new: roomState, old: oldState } = payload;
  
  console.log('Room state changed:', roomState);
  
  // Auto-sync to host state if not the host
  if (roomState.host_user_id !== this.userId) {
    this.syncToHostState(roomState);
  }
  
  // Emit event for UI updates
  this.emit('roomStateChanged', roomState);
}

syncToHostState(roomState) {
  if (this.videoElement) {
    const targetTime = roomState.current_playback_time;
    const currentTime = this.videoElement.currentTime;
    const timeDiff = Math.abs(targetTime - currentTime);
    
    // Only sync if difference is significant
    if (timeDiff > 0.1) { // 100ms threshold
      this.videoElement.currentTime = targetTime;
      
      // Handle play/pause state
      if (roomState.is_playing && this.videoElement.paused) {
        this.videoElement.play().catch(console.error);
      } else if (!roomState.is_playing && !this.videoElement.paused) {
        this.videoElement.pause();
      }
      
      this.emit('synced', { 
        isSynced: true, 
        timeDifference: timeDiff 
      });
    }
  }
}
```

### Member Management

```javascript
handleMemberChange(payload) {
  const { eventType, new: member, old: oldMember } = payload;
  
  switch (eventType) {
    case 'INSERT':
      this.members.set(member.user_id, member);
      this.emit('memberJoined', member);
      break;
      
    case 'UPDATE':
      this.members.set(member.user_id, member);
      this.emit('memberUpdated', member);
      break;
      
    case 'DELETE':
      this.members.delete(oldMember.user_id);
      this.emit('memberLeft', oldMember);
      break;
  }
  
  this.emit('membersChanged', Array.from(this.members.values()));
}

handleMemberJoined(payload) {
  const { key, newPresences } = payload;
  const memberData = newPresences[key];
  
  this.members.set(memberData.user_id, {
    user_id: memberData.user_id,
    username: memberData.username,
    avatar_url: memberData.avatar_url,
    is_host: memberData.is_host,
    is_synced: memberData.is_synced,
    current_playback_time: memberData.current_playback_time,
    last_heartbeat: memberData.last_heartbeat
  });
  
  this.emit('memberJoined', memberData);
  this.emit('membersChanged', Array.from(this.members.values()));
}
```

### Playback Events

```javascript
handlePlayEvent(payload) {
  const { payload: eventPayload } = payload;
  
  if (eventPayload.user_id !== this.userId) {
    // Sync to host state
    this.videoElement.currentTime = eventPayload.current_time;
    this.videoElement.play().catch(console.error);
    
    this.emit('playbackEvent', {
      type: 'play',
      payload: eventPayload
    });
  }
}

handlePauseEvent(payload) {
  const { payload: eventPayload } = payload;
  
  if (eventPayload.user_id !== this.userId) {
    // Sync to host state
    this.videoElement.currentTime = eventPayload.current_time;
    this.videoElement.pause();
    
    this.emit('playbackEvent', {
      type: 'pause',
      payload: eventPayload
    });
  }
}

handleSeekEvent(payload) {
  const { payload: eventPayload } = payload;
  
  if (eventPayload.user_id !== this.userId) {
    // Sync to host state
    this.videoElement.currentTime = eventPayload.current_time;
    
    this.emit('playbackEvent', {
      type: 'seek',
      payload: eventPayload
    });
  }
}
```

## Video Synchronization

### Sync Manager Class

```javascript
class VideoSyncManager {
  constructor(videoElement, channel, userId, isHost = false) {
    this.video = videoElement;
    this.channel = channel;
    this.userId = userId;
    this.isHost = isHost;
    this.toleranceMs = 2000; // 2 seconds
    this.heartbeatInterval = 3000; // 3 seconds
    
    this.setupVideoHandlers();
    this.startHeartbeat();
  }
  
  setupVideoHandlers() {
    // Video event handlers for host
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
    
    this.video.addEventListener('timeupdate', () => {
      this.updateSyncStatus();
    });
    
    this.video.addEventListener('ended', () => {
      if (this.isHost) {
        this.broadcastPause();
      }
    });
  }
  
  async broadcastPlay() {
    try {
      await fetch('https://ahigvhlqlikkkjsjikcj.supabase.co/functions/v1/sync-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: this.channel.roomId,
          user_id: this.userId,
          action: 'play',
          current_time: this.video.currentTime
        })
      });
    } catch (error) {
      console.error('Failed to broadcast play event:', error);
    }
  }
  
  async broadcastPause() {
    try {
      await fetch('https://ahigvhlqlikkkjsjikcj.supabase.co/functions/v1/sync-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: this.channel.roomId,
          user_id: this.userId,
          action: 'pause',
          current_time: this.video.currentTime
        })
      });
    } catch (error) {
      console.error('Failed to broadcast pause event:', error);
    }
  }
  
  async broadcastSeek() {
    try {
      await fetch('https://ahigvhlqlikkkjsjikcj.supabase.co/functions/v1/sync-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: this.channel.roomId,
          user_id: this.userId,
          action: 'seek',
          current_time: this.video.currentTime
        })
      });
    } catch (error) {
      console.error('Failed to broadcast seek event:', error);
    }
  }
  
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.heartbeatInterval);
  }
  
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
  
  async sendHeartbeat() {
    try {
      await this.channel.track({
        user_id: this.userId,
        current_time: this.video.currentTime,
        is_playing: !this.video.paused
      });
    } catch (error) {
      console.error('Failed to send heartbeat:', error);
    }
  }
  
  updateSyncStatus() {
    const currentTime = this.video.currentTime;
    const isPlaying = !this.video.paused;
    
    // Update local sync status
    const isSynced = this.calculateSyncStatus(currentTime);
    
    this.emit('syncStatusChanged', {
      currentTime,
      isPlaying,
      isSynced,
      timeDifference: this.getTimeDifference(currentTime)
    });
  }
  
  calculateSyncStatus(currentTime) {
    // This would typically get host time from server
    // For now, use local calculation
    return true; // Placeholder
  }
  
  getTimeDifference(currentTime) {
    // This would get host time from server
    // For now, return 0
    return 0; // Placeholder
  }
  
  destroy() {
    this.stopHeartbeat();
    this.video.removeEventListener('play', this.broadcastPlay);
    this.video.removeEventListener('pause', this.broadcastPause);
    this.video.removeEventListener('seek', this.broadcastSeek);
  }
}
```

## Presence Tracking

### Presence Manager

```javascript
class PresenceManager {
  constructor(channel, userId) {
    this.channel = channel;
    this.userId = userId;
    this.presenceData = {
      username: null,
      avatar_url: null,
      status: 'online'
    };
  }
  
  updatePresence(data) {
    this.presenceData = { ...this.presenceData, ...data };
    
    this.channel.track(this.presenceData);
  }
  
  setStatus(status) {
    this.updatePresence({ status });
  }
  
  setUsername(username) {
    this.updatePresence({ username });
  }
  
  setAvatarUrl(avatarUrl) {
    this.updatePresence({ avatar_url: avatarUrl });
  }
  
  goOffline() {
    this.channel.untrack();
  }
}
```

### Member List Component

```javascript
class MemberList {
  constructor(channel, roomId) {
    this.channel = channel;
    this.roomId = roomId;
    this.members = new Map();
    this.element = null;
    this.setupPresenceTracking();
  }
  
  setupPresenceTracking() {
    this.channel.on('presence', { event: 'sync' }, (payload) => {
      this.updateMembersFromPresence(payload.presences);
    });
    
    this.channel.on('presence', { event: 'join' }, (payload) => {
      this.addMember(payload.key, payload.newPresences[payload.key]);
    });
    
    this.channel.on('presence', { event: 'leave' }, (payload) => {
      this.removeMember(payload.key);
    });
  }
  
  updateMembersFromPresence(presences) {
    this.members.clear();
    
    Object.entries(presences).forEach(([userId, presence]) => {
      this.members.set(userId, {
        user_id: userId,
        username: presence.username,
        avatar_url: presence.avatar_url,
        is_host: presence.is_host,
        is_synced: presence.is_synced,
        current_playback_time: presence.current_playback_time,
        last_heartbeat: presence.last_heartbeat
      });
    });
    
    this.render();
  }
  
  addMember(userId, memberData) {
    this.members.set(userId, {
      user_id: userId,
      username: memberData.username,
      avatar_url: memberData.avatar_url,
      is_host: memberData.is_host,
      is_synced: memberData.is_synced,
      current_playback_time: memberData.current_playback_time,
      last_heartbeat: memberData.last_heartbeat
    });
    
    this.render();
  }
  
  removeMember(userId) {
    this.members.delete(userId);
    this.render();
  }
  
  render() {
    if (!this.element) return;
    
    this.element.innerHTML = Array.from(this.members.values())
      .map(member => this.createMemberElement(member))
      .join('');
  }
  
  createMemberElement(member) {
    const div = document.createElement('div');
    div.className = 'member-item';
    div.innerHTML = `
      <div class="member-avatar">
        <img src="${member.avatar_url || '/default-avatar.png'}" alt="${member.username}" />
      </div>
      <div class="member-info">
        <div class="member-name">${member.username}</div>
        <div class="member-status ${member.is_synced ? 'synced' : 'out-of-sync'}">
          ${member.is_synced ? '✓ Synced' : '⚠ Out of Sync'}
        </div>
      </div>
      ${member.is_host ? '<div class="host-badge">HOST</div>' : ''}
    `;
    
    return div;
  }
}
```

## React Integration

### React Hook

```javascript
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

export function useRealtimeRoom(roomId, userId, username) {
  const [channel, setChannel] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [members, setMembers] = useState([]);
  const [roomState, setRoomState] = useState(null);
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );
  
  const connect = useCallback(async () => {
    try {
      const newChannel = supabase.channel(`room:${roomId}`, {
        config: {
          broadcast: { self: true },
          presence: { 
            key: userId,
            data: { username, avatar_url: null }
          }
        }
      });
      
      newChannel.on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'rooms' },
        (payload) => {
          if (payload.new.host_user_id !== userId) {
            setRoomState(payload.new);
          }
        }
      );
      
      newChannel.on('presence', { event: 'sync' }, (payload) => {
        setMembers(Object.values(payload.presences));
      });
      
      const subscription = await newChannel.subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });
      
      setChannel(newChannel);
      return subscription;
    } catch (error) {
      console.error('Failed to connect to room:', error);
      throw error;
    }
  }, [roomId, userId, username, supabase]);
  
  const disconnect = useCallback(() => {
    if (channel) {
      channel.unsubscribe();
      setChannel(null);
      setIsConnected(false);
      setMembers([]);
      setRoomState(null);
    }
  }, [channel]);
  
  const broadcastEvent = useCallback((event, payload) => {
    if (channel && isConnected) {
      channel.send({
        type: 'broadcast',
        event,
        payload
      });
    }
  }, [channel, isConnected]);
  
  const updatePresence = useCallback((data) => {
    if (channel && isConnected) {
      channel.track({
        user_id: userId,
        ...data
      });
    }
  }, [channel, isConnected, userId]);
  
  useEffect(() => {
    // Auto-connect when component mounts
    connect();
    
    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);
  
  return {
    channel,
    isConnected,
    members,
    roomState,
    broadcastEvent,
    updatePresence,
    connect,
    disconnect
  };
}
```

### React Component

```javascript
import React, { useState, useEffect, useRef } from 'react';
import { useRealtimeRoom } from './hooks/useRealtimeRoom';
import { VideoSyncManager } from './VideoSyncManager';

export default function WatchRoom({ roomId, userId, username, videoUrl }) {
  const videoRef = useRef(null);
  const [isHost, setIsHost] = useState(false);
  
  const {
    channel,
    isConnected,
    members,
    roomState,
    broadcastEvent,
    updatePresence
  } = useRealtimeRoom(roomId, userId, username);
  
  const [syncManager, setSyncManager] = useState(null);
  
  // Initialize sync manager when video is ready
  useEffect(() => {
    if (videoRef.current && channel && isConnected) {
      const manager = new VideoSyncManager(
        videoRef.current,
        channel,
        userId,
        isHost
      );
      setSyncManager(manager);
      
      return () => manager.destroy();
    }
  }, [videoRef.current, channel, isConnected, userId, isHost]);
  
  // Handle video element ready
  const handleVideoReady = (element) => {
    videoRef.current = element;
    setIsHost(roomState?.host_user_id === userId);
  };
  
  // Handle host controls
  const handlePlay = () => {
    if (isHost && syncManager) {
      syncManager.broadcastPlay();
    }
  };
  
  const handlePause = () => {
    if (isHost && syncManager) {
      syncManager.broadcastPause();
    }
  };
  
  const handleSeek = (time) => {
    if (isHost && syncManager) {
      videoRef.current.currentTime = time;
      syncManager.broadcastSeek();
    }
  };
  
  // Update presence periodically
  useEffect(() => {
    if (!isConnected) return;
    
    const interval = setInterval(() => {
      updatePresence({
        current_time: videoRef.current?.currentTime || 0,
        is_playing: videoRef.current ? !videoRef.current.paused : false
      });
    }, 3000);
    
    return () => clearInterval(interval);
  }, [isConnected, updatePresence, videoRef]);
  
  return (
    <div className="watch-room">
      <div className="video-container">
        <video
          ref={handleVideoReady}
          src={videoUrl}
          controls
          onPlay={handlePlay}
          onPause={handlePause}
          onSeeked={handleSeek}
        />
      </div>
      
      <div className="room-info">
        <h2>{roomState?.title}</h2>
        <p>Episode {roomState?.episode_number}</p>
        <p>Host: {roomState?.host_username}</p>
        <p>Status: {roomState?.is_playing ? 'Playing' : 'Paused'}</p>
      </div>
      
      <div className="members-list">
        <h3>Members ({members.length})</h3>
        {members.map(member => (
          <div key={member.user_id} className="member-item">
            <img 
              src={member.avatar_url || '/default-avatar.png'} 
              alt={member.username} 
            />
            <span>{member.username}</span>
            <span className={`sync-status ${member.is_synced ? 'synced' : 'out-of-sync'}`}>
              {member.is_synced ? '✓' : '⚠'}
            </span>
            {member.is_host && <span className="host-badge">HOST</span>}
          </div>
        ))}
      </div>
      
      <div className="controls">
        <button 
          onClick={handlePlay}
          disabled={!isHost}
          className={roomState?.is_playing ? 'pause-button' : 'play-button'}
        >
          {roomState?.is_playing ? 'Pause' : 'Play'}
        </button>
        
        <input
          type="range"
          min="0"
          max={videoRef.current?.duration || 0}
          value={videoRef.current?.currentTime || 0}
          onChange={(e) => handleSeek(parseFloat(e.target.value))}
          disabled={!isHost}
        />
        
        <span className="time-display">
          {formatTime(videoRef.current?.currentTime || 0)} / 
          {formatTime(videoRef.current?.duration || 0)}
        </span>
      </div>
    </div>
  );
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
```

## Vanilla JavaScript Implementation

### Basic HTML Structure

```html
<!DOCTYPE html>
<html>
<head>
  <title>Watchium - Real-time Anime Watching</title>
  <script src="https://unpkg.com/@supabase/supabase-js"></script>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app">
    <div class="video-container">
      <video id="video" controls></video>
    </div>
    
    <div class="room-info">
      <h2 id="room-title">Loading...</h2>
      <p id="episode-info">...</p>
      <p id="host-info">...</p>
    </div>
    
    <div class="members-list" id="members-list">
      <h3>Members (<span id="member-count">0</span>)</h3>
      <div id="members-container"></div>
    </div>
    
    <div class="controls">
      <button id="play-pause-btn" disabled>Play</button>
      <input 
        type="range" 
        id="seek-slider" 
        min="0" 
        max="100" 
        value="0" 
        disabled
      />
      <span id="time-display">0:00 / 0:00</span>
    </div>
    
    <div id="connection-status" class="status-indicator">
      <span class="status-dot"></span>
      <span class="status-text">Connecting...</span>
    </div>
  </div>
  
  <script src="realtime-client.js"></script>
</body>
</html>
```

### JavaScript Implementation

```javascript
// realtime-client.js
class WatchiumClient {
  constructor() {
    this.supabase = createClient(
      'https://ahigvhlqlikkkjsjikcj.supabase.co',
      'your-anon-key'
    );
    
    this.channel = null;
    this.video = null;
    this.userId = null;
    this.username = null;
    this.roomId = null;
    this.isHost = false;
    this.isConnected = false;
    this.members = new Map();
    
    this.initializeEventListeners();
  }
  
  async initialize(roomId, userId, username, videoUrl) {
    this.roomId = roomId;
    this.userId = userId;
    this.username = username;
    
    // Setup video
    this.video = document.getElementById('video');
    this.video.src = videoUrl;
    
    // Connect to room
    await this.connect();
  }
  
  async connect() {
    try {
      this.channel = this.supabase.channel(`room:${this.roomId}`, {
        config: {
          broadcast: { self: true },
          presence: { 
            key: this.userId,
            data: {
              username: this.username,
              avatar_url: null
            }
          }
        }
      });
      
      this.setupChannelHandlers();
      
      const subscription = await this.channel.subscribe((status, err) => {
        this.handleSubscriptionStatus(status, err);
      });
      
      return subscription;
    } catch (error) {
      console.error('Connection failed:', error);
      throw error;
    }
  }
  
  setupChannelHandlers() {
    // Room state changes
    this.channel.on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'rooms' },
      (payload) => {
        this.handleRoomStateChange(payload);
      }
    );
    
    // Member changes
    this.channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'room_members' },
      (payload) => {
        this.handleMemberChange(payload);
      }
    );
    
    // Presence events
    this.channel.on('presence', { event: 'sync' }, (payload) => {
      this.handlePresenceSync(payload);
    });
    
    // Broadcast events
    this.channel.on('broadcast', { event: 'play' }, (payload) => {
      this.handlePlayEvent(payload);
    });
    
    this.channel.on('broadcast', { event: 'pause' }, (SubscriptionEvent) => {
      this.handlePauseEvent(payload);
    });
    
    this.channel.on('broadcast', { event: 'seek' }, (payload) => {
      this.handleSeekEvent(payload);
    });
  }
  
  handleSubscriptionStatus(status, error) {
    this.isConnected = status === 'SUBSCRIBED';
    this.updateConnectionStatus();
    
    if (status === 'SUBSCRIBED') {
      console.log('Connected to room:', this.roomId);
      this.startHeartbeat();
    } else if (error) {
      console.error('Subscription failed:', error);
    }
  }
  
  handleRoomStateChange(payload) {
    const { new: roomState } = payload;
    
    console.log('Room state changed:', roomState);
    
    // Update UI
    document.getElementById('room-title').textContent = roomState.title;
    document.getElementById('episode-info').textContent = 
      `Episode ${roomState.episode_number}`;
    document.getElementById('host-info').textContent = 
      `Host: ${roomState.host_username}`;
    
    // Auto-sync if not host
    if (roomState.host_user_id !== this.userId) {
      this.syncToHostState(roomState);
    }
    
    // Update play/pause button
    const playPauseBtn = document.getElementById('play-pause-btn');
    playPauseBtn.textContent = roomState.is_playing ? 'Pause' : 'Play';
    playPauseBtn.disabled = !this.isHost;
    
    // Update seek slider
    const seekSlider = document.getElementById('seek-slider');
    seekSlider.max = this.video.duration || 100;
    seekSlider.value = roomState.current_playback_time;
    seekSlider.disabled = !this.isHost;
    
    // Update time display
    this.updateTimeDisplay();
  }
  
  handleMemberChange(payload) {
    const { eventType, new: member, old: oldMember } = payload;
    
    switch (eventType) {
      case 'INSERT':
        this.members.set(member.user_id, member);
        break;
      case 'UPDATE':
        this.members.set(member.user_id, member);
        break;
      case 'DELETE':
        this.members.delete(oldMember.user_id);
        break;
    }
    
    this.updateMembersList();
  }
  
  handlePresenceSync(payload) {
    const presences = payload.presences;
    
    // Update members from presence data
    Object.entries(presences).forEach(([userId, presence]) => {
      if (this.members.has(userId)) {
        const member = this.members.get(userId);
        member.is_synced = presence.is_synced;
        member.current_playback_time = presence.current_playback_time;
        member.last_heartbeat = presence.last_heartbeat;
      }
    });
    
    this.updateMembersList();
  }
  
  handlePlayEvent(payload) {
    const { payload: eventPayload } = payload;
    
    if (eventPayload.user_id !== this.userId) {
      this.video.currentTime = eventPayload.current_time;
      this.video.play().catch(console.error);
    }
  }
  
  handlePauseEvent(payload) {
    const { payload: eventPayload } = payload;
    
    if (eventPayload.user_id !== this.userId) {
      this.video.currentTime = eventPayload.current_time;
      this.video.pause();
    }
  }
  
  handleSeekEvent(payload) {
    const { payload: eventPayload } = payload;
    
    if (eventPayload.user_id !== this.userId) {
      this.video.currentTime = eventPayload.current_time;
    }
  }
  
  syncToHostState(roomState) {
    const targetTime = roomState.current_playback_time;
    const currentTime = this.video.currentTime;
    const timeDiff = Math.abs(targetTime - currentTime);
    
    if (timeDiff > 0.1) { // 100ms threshold
      this.video.currentTime = targetTime;
      
      if (roomState.is_playing && this.video.paused) {
        this.video.play().catch(console.error);
      } else if (!roomState.is_playing && !this.video.paused) {
        this.video.pause();
      }
    }
  }
  
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 3000);
  }
  
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
  
  sendHeartbeat() {
    if (this.channel && this.isConnected) {
      this.channel.track({
        user_id: this.userId,
        current_time: this.video.currentTime,
        is_playing: !this.video.paused
      });
    }
  }
  
  updateConnectionStatus() {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    
    if (this.isConnected) {
      statusDot.className = 'status-dot connected';
      statusText.textContent = 'Connected';
    } else {
      statusDot.className = 'status-dot disconnected';
      statusText.textContent = 'Disconnected';
    }
  }
  
  updateMembersList() {
    const container = document.getElementById('members-container');
    const count = document.getElementById('member-count');
    
    container.innerHTML = Array.from(this.members.values())
      .map(member => `
        <div class="member-item">
          <img 
            src="${member.avatar_url || '/default-avatar.png'}" 
            alt="${member.username}" 
            class="member-avatar"
          />
          <div class="member-info">
            <div class="member-name">${member.username}</div>
            <div class="member-status ${member.is_synced ? 'synced' : 'out-of-sync'}">
              ${member.is_synced ? '✓' : '⚠'}
            </div>
          </div>
          ${member.is_host ? '<div class="host-badge">HOST</div>' : ''}
        </div>
      `).join('');
    
    count.textContent = this.members.size;
  }
  
  updateTimeDisplay() {
    const currentTime = this.video.currentTime;
    const duration = this.video.duration || 0;
    
    const currentMinutes = Math.floor(currentTime / 60);
    const currentSeconds = Math.floor(currentTime % 60);
    const durationMinutes = Math.floor(duration / 60);
    const durationSeconds = Math.floor(duration % 60);
    
    const timeDisplay = document.getElementById('time-display');
    timeDisplay.textContent = 
      `${currentMinutes}:${currentSeconds.toString().padStart(2, '0')} / ${durationMinutes}:${durationSeconds.toString().padStart(2, '0')}`;
  }
  
  // Public API methods
  async play() {
    if (this.isHost) {
      await this.broadcastEvent('play', {
        current_time: this.video.currentTime,
        user_id: this.userId,
        username: this.username
      });
    }
  }
  
  async pause() {
    if (this.isHost) {
      await this.broadcastEvent('pause', {
        current_time: this.video.currentTime,
        user_id: this.userId,
        username: this.username
      });
    }
  }
  
  async seek(time) {
    if (this.isHost) {
      this.video.currentTime = time;
      await this.broadcastEvent('seek', {
        current_time: time,
        user_id: this.userId,
        username: this.username
      });
    }
  }
  
  async broadcastEvent(event, payload) {
    if (this.channel && this.isConnected) {
      await this.channel.send({
        type: 'broadcast',
        event,
        payload
      });
    }
  }
  
  disconnect() {
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
      this.isConnected = false;
      this.stopHeartbeat();
    }
  }
}

// Initialize the client
const client = new WatchiumClient();

// Example usage
// client.initialize('room123', 'user456', 'Viewer123', 'https://example.com/video.mp4');
```

## Error Handling

### Connection Errors

```javascript
class ErrorHandlingManager {
  constructor(client) {
    this.client = client;
    this.maxRetries = 5;
    this.retryDelay = 1000;
    this.reconnectAttempts = 0;
  }
  
  async handleConnectionError(error) {
    console.error('Connection error:', error);
    
    if (this.reconnectAttempts < this.maxRetries) {
      this.reconnectAttempts++;
      const delay = this.retryDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      console.log(`Reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
      
      setTimeout(() => {
        this.client.connect();
      }, delay);
    } else {
      this.showConnectionError();
    }
  }
  
  showConnectionError() {
    const statusText = document.querySelector('.status-text');
    statusText.textContent = 'Connection lost. Click to reconnect.';
    statusText.style.color = '#ff4444';
    
    statusText.style.cursor = 'pointer';
    statusText.onclick = () => {
      this.reconnectAttempts = 0;
      this.client.connect();
    };
  }
  
  async reconnect() {
    try {
      await this.client.connect();
      this.reconnectAttempts = 0;
      this.hideConnectionError();
    } catch (error) {
      await this.handleConnectionError(error);
    }
  }
}
```

### Sync Error Recovery

```javascript
class SyncErrorRecovery {
  constructor(syncManager) {
    this.syncManager = syncManager;
    this.errorQueue = [];
    this.isRecovering = false;
  }
  
  queueSyncOperation(operation) {
    if (this.isRecovering) {
      this.errorQueue.push(operation);
    } else {
      try {
        operation();
      } catch (error) {
        console.error('Sync operation failed:', error);
        this.queueSyncOperation(operation);
      }
    }
  }
  
  async recoverSync() {
    if (this.isRecovering) return;
    
    this.isRecovering = true;
    
    try {
      // Get current host state
      const hostState = await this.getHostState();
      
      // Sync to host state
      await this.syncManager.syncToHostState(hostState);
      
      // Process queued operations
      while (this.errorQueue.length > 0) {
        const operation = this.errorQueue.shift();
        await operation();
      }
      
      this.isRecovering = false;
    } catch (error) {
      console.error('Sync recovery failed:', error);
      
      // Retry after delay
      setTimeout(() => {
        this.recoverSync();
      }, 2000);
    }
  }
  
  async getHostState() {
    // Fetch current host state from server
    const response = await fetch(
      'https://ahigvhlqlikkkjsjikcj.supabase.co/functions/v1/sync-get-host-time',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: this.syncManager.roomId,
          user_id: this.syncManager.userId
        })
      }
    );
    
    const { data } = await response.json();
    return data.data;
  }
}
```

This comprehensive client guide provides everything needed to integrate frontend applications with the Watchium real-time backend, supporting both React and vanilla JavaScript implementations.