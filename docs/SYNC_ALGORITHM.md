# Synchronization Algorithm

Detailed explanation of the real-time synchronization system that enables multiple users to watch anime together in perfect sync.

## Overview

The Watchium synchronization algorithm ensures that all participants in a room maintain near-perfect playback synchronization with <100ms latency. The system uses a hybrid approach combining WebSocket events, database triggers, and presence tracking.

## Architecture

### Components

1. **Host Authority Model** - Only the room host controls playback
2. **Real-time Broadcasting** - Instant event distribution via WebSocket
3. **Presence Tracking** - Continuous sync status monitoring
4. **Database Triggers** - Automatic event generation
5. **Client-side Sync** - Automatic client adjustment to host state

### Data Flow

```
Host Action → Database Trigger → Realtime Broadcast → Client Sync → Video Update
```

## Core Algorithm

### 1. Host Control Flow

```typescript
// Host initiates action (play/pause/seek)
async function hostControl(action: 'play' | 'pause' | 'seek', currentTime?: number) {
  // 1. Validate host authority
  const isHost = await validateHostAuthority(roomId, userId);
  if (!isHost) throw new Error('Only host can control playback');
  
  // 2. Update room state (triggers broadcast)
  await updateRoomState(roomId, {
    is_playing: action === 'play',
    current_playback_time: currentTime || getCurrentTime(),
    updated_at: now()
  });
  
  // 3. Database trigger fires real-time broadcast
  // 4. All clients receive event and sync automatically
}
```

### 2. Client Sync Algorithm

```typescript
class SyncManager {
  private toleranceMs = 2000; // 2 seconds tolerance
  private heartbeatInterval = 3000; // 3 seconds
  
  constructor(private video: HTMLVideoElement, private userId: string) {
    this.setupEventHandlers();
    this.startHeartbeat();
  }
  
  private setupEventHandlers() {
    // Listen for real-time events
    this.channel.on('postgres_changes', 
      { event: 'UPDATE', table: 'rooms' },
      (payload) => {
        if (payload.new.host_user_id !== this.userId) {
          this.syncToHost(payload.new);
        }
      }
    );
  }
  
  private syncToHost(roomState: any) {
    const targetTime = roomState.current_playback_time;
    const currentTime = this.video.currentTime;
    const timeDiff = Math.abs(targetTime - currentTime);
    
    // Only sync if difference is significant
    if (timeDiff > 0.1) { // 100ms threshold
      this.video.currentTime = targetTime;
      
      // Handle play/pause state
      if (roomState.is_playing && this.video.paused) {
        this.video.play().catch(console.error);
      } else if (!roomState.is_playing && !this.video.paused) {
        this.video.pause();
      }
    }
  }
  
  private startHeartbeat() {
    setInterval(async () => {
      await this.sendHeartbeat();
    }, this.heartbeatInterval);
  }
  
  private async sendHeartbeat() {
    await this.channel.track({
      user_id: this.userId,
      current_time: this.video.currentTime,
      is_playing: !this.video.paused
    });
  }
}
```

### 3. Sync Status Calculation

```sql
-- Database function for sync status calculation
CREATE OR REPLACE FUNCTION calculate_sync_status(
    p_host_time DECIMAL(10,2),
    p_member_time DECIMAL(10,2)
)
RETURNS BOOLEAN AS $$
DECLARE
    time_diff DECIMAL(10,2);
BEGIN
    time_diff := ABS(p_host_time - p_member_time);
    RETURN time_diff <= 2; -- 2 seconds tolerance
END;
$$ LANGUAGE plpgsql;
```

## Event Types and Handling

### Playback Events

#### Play Event
```typescript
interface PlayEvent {
  type: 'play';
  payload: {
    current_time: number;
    user_id: string;
    username: string;
  };
  timestamp: number;
}

// Client handling
channel.on('broadcast', { event: 'play' }, (payload) => {
  if (payload.payload.user_id !== currentUserId) {
    video.currentTime = payload.payload.current_time;
    video.play();
    updateSyncStatus(true);
  }
});
```

#### Pause Event
```typescript
interface PauseEvent {
  type: 'pause';
  payload: {
    current_time: number;
    user_id: string;
    username: string;
  };
  timestamp: number;
}

// Client handling
channel.on('broadcast', { event: 'pause' }, (payload) => {
  if (payload.payload.user_id !== currentUserId) {
    video.currentTime = payload.payload.current_time;
    video.pause();
    updateSyncStatus(true);
  }
});
```

