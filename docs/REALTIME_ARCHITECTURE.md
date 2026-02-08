# Realtime Architecture

Comprehensive guide to the WebSocket-first architecture that powers the Watchium real-time anime watching platform.

## Architecture Overview

Watchium uses a WebSocket-first architecture with Supabase Realtime as the primary communication layer. This design ensures minimal latency, efficient resource usage, and automatic scalability.

## Core Principles

### 1. WebSocket-First Communication
- **Primary Channel**: All real-time events flow through WebSocket connections
- **Database as Event Source**: Database changes automatically trigger WebSocket broadcasts
- **Minimal HTTP**: HTTP used only for essential operations (room management, authentication)
- **Presence-Based Sync**: Efficient sync status tracking without polling

### 2. Event-Driven Design
- **Database Triggers**: Automatic event generation on data changes
- **Realtime Broadcasts**: Instant distribution to all connected clients
- **Decoupled Architecture**: Clients react to events without direct coupling

### 3. State Synchronization
- **Host Authority Model**: Single source of truth for playback state
- **Automatic Client Sync**: Clients automatically adjust to host state changes
- **Presence Tracking**: Real-time sync status monitoring

## System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client A      │    │   Client B      │    │   Client C      │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                    │                    │
          │                    │                    │
          └────────────────────┼────────────────────┘
                    │
          ┌─────────────────▼─────────────────┐
          │     Supabase Realtime Cluster      │
          │  (WebSocket Event Distribution)   │
          └─────────────────┬─────────────────┘
                    │
          ┌─────────────────▼─────────────────┐
          │      PostgreSQL Database          │
          │  (Event Generation & Storage)    │
          └─────────────────────────────────────┘
```

## Realtime Components

### 1. Supabase Realtime Engine

#### Channel Structure
```typescript
// Room-specific channels
const roomChannel = supabase.channel(`room:${roomId}`, {
  config: {
    broadcast: { self: true },
    presence: { key: userId }
  }
});

// Global presence channel
const presenceChannel = supabase.channel('global-presence', {
  config: {
    presence: { key: userId }
  }
});
```

#### Event Types
```typescript
// Database change events (automatic)
channel.on('postgres_changes', {
  event: 'UPDATE',
  schema: 'public', 
  table: 'rooms',
  filter: `room_id=eq.${roomId}`
}, (payload) => {
  // Handle room state changes
});

// Broadcast events (manual)
channel.send({
  type: 'broadcast',
  event: 'custom_event',
  payload: eventData
});

// Presence events (automatic)
channel.on('presence', { event: 'sync' }, (payload) => {
  // Handle presence updates
});
```

### 2. Database Integration

#### Realtime-Enabled Tables
```sql
-- Enable Realtime on all tables
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE room_members;
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
ALTER PUBLICATION supabase_realtime ADD TABLE sync_states;
```

#### Trigger-Based Events
```sql
-- Room state change trigger
CREATE OR REPLACE FUNCTION broadcast_room_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Database change automatically triggers Realtime broadcast
    -- No additional code needed
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_room_state_change
    AFTER UPDATE ON rooms
    FOR EACH ROW EXECUTE FUNCTION broadcast_room_update();
```

### 3. Presence System

#### Presence Tracking
```typescript
// Client sends presence updates
setInterval(() => {
  channel.track({
    user_id: userId,
    current_time: video.currentTime,
    is_playing: !video.paused,
    username: currentUsername,
    avatar_url: currentAvatar
  });
}, 3000);

// Server receives presence data
channel.on('presence', { event: 'sync' }, (payload) => {
  const presenceState = payload.presences[userId];
  updateSyncStatus(presenceState);
});
```

#### Sync Status Calculation
```sql
-- Presence-based sync status trigger
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

## Communication Patterns

### 1. Database-First Events

#### Room State Changes
```sql
-- Host updates room state
UPDATE rooms 
SET is_playing = true, 
    current_play_time = 120.5,
    updated_at = NOW()
WHERE room_id = 'abc123';

-- Automatically triggers:
-- 1. Database change event
-- 2. Realtime broadcast to all room subscribers
-- 3. Client sync actions
```

#### Member Management
```sql
-- User joins room
INSERT INTO room_members (room_id, user_id, username, is_host)
VALUES ('abc123', 'user456', 'Viewer123', false);

-- Triggers:
-- 1. Member join event
-- 2. Room activity update
-- 3. Host transfer if needed
-- 4. System comment creation
```

### 2. Broadcast Events

#### Custom Broadcasting
```typescript
// Manual broadcast for custom events
await channel.send({
  type: 'broadcast',
  event: 'chat_message',
  payload: {
    user_id: 'user123',
    message: 'This is great!',
    timestamp: Date.now()
  }
});

// Server-side broadcast from Edge Function
await supabase.rpc('broadcast_to_room', {
  p_room_id: 'abc123',
  p_event_type: 'custom_event',
  p_payload: eventData
});
```

