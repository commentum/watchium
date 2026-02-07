# Synchronization Algorithm

This document explains the presence-based synchronization system that keeps all room members in perfect sync during anime watching sessions using Supabase Realtime.

## Overview

The synchronization system uses a presence-first architecture where:

1. **Host** controls playback (play/pause/seek) via minimal HTTP calls
2. **Database Changes** trigger automatic Realtime broadcasts to all members
3. **Members** send presence updates with their current video state
4. **Server** calculates sync status and maintains room state

## Core Components

### 1. Presence-Based Sync

The presence system replaces traditional HTTP heartbeats for efficient status tracking.

#### Update Frequency
- **Interval**: Every 3 seconds per user
- **Purpose**: Continuous sync status monitoring
- **Tolerance**: 2 seconds difference threshold

#### Data Flow
```
Member Client → Presence Update → Realtime Channel → Database Trigger → Broadcast to All
```

#### Presence Payload
```javascript
{
  user_id: "user123",
  username: "AnimeFan",
  current_time: 123.45,
  is_playing: true,
  last_update: 1704110400000
}
```

### 2. Database-Driven Events

Room state changes automatically trigger Realtime broadcasts to all members.

#### Host Control Flow
```javascript
// Host action (HTTP call)
await fetch('/sync/control', {
  method: 'POST',
  body: JSON.stringify({
    room_id: 'abc123',
    user_id: 'host123',
    action: 'play',
    current_time: 150.0
  })
});

// Database update triggers Realtime broadcast
// All members receive postgres_changes event
```

#### Event Processing
```sql
-- When host updates room state
UPDATE rooms 
SET is_playing = true, current_time = 150.0
WHERE room_id = 'abc123';

-- This automatically triggers Realtime broadcast
-- All connected clients receive the change
```

### 3. Sync Status Calculation

#### Time Difference Algorithm
```javascript
function calculateSyncStatus(hostTime, memberTime) {
  const timeDifference = Math.abs(hostTime - memberTime);
  const isSynced = timeDifference <= 2; // 2 seconds tolerance
  
  return {
    isSynced,
    timeDifference,
    hostTime,
    memberTime,
    syncPercentage: Math.max(0, 100 - (timeDifference * 10))
  };
}
```

#### Sync Status Levels
- **Perfect Sync**: 0-0.5 seconds difference
- **Good Sync**: 0.5-1 second difference  
- **Minor Drift**: 1-2 seconds difference
- **Out of Sync**: >2 seconds difference

#### Database Calculation
```sql
-- Automatic sync status calculation in trigger
CREATE OR REPLACE FUNCTION update_member_presence()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate sync status based on room state
  SELECT 
    current_time, 
    is_playing 
  INTO NEW.current_time, NEW.is_synced
  FROM rooms 
  WHERE room_id = NEW.room_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

### 4. Playback Control Flow

#### Host Actions
Only the host can initiate playback controls through the unified sync endpoint:

```javascript
// Host plays video
async function handlePlay() {
  const response = await fetch('/sync/control', {
    method: 'POST',
    body: JSON.stringify({
      room_id: this.roomId,
      user_id: this.userId,
      action: 'play',
      current_time: this.video.currentTime
    })
  });
  
  // Database update triggers automatic broadcast to all members
  // No manual WebSocket sending required
}
```

#### Member Response
```javascript
// Member receives database change event
channel.on('postgres_changes', 
  { event: 'UPDATE', schema: 'public', table: 'rooms' },
  (payload) => {
    if (payload.new.host_user_id !== this.userId) {
      // Auto-sync to host state
      this.video.currentTime = payload.new.current_time;
      if (payload.new.is_playing) {
        this.video.play();
      } else {
        this.video.pause();
      }
    }
  }
);
```

---

### 5. The "Live" Button

When users get out of sync, they can click the "Live" button to immediately resync.

#### Implementation
```javascript
async function syncToLive() {
  // Get current host state via optimized function
  const { data } = await supabase.rpc('get_room_sync_state', {
    p_room_id: this.roomId,
    p_user_id: this.userId
  });
  
  if (data.error) {
    throw new Error(data.error);
  }
  
  // Seek to host position
  this.video.currentTime = data.room.current_time;
  
  // Update sync status
  this.isSynced = data.user_sync.is_synced;
  this.updateSyncIndicator();
  
  // Show feedback
  this.showNotification('Synced to live');
}
```

#### UI States
```html
<button 
  @click="syncToLive"
  :class="{ 'btn-danger': !isSynced, 'btn-success': isSynced }"
  :disabled="isSynced">
  {{ isSynced ? '✓ Live' : '⚡ Sync to Live' }}