#### Seek Event
```typescript
interface SeekEvent {
  type: 'seek';
  payload: {
    current_time: number;
    user_id: string;
    username: string;
  };
  timestamp: number;
}

// Client handling
channel.on('broadcast', { event: 'seek' }, (payload) => {
  if (payload.payload.user_id !== currentUserId) {
    video.currentTime = payload.payload.current_time;
    updateSyncStatus(true);
  }
});
```

### Presence Events

#### Heartbeat
```typescript
interface HeartbeatEvent {
  type: 'heartbeat';
  payload: {
    user_id: string;
    current_time: number;
    is_synced: boolean;
  };
  timestamp: number;
}

// Client sends heartbeat every 3 seconds
setInterval(() => {
  channel.track({
    user_id: currentUserId,
    current_time: video.currentTime,
    is_playing: !video.paused
  });
}, 3000);
```

## Sync State Management

### Database Schema

```sql
CREATE TABLE sync_states (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id VARCHAR(10) NOT NULL,
    user_id VARCHAR(100) NOT NULL,
    host_time DECIMAL(10,2) NOT NULL,
    member_time DECIMAL(10,2) NOT NULL,
    time_difference DECIMAL(10,2) NOT NULL,
    is_synced BOOLEAN NOT NULL,
    sync_event_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Sync State Creation

```sql
-- Triggered on every playback event
CREATE OR REPLACE FUNCTION create_sync_state_record(
    p_room_id VARCHAR(10),
    p_user_id VARCHAR(100),
    p_host_time DECIMAL(10,2),
    p_member_time DECIMAL(10,2),
    p_sync_event_type VARCHAR(50)
)
RETURNS void AS $$
DECLARE
    time_diff DECIMAL(10,2);
    is_synced BOOLEAN;
BEGIN
    time_diff := ABS(p_host_time - p_member_time);
    is_synced := time_diff <= 2;
    
    INSERT INTO sync_states (
        room_id, user_id, host_time, member_time,
        time_difference, is_synced, sync_event_type
    ) VALUES (
        p_room_id, p_user_id, p_host_time, p_member_time,
        time_diff, is_synced, p_sync_event_type
    );
    
    -- Update member sync status
    UPDATE room_members 
    SET is_synced = is_synced,
        last_heartbeat = NOW()
    WHERE room_id = p_room_id AND user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;
```

## Performance Optimization

### Bulk Sync Updates

```sql
-- Update all members' sync status efficiently
CREATE OR REPLACE FUNCTION bulk_sync_update(
    p_room_id VARCHAR(10),
    p_host_time DECIMAL(10,2),
    p_sync_event_type VARCHAR(50)
)
RETURNS void AS $$
DECLARE
    member_record RECORD;
BEGIN
    -- Process all members in single query
    FOR member_record IN 
        SELECT user_id, current_playback_time 
        FROM room_members 
        WHERE room_id = p_room_id
    LOOP
        INSERT INTO sync_states (
            room_id, user_id, host_time, member_time, 
            time_difference, is_synced, sync_event_type
        ) VALUES (
            p_room_id, 
            member_record.user_id, 
            p_host_time, 
            member_record.current_playback_time,
            ABS(p_host_time - member_record.current_playback_time),
            ABS(p_host_time - member_record.current_playback_time) <= 2,
            p_sync_event_type
        );
    END LOOP;
    
    -- Update room activity
    UPDATE rooms 
    SET last_activity = NOW(), updated_at = NOW()
    WHERE room_id = p_room_id;
END;
$$ LANGUAGE plpgsql;
```

### Presence-Based Optimization

```sql
-- Optimized member presence trigger
CREATE OR REPLACE FUNCTION update_member_presence()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_heartbeat = NOW();
    
    -- Calculate sync status based on room state
    SELECT 
        current_playback_time, 
        is_playing 
    INTO NEW.current_playback_time, NEW.is_synced
    FROM rooms 
    WHERE room_id = NEW.room_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Client-Side Optimization

### Debouncing

```typescript
class OptimizedSyncManager {
  private seekDebouncer = this.debounce((time: number) => {
    this.seekToTime(time);
  }, 500);
  
  private playPauseDebouncer = this.debounce((action: 'play' | 'pause') => {
    this.controlPlayback(action);
  }, 200);
  
  video.addEventListener('seek', () => {
    this.seekDebouncer(video.currentTime);
  });
  
  video.addEventListener('play', () => {
    this.playPauseDebouncer('play');
  });
  
  video.addEventListener('pause', () => {
    this.playPauseDebouncer('pause');
  });
}
```