### 3. Presence Events

#### Automatic Presence
```typescript
// Client automatically sends presence
channel.track({
  user_id: 'user123',
  status: 'online',
  current_time: 120.5,
  is_playing: true
});

// Server receives presence updates
channel.on('presence', { event: 'join' }, (payload) => {
  console.log('User joined:', payload.key);
  updateMemberList(payload.presences);
});
```

## Performance Optimization

### 1. Efficient Event Distribution

#### Bulk Operations
```sql
-- Single query updates all members
CREATE OR REPLACE FUNCTION bulk_sync_update(
    p_room_id VARCHAR(10),
    p_host_time DECIMAL(10,2),
    p_sync_event_type VARCHAR(50)
)
RETURNS void AS $$
DECLARE
    member_record RECORD;
BEGIN
    -- Process all members in one loop
    FOR member_record IN 
        SELECT user_id, current_playback_time 
        FROM room_members 
        WHERE room_id = p_room_id
    LOOP
        -- Create sync state for each member
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
END;
$$ LANGUAGE plpgsql;
```

#### Optimized Indexing
```sql
-- Presence queries optimization
CREATE INDEX CONCURRENTLY idx_room_members_presence 
ON room_members (room_id, last_heartbeat DESC, is_synced);

-- Room state queries optimization
CREATE INDEX CONCURRENTLY idx_rooms_state 
ON rooms (room_id, is_playing, current_playback_time, updated_at DESC);
```

### 2. Connection Management

#### Connection Pooling
```typescript
// Reuse connections across components
class ConnectionManager {
  private connections = new Map<string, any>();
  
  getChannel(roomId: string, userId: string) {
    const key = `${roomId}:${userId}`;
    
    if (!this.connections.has(key)) {
      const channel = supabase.channel(`room:${roomId}`, {
        config: {
          broadcast: { self: true },
          presence: { key: userId }
        }
      });
      
      this.connections.set(key, channel);
    }
    
    return this.connections.get(key);
  }
  
  cleanup(userId: string) {
    // Clean up user connections
    for (const [key, channel] of this.connections) {
      if (key.endsWith(`:${userId}`)) {
        channel.unsubscribe();
        this.connections.delete(key);
      }
    }
  }
}
```

#### Automatic Reconnection
```typescript
class ResilientChannel {
  private maxRetries = 5;
  private retryDelay = 1000;
  
  async connectWithRetry(roomId: string, userId: string) {
    let retries = 0;
    
    while (retries < this.maxRetries) {
      try {
        const channel = supabase.channel(`room:${roomId}`, {
          config: {
            broadcast: { self: true },
            presence: { key: userId }
          }
        });
        
        await channel.subscribe();
        return channel;
      } catch (error) {
        retries++;
        const delay = this.retryDelay * Math.pow(2, retries - 1);
        
        console.log(`Connection attempt ${retries} failed, retrying in ${delay}ms`);
        await this.sleep(delay);
      }
    }
    
    throw new Error('Failed to connect after maximum retries');
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Scalability Design

### 1. Horizontal Scaling

#### Multi-Region Deployment
```typescript
// Region-aware connection
const region = detectClosestRegion();
const supabaseUrl = `https://${region}.supabase.co`;

const supabase = createClient(supabaseUrl, apiKey);
```

#### Load Balancing
```sql
-- Connection distribution across multiple Realtime nodes
-- (Handled automatically by Supabase infrastructure)
```

### 2. Vertical Scaling

#### Resource Optimization
```typescript
// Lazy loading of room data
class LazyRoomLoader {
  private loadedRooms = new Set<string>();
  private roomCache = new Map<string, any>();
  
  async loadRoom(roomId: string): Promise<any> {
    if (!this.loadedRooms.has(roomId)) {
      const room = await this.fetchRoomFromDB(roomId);
      this.roomCache.set(roomId, room);
      this.loadedRooms.add(roomId);
    }
    
    return this.roomCache.get(roomId);
  }
}
```

#### Memory Management
```typescript
// Automatic cleanup of inactive connections
class ConnectionManager {
  private connectionTimeout = 5 * 60 * 1000; // 5 minutes
  
  private cleanupInactiveConnections(): void {
    const now = Date.now();
    
    for (const [key, connection] of this.connections) {
      const lastActivity = connection.lastActivity || 0;
      
      if (now - lastActivity > this.connectionTimeout) {
        connection.unsubscribe();
        this.connections.delete(key);
      }
    }
  }
  
  // Run cleanup every minute
  setInterval(() => {
    this.cleanupInactiveConnections();
  }, 60000);
}
```

## Monitoring and Observability

### 1. Real-time Metrics

#### Connection Metrics
```typescript
class RealtimeMonitor {
  private metrics = {
    activeConnections: 0,
    totalEvents: 0,
    avgLatency: 0,
    errorRate: 0
  };
  