</button>
```

---

## Algorithm Details

### 1. Client-Side Algorithm

#### Initialization
```javascript
class SyncClient {
  constructor(roomId, userId) {
    this.roomId = roomId;
    this.userId = userId;
    this.isHost = false;
    this.heartbeatInterval = null;
    this.lastSyncTime = 0;
    this.syncTolerance = 2; // seconds
  }

  start() {
    // Start heartbeat loop
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 2500); // 2.5 seconds
    
    // Listen for server events
    this.setupEventListeners();
  }

  async sendHeartbeat() {
    try {
      const response = await fetch('/sync/heartbeat', {
        method: 'POST',
        body: JSON.stringify({
          room_id: this.roomId,
          user_id: this.userId,
          current_time: this.video.currentTime,
          is_playing: !this.video.paused
        })
      });
      
      const data = await response.json();
      this.updateSyncStatus(data.data.sync_status);
      
    } catch (error) {
      console.error('Heartbeat failed:', error);
    }
  }
}
```

#### Event Handling
```javascript
setupEventListeners() {
  // Listen for playback events
  this.channel.on('broadcast', { event: 'play' }, (payload) => {
    if (!this.isHost) {
      this.syncToHost(payload.payload.current_time, true);
    }
  });
  
  this.channel.on('broadcast', { event: 'pause' }, (payload) => {
    if (!this.isHost) {
      this.syncToHost(payload.payload.current_time, false);
    }
  });
  
  this.channel.on('broadcast', { event: 'seek' }, (payload) => {
    if (!this.isHost) {
      this.syncToHost(payload.payload.current_time, this.video.paused);
    }
  });
}

syncToHost(hostTime, shouldPlay) {
  const currentTime = this.video.currentTime;
  const timeDiff = Math.abs(hostTime - currentTime);
  
  // Only seek if difference is significant
  if (timeDiff > 0.5) {
    this.video.currentTime = hostTime;
  }
  
  // Sync playback state
  if (shouldPlay && this.video.paused) {
    this.video.play();
  } else if (!shouldPlay && !this.video.paused) {
    this.video.pause();
  }
  
  this.lastSyncTime = Date.now();
  this.updateSyncIndicator(true);
}
```

### 2. Server-Side Algorithm

#### Heartbeat Processing
```typescript
// In /sync/heartbeat/index.ts
export async function processHeartbeat(data: HeartbeatRequest) {
  // 1. Validate user is in room
  const member = await validateRoomMember(data.room_id, data.user_id);
  
  // 2. Get current room state
  const room = await getRoom(data.room_id);
  
  // 3. Calculate sync status
  const timeDifference = Math.abs(room.current_time - data.current_time);
  const isSynced = timeDifference <= 2;
  
  // 4. Update member state
  await updateMemberState(data.room_id, data.user_id, {
    current_time: data.current_time,
    is_synced: isSynced,
    last_heartbeat: new Date()
  });
  
  // 5. Record sync state for analytics
  await createSyncState({
    room_id: data.room_id,
    user_id: data.user_id,
    host_time: room.current_time,
    member_time: data.current_time,
    time_difference: timeDifference,
    is_synced: isSynced,
    sync_event_type: 'heartbeat'
  });
  
  // 6. Broadcast sync status to room
  await broadcastToRoom(data.room_id, 'heartbeat', {
    user_id: data.user_id,
    current_time: data.current_time,
    is_synced: isSynced
  });
  
  // 7. Return sync info to client
  return {
    sync_status: { is_synced: isSynced, time_difference: timeDifference },
    room_info: {
      current_time: room.current_time,
      is_playing: room.is_playing
    }
  };
}
```

#### Playback Control Processing
```typescript
// In /sync/play-pause/index.ts
export async function processPlayPause(data: PlayPauseRequest) {
  // 1. Validate user is host
  const member = await validateHost(data.room_id, data.user_id);
  
  // 2. Update room playback state
  const room = await updateRoomState(data.room_id, {
    is_playing: data.is_playing,
    current_time: data.current_time || 'current_time'
  });
  
  // 3. Mark all members as needing sync
  await markAllMembersForSync(data.room_id);
  
  // 4. Create sync state records
  await createBulkSyncStates(data.room_id, room, 'play_pause');
  
  // 5. Broadcast to all members
  await broadcastToRoom(data.room_id, data.is_playing ? 'play' : 'pause', {
    current_time: room.current_time,
    user_id: data.user_id,
    username: member.username
  });
  
  return { room, message: `Playback ${data.is_playing ? 'resumed' : 'paused'}` };
}
```

---

## Edge Cases & Solutions

### 1. Network Latency

#### Problem
High latency causes delayed heartbeat updates.

#### Solution
```javascript
// Compensate for network latency
function compensateForLatency(serverTime, clientTime, rtt) {
  const latencyCompensation = rtt / 2;
  const adjustedServerTime = serverTime + latencyCompensation;
  return adjustedServerTime;
}