### Smart Syncing

```typescript
class SmartSyncManager {
  private lastSyncTime = 0;
  private syncThreshold = 0.1; // 100ms
  
  private shouldSync(targetTime: number): boolean {
    const timeDiff = Math.abs(targetTime - this.video.currentTime);
    const timeSinceLastSync = Date.now() - this.lastSyncTime;
    
    return timeDiff > this.syncThreshold && timeSinceLastSync > 50;
  }
  
  private syncToTime(targetTime: number): void {
    if (this.shouldSync(targetTime)) {
      this.video.currentTime = targetTime;
      this.lastSyncTime = Date.now();
    }
  }
}
```

## Error Handling

### Network Resilience

```typescript
class ResilientSyncManager {
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  
  private async handleConnectionError(error: Error): Promise<void> {
    console.error('Connection error:', error);
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      setTimeout(() => {
        this.reconnect();
      }, delay);
    } else {
      this.showConnectionError();
    }
  }
  
  private async reconnect(): Promise<void> {
    try {
      await this.channel.subscribe();
      this.reconnectAttempts = 0;
      this.hideConnectionError();
    } catch (error) {
      await this.handleConnectionError(error);
    }
  }
}
```

### Sync Recovery

```typescript
class SyncRecoveryManager {
  private syncQueue: Array<() => Promise<void>> = [];
  private isRecovering = false;
  
  private async recoverSync(): Promise<void> {
    if (this.isRecovering) return;
    
    this.isRecovering = true;
    
    try {
      // Get current host state
      const hostState = await this.getHostState();
      
      // Sync to host state
      await this.syncToHostState(hostState);
      
      // Process queued sync operations
      while (this.syncQueue.length > 0) {
        const operation = this.syncQueue.shift();
        await operation();
      }
      
      this.isRecovering = false;
    } catch (error) {
      console.error('Sync recovery failed:', error);
      setTimeout(() => this.recoverSync(), 2000);
    }
  }
  
  private queueSyncOperation(operation: () => Promise<void>): void {
    if (this.isRecovering) {
      this.syncQueue.push(operation);
    } else {
      operation().catch(error => {
        console.error('Sync operation failed:', error);
        this.queueSyncOperation(operation);
      });
    }
  }
}
```

## Analytics and Monitoring

### Sync Metrics

```sql
-- Sync performance metrics
SELECT 
    room_id,
    sync_event_type,
    COUNT(*) as event_count,
    AVG(time_difference) as avg_time_diff,
    COUNT(CASE WHEN is_synced THEN 1 END) as synced_count,
    COUNT(*) as total_count,
    ROUND(
        (COUNT(CASE WHEN is_synced THEN 1 END) * 100.0 / COUNT(*)), 2
    ) as sync_percentage
FROM sync_states
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY room_id, sync_event_type
ORDER BY event_count DESC;
```

### Real-time Monitoring

```typescript
class SyncMonitor {
  private metrics = {
    totalEvents: 0,
    syncErrors: 0,
    avgLatency: 0,
    activeUsers: 0
  };
  
  private trackEvent(eventType: string, latency: number): void {
    this.metrics.totalEvents++;
    this.metrics.avgLatency = 
      (this.metrics.avgLatency * (this.metrics.totalEvents - 1) + latency) / this.metrics.totalEvents;
    
    // Send metrics to monitoring service
    this.sendMetrics();
  }
  
  private sendMetrics(): void {
    // Send to monitoring dashboard
    fetch('/api/metrics', {
      method: 'POST',
      body: JSON.stringify(this.metrics)
    });
  }
}
```

## Best Practices

### Client Implementation

1. **Debounce Rapid Events**: Prevent excessive sync operations
2. **Handle Network Issues**: Implement reconnection logic
3. **Optimize Video Updates**: Use smart sync thresholds
4. **Monitor Performance**: Track sync latency and success rates
5. **Graceful Degradation**: Fallback to polling if WebSocket fails

### Server Optimization

1. **Bulk Operations**: Process multiple members in single queries
2. **Efficient Indexing**: Optimize for real-time queries
3. **Connection Pooling**: Manage database connections efficiently
4. **Data Retention**: Clean up old sync state data
5. **Rate Limiting**: Prevent abuse and ensure stability

This synchronization algorithm provides the foundation for seamless multi-user anime watching experiences with minimal latency and maximum reliability.