  trackConnection(connected: boolean): void {
    if (connected) {
      this.metrics.activeConnections++;
    } else {
      this.metrics.activeConnections--;
    }
  }
  
  trackEvent(latency: number, isError: boolean): void {
    this.metrics.totalEvents++;
    
    if (isError) {
      this.metrics.errorRate = 
        (this.metrics.errorRate * (this.metrics.totalEvents - 1) + 1) / this.metrics.totalEvents;
    } else {
      this.metrics.avgLatency = 
        (this.metrics.avgLatency * (this.metrics.totalEvents - 1) + latency) / this.metrics.totalEvents;
    }
  }
  
  getMetrics() {
    return { ...this.metrics };
  }
}
```

#### Performance Dashboard
```typescript
// Real-time performance monitoring
class PerformanceDashboard {
  private metrics = new RealtimeMonitor();
  
  startMonitoring(): void {
    // Send metrics every 30 seconds
    setInterval(() => {
      this.sendMetricsToDashboard();
    }, 30000);
  }
  
  private sendMetricsToDashboard(): void {
    const metrics = this.metrics.getMetrics();
    
    fetch('/api/metrics/realtime', {
      method: 'POST',
      body: JSON.stringify(metrics)
    });
  }
}
```

### 2. Health Checks

#### Connection Health
```typescript
class HealthChecker {
  async checkRealtimeHealth(): Promise<boolean> {
    try {
      // Test connection to Realtime
      const testChannel = supabase.channel('health-check');
      const subscription = await testChannel.subscribe();
      
      if (subscription.error) {
        return false;
      }
      
      await testChannel.unsubscribe();
      return true;
    } catch (error) {
      console.error('Realtime health check failed:', error);
      return false;
    }
  }
  
  async checkDatabaseHealth(): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('count', { count: 'exact', head: true });
      
      return !error && data !== null;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }
}
```

## Security Architecture

### 1. Authentication & Authorization

#### Row-Level Security
```sql
-- Secure room access
CREATE POLICY "Users can view rooms they have access to" ON rooms
FOR SELECT USING (
  is_public = true OR 
  room_id IN (
    SELECT room_id FROM room_members WHERE user_id = current_setting('app.current_user_id')
  )
);

-- Secure member operations
CREATE POLICY "Users can only modify their own member records" ON room_members
FOR UPDATE USING (
  user_id = current_setting('app.current_user_id', true)
);
```

#### Channel Security
```typescript
// Secure channel configuration
const secureChannel = supabase.channel(`room:${roomId}`, {
  config: {
    broadcast: { self: true },
    presence: { 
      key: userId,
      // Custom presence data
      data: {
        user_id: userId,
        token: userToken
      }
    }
  }
});

// Server-side validation
channel.on('subscribe', (status, err) => {
  if (status === 'SUBSCRIBED') {
    // Verify user has access to room
    validateRoomAccess(roomId, userId);
  }
});
```

### 2. Data Protection

#### Input Validation
```typescript
// Validate all incoming data
function validateEventPayload(eventType: string, payload: any): boolean {
  switch (eventType) {
    case 'play':
    case 'pause':
      return typeof payload.current_time === 'number' && 
             typeof payload.user_id === 'string';
    
    case 'seek':
      return typeof payload.current_time === 'number' && 
             payload.current_time >= 0;
    
    default:
      return false;
  }
}
```

#### Rate Limiting
```sql
-- Database-based rate limiting
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_user_id VARCHAR(100),
    p_action VARCHAR(50),
    p_window_minutes INTEGER DEFAULT 1,
    p_max_requests INTEGER DEFAULT 60
)
RETURNS BOOLEAN AS $$
DECLARE
    request_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO request_count
    FROM sync_states
    WHERE user_id = p_user_id
        AND sync_event_type = p_action
        AND created_at > NOW() - INTERVAL '1 minute' * p_window_minutes;
    
    RETURN request_count < p_max_requests;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Best Practices

### 1. Connection Management
- Always handle connection errors gracefully
- Implement automatic reconnection logic
- Clean up connections on component unmount
- Use connection pooling for efficiency

### 2. Event Handling
- Debounce rapid events to prevent spam
- Validate all incoming event data
- Handle events asynchronously
- Implement proper error boundaries

### 3. Performance Optimization
- Use bulk operations for multiple updates
- Optimize database queries with proper indexing
- Implement efficient presence tracking
- Monitor and tune performance metrics

### 4. Security
- Validate all user inputs
- Implement proper authentication
- Use row-level security for data access
- Monitor for unusual activity patterns

This WebSocket-first architecture provides the foundation for scalable, real-time multi-user experiences with minimal latency and maximum reliability.