// Measure RTT
async function measureRTT() {
  const startTime = Date.now();
  await fetch('/sync/ping');
  const rtt = Date.now() - startTime;
  return rtt;
}
```

### 2. Video Loading Delays

#### Problem
Video buffering causes sync issues.

#### Solution
```javascript
// Wait for video to be ready before seeking
function syncWhenReady(targetTime) {
  if (this.video.readyState >= 2) { // HAVE_CURRENT_DATA
    this.video.currentTime = targetTime;
  } else {
    this.video.addEventListener('loadeddata', () => {
      this.video.currentTime = targetTime;
    }, { once: true });
  }
}
```

### 3. Host Disconnection

#### Problem
Host leaves unexpectedly, breaking sync.

#### Solution
```sql
-- Automatic host transfer trigger
CREATE OR REPLACE FUNCTION transfer_host_on_leave()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_host = true THEN
    -- Transfer to oldest member
    UPDATE room_members 
    SET is_host = true 
    WHERE room_id = OLD.room_id 
      AND user_id != OLD.user_id
    ORDER BY joined_at ASC 
    LIMIT 1;
    
    -- Notify room of host change
    PERFORM pg_notify('host_changed', 
      json_build_object(
        'room_id', OLD.room_id,
        'new_host', NEW.host_username
      )::text
    );
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
```

### 4. Clock Drift

#### Problem
Client device clocks drift over time.

#### Solution
```javascript
// Periodic clock synchronization
class ClockSync {
  constructor() {
    this.serverOffset = 0;
    this.lastSync = 0;
  }
  
  async syncClock() {
    const clientTime = Date.now();
    const response = await fetch('/sync/time');
    const serverTime = await response.json();
    
    const rtt = Date.now() - clientTime;
    this.serverOffset = serverTime.time - (clientTime + rtt / 2);
    this.lastSync = Date.now();
  }
  
  getServerTime() {
    return Date.now() + this.serverOffset;
  }
}
```

---

## Performance Optimization

### 1. Batch Processing

```typescript
// Process multiple heartbeats in batches
class HeartbeatProcessor {
  private batch: HeartbeatRequest[] = [];
  private batchTimeout: NodeJS.Timeout;
  
  async addHeartbeat(heartbeat: HeartbeatRequest) {
    this.batch.push(heartbeat);
    
    if (this.batch.length >= 10) {
      await this.processBatch();
    } else if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => {
        this.processBatch();
      }, 100);
    }
  }
  
  private async processBatch() {
    if (this.batch.length === 0) return;
    
    await processBulkHeartbeats(this.batch);
    this.batch = [];
    
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
  }
}
```

### 2. Database Optimization

```sql
-- Optimized sync state queries
CREATE INDEX CONCURRENTLY idx_sync_states_composite 
ON sync_states (room_id, created_at DESC, user_id);

-- Partition sync states by time for better performance
CREATE TABLE sync_states_y2024m01 PARTITION OF sync_states
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
```

### 3. Caching

```typescript
// Cache room state to reduce database load
class RoomStateCache {
  private cache = new Map<string, RoomState>();
  private ttl = 5000; // 5 seconds
  
  async getRoomState(roomId: string): Promise<RoomState> {
    const cached = this.cache.get(roomId);
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.data;
    }
    
    const roomState = await fetchRoomStateFromDB(roomId);
    this.cache.set(roomId, {
      data: roomState,
      timestamp: Date.now()
    });
    
    return roomState;
  }
}
```

---

## Monitoring & Analytics

### 1. Sync Metrics

```typescript
interface SyncMetrics {
  avgLatency: number;
  syncPercentage: number;
  outOfSyncUsers: number;
  heartbeatFrequency: number;
  networkQuality: 'excellent' | 'good' | 'poor';
}

