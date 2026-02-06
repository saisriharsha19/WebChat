# Architecture Overhaul: Robust DMs, Groups, and Professional UI

## Goal
Transform the current "room-string-based" chat usage into a robust, relational system supporting secure Direct Messages (DMs), Group Chats, and a professional, optimized User Experience.

## Current State Analysis
- **Rooms:** `Room` table exists but `Message.room_id` is a raw string, not a ForeignKey.
- **Privacy:** No server-side check prevents a user from joining any room string.
- **UI:** Basic dashboard, no specific UI for managing groups/members.

## 1. Database Schema Changes (SQL Optimization)
We need to move to a relational room model to enforce privacy and support features.

### New Tables / Updates
1.  **`RoomMember`** (New Table)
    *   `room_id` (FK to Room.id)
    *   `user_id` (FK to User.id)
    *   `role` (Enum: 'admin', 'member')
    *   `last_read_at` (DateTime)
    *   **Composite PK:** `(room_id, user_id)`

2.  **`Message` Update**
    *   `room_id` should ideally be consistent. Currently `String`. We can keep it `String` (UUID) but enforce FK or logical integrity.

3.  **`Room` Update**
    *   Ensure all rooms (DMs and Groups) are actually created in this table.

## 2. API Strategy (Optimization)
-   **Strict Privacy:** WebSocket connection to a room ID *must* verify `RoomMember` existence.
-   **Endpoints:**
    *   `POST /api/rooms/dm`: Check if DM exists between 2 users; if not, create new Room (type='dm') and add both as members. Return room_id.
    *   `POST /api/rooms/group`: Create Room (type='group'), add creator as admin.
    *   `GET /api/rooms`: List rooms the user is a member of.

## 3. UI/UX Revamp ("Professional & Dynamic")
-   **Layout:**
    *   **Left Sidebar:** "Teams/Workspaces" style. List "Direct Messages" and "Groups" separately.
    *   **User Management:** Right sidebar or Modal for managing group members.
    *   **Visual Style:** Slate/Gray scaling, subtle borders, high contrast text.
-   **Features:**
    *   Dynamic Group Creation Modal.
    *   User Search for DMs.

## Implementation Steps

### Phase 1: Backend Foundation
1.  **Update Models:** Add `RoomMember`, update `Room`.
2.  **Migration:** We will drop tables (dev environment) to apply new schema cleanest.
3.  **API Logic:** Implement `room_router.py` for creating/fetching rooms.
4.  **WebSocket:** Update `join_room` to check DB permissions.

### Phase 2: Frontend "Professional" Revamp
1.  **Refactor Dashboard:** Split into `Sidebar`, `ChatArea`, `UserList`.
2.  **State Management:** Fetch actual Room list instead of hardcoded strings.
3.  **Styling:** Apply "SaaS" aesthetic.