async function calculateSyncMetrics(roomId: string): Promise<SyncMetrics> {
  const recentStates = await getRecentSyncStates(roomId, 60); // Last minute
  
  const avgLatency = recentStates.reduce((sum, state) => 
    sum + state.time_difference, 0) / recentStates.length;
  
  const syncPercentage = (recentStates.filter(s => s.is_synced).length / 
    recentStates.length) * 100;
  
  return {
    avgLatency,
    syncPercentage,
    outOfSyncUsers: recentStates.filter(s => !s.is_synced).length,
    heartbeatFrequency: recentStates.length / 60, // per second
    networkQuality: avgLatency < 0.5 ? 'excellent' : 
                   avgLatency < 1.5 ? 'good' : 'poor'
  };
}
```

### 2. Alerting

```typescript
// Alert on sync issues
async function checkSyncHealth() {
  const activeRooms = await getActiveRooms();
  
  for (const room of activeRooms) {
    const metrics = await calculateSyncMetrics(room.room_id);
    
    if (metrics.syncPercentage < 80) {
      await sendAlert({
        type: 'sync_issue',
        room_id: room.room_id,
        sync_percentage: metrics.syncPercentage,
        avg_latency: metrics.avgLatency
      });
    }
  }
}
```

---

## Testing Strategy

### 1. Unit Tests

```typescript
describe('Sync Algorithm', () => {
  test('calculates sync status correctly', () => {
    expect(calculateSyncStatus(100, 101)).toEqual({
      isSynced: true,
      timeDifference: 1,
      syncPercentage: 90
    });
    
    expect(calculateSyncStatus(100, 105)).toEqual({
      isSynced: false,
      timeDifference: 5,
      syncPercentage: 50
    });
  });
});
```

### 2. Integration Tests

```typescript
describe('Multi-User Sync', () => {
  test('host play broadcasts to all members', async () => {
    const room = await createTestRoom();
    const host = new TestClient(room.room_id, room.host_user_id, true);
    const member1 = new TestClient(room.room_id, 'user1', false);
    const member2 = new TestClient(room.room_id, 'user2', false);
    
    await host.connect();
    await member1.connect();
    await member2.connect();
    
    await host.play();
    
    await waitFor(() => 
      member1.video.currentTime === host.video.currentTime &&
      member2.video.currentTime === host.video.currentTime
    );
    
    expect(member1.video.paused).toBe(false);
    expect(member2.video.paused).toBe(false);
  });
});
```

### 3. Load Testing

```typescript
// Test with 50 concurrent users
describe('Performance Tests', () => {
  test('handles 50 concurrent users', async () => {
    const room = await createTestRoom();
    const clients = [];
    
    // Create 50 clients
    for (let i = 0; i < 50; i++) {
      clients.push(new TestClient(room.room_id, `user${i}`, false));
    }
    
    // Connect all clients
    await Promise.all(clients.map(c => c.connect()));
    
    // Host seeks
    const host = clients[0];
    host.isHost = true;
    await host.seek(300);
    
    // Verify all clients sync within 2 seconds
    const startTime = Date.now();
    await waitFor(() => 
      clients.every(c => Math.abs(c.video.currentTime - 300) < 0.5)
    );
    
    const syncTime = Date.now() - startTime;
    expect(syncTime).toBeLessThan(2000); // Within 2 seconds
  });
});
```

---

## Troubleshooting

### Common Issues

1. **Users showing as out of sync**
   - Check network connectivity
   - Verify heartbeat frequency
   - Check video loading state

2. **Host controls not working**
   - Verify host status
   - Check rate limiting
   - Validate room membership

3. **High latency**
   - Check database performance
   - Monitor network latency
   - Review batch processing efficiency

### Debug Tools

```javascript
// Sync debug panel
class SyncDebugPanel {
  constructor(client) {
    this.client = client;
    this.metrics = [];
  }
  
  logSyncEvent(event, data) {
    this.metrics.push({
      timestamp: Date.now(),
      event,
      data,
      clientTime: this.client.video.currentTime,
      isHost: this.client.isHost
    });
    
    if (this.metrics.length > 100) {
      this.metrics.shift(); // Keep last 100 events
    }
  }
  
  exportDebugLog() {
    return JSON.stringify(this.metrics, null, 2);
  }
}
```

This synchronization algorithm ensures smooth, real-time coordination between all room members while handling edge cases and maintaining high performance.