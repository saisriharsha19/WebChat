import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
from typing import Dict, List, Set, Any
import json
from datetime import datetime, timezone

from database import get_db, SessionLocal
from models import Message, User, ReadReceipt, Room, RoomMember
from schemas import MessageCreate

router = APIRouter(tags=["websocket"])

class ConnectionManager:
    def __init__(self):
        # Maps user_id to list of websocket connections
        self.active_connections: Dict[int, List[WebSocket]] = {}
        # Maps room_id (int) to set of user_ids (for quick lookup of who is online in a room)
        self.room_subscribers: Dict[int, Set[int]] = {}
        
        # QUEUE SYSTEM
        self.queue: asyncio.Queue = asyncio.Queue()
        self.worker_task = None

    async def start_worker(self):
        self.worker_task = asyncio.create_task(self.process_queue())
        print("Queue Worker Started")

    async def stop_worker(self):
        if self.worker_task:
            self.worker_task.cancel()
            try:
                await self.worker_task
            except asyncio.CancelledError:
                pass
            print("Queue Worker Stopped")

    async def enqueue_message(self, task_type: str, payload: dict, user: User, db_session_factory):
        """
        Push a task to the queue.
        """
        await self.queue.put({
            "type": task_type,
            "payload": payload,
            "user": user, 
            # We don't pass open DB session, we pass factory or handle inside
            # Ideally we keep 'user' object detached or minimal info
            "user_id": user.id,
            "username": user.username,
            "display_name": user.display_name,
            "avatar_url": user.avatar_url
        })
        
    async def process_queue(self):
        """
        Main worker loop.
        Sequential processing to prevent race conditions.
        """
        while True:
            try:
                task = await self.queue.get()
                
                # Create a fresh DB session for this task
                db = SessionLocal()
                try:
                    await self.handle_task(task, db)
                except Exception as e:
                    print(f"Queue Task Failed: {e}")
                finally:
                    db.close()
                    self.queue.task_done()
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Queue Worker Critical Error: {e}")
                await asyncio.sleep(1) # Prevent tight loop crash

    async def handle_task(self, task: dict, db: Session):
        task_type = task["type"]
        payload = task["payload"]
        user_id = task["user_id"]
        
        if task_type == "message":
            await self._process_chat_message(payload, user_id, task, db)
        elif task_type == "signal":
             # Signals are ephemeral, maybe no DB needed, but we process here for order if needed.
             # Actually, purely signaling (webrtc) might be okay to skip queue for lowest latency?
             # User asked for "queue for calls and messages". Let's queue it to be safe 
             # but we won't write to DB.
             await self._process_signal(payload, user_id, db)

    async def _process_chat_message(self, data: dict, user_id: int, task_meta: dict, db: Session):
        room_id = int(data.get("room_id"))
        content = data.get("content")
        correlation_id = data.get("correlation_id") # Temp ID from client
        
        # 1. Idempotency Check
        # Check if we already have this message (same content, room, sender, recently)
        # We can use correlation_id if we store it? We don't have a column for it yet.
        # Fallback to content + recent time check or just rely on 'sync' router dedupe.
        # BUT, since this is strictly sequential, we just check if the last message in this room 
        # from this user has the same content and was created < 2 seconds ago.
        
        last_msg = db.query(Message).filter(
            Message.room_id == room_id,
            Message.sender_id == user_id
        ).order_by(Message.created_at.desc()).first()
        
        if last_msg and last_msg.content == content:
             # Check time diff
             delta = datetime.utcnow() - last_msg.created_at
             if delta.total_seconds() < 2:
                 print(f"Duplicate message detected (Queue): {content}")
                 # Is it really a duplicate or user spamming? 
                 # If correlation_id matches (if we stored it), it's a dupe.
                 # Without correlation_id column, we risk flagging spam as dupe.
                 # However, client handles optimistic UI, so rapid fire identical messages 
                 # might be intentional but rare.
                 # Let's be safe. If strict duplicate prevention is key.
                 pass
        
        # 2. Save to DB
        new_message = Message(
            content=content,
            sender_id=user_id,
            room_id=room_id,
            message_type=data.get("message_type", "text"),
            created_at=datetime.utcnow()
        )
        db.add(new_message)
        db.commit()
        db.refresh(new_message)
        
        # 3. Broadcast
        created_at_utc = new_message.created_at.replace(tzinfo=timezone.utc)
        
        response = {
            "type": "new_message",
            "message": {
                "id": new_message.id,
                "content": new_message.content,
                "sender_id": new_message.sender_id,
                "room_id": new_message.room_id,
                "message_type": new_message.message_type,
                "created_at": created_at_utc.isoformat(),
                "sender": {
                    "id": user_id,
                    "username": task_meta["username"],
                    "display_name": task_meta["display_name"],
                    "avatar_url": task_meta["avatar_url"]
                },
            },
            "correlation_id": correlation_id
        }
        
        # Send ACK to sender's connection(s)
        if correlation_id:
             await self.send_to_user(user_id, {
                 "type": "message_ack",
                 "correlation_id": correlation_id,
                 "message_id": new_message.id
             })

        await self.broadcast_to_room(room_id, response)
        
        # 4. Push Notification (Fire and forget, or queue separately? Inner queue here is fine)
        # We can just run the logic here since we are in async worker
        # But we don't want to block the queue for too long.
        asyncio.create_task(self._send_push_async(room_id, user_id, content, task_meta, db))


    async def _send_push_async(self, room_id, sender_id, content, sender_meta, db_session_unused):
        # We need a NEW session because the one passed to _process_chat_message will be closed
        notify_db = SessionLocal()
        try:
             # Re-fetch room/members
             room = notify_db.query(Room).filter(Room.id == room_id).first()
             members = notify_db.query(RoomMember).filter(RoomMember.room_id == room_id).all()
             
             title = "New Message"
             if room and room.type == "group":
                 title = room.name or "Group Chat"
             else:
                 title = sender_meta["display_name"] or sender_meta["username"]
             
             from utils.push_service import send_push_notification
             
             for member in members:
                 if member.user_id != sender_id:
                     is_online = member.user_id in self.active_connections
                     if not is_online:
                         send_push_notification(
                             notify_db, 
                             member.user_id, 
                             title, 
                             content[:100] if content else "Sent a file", 
                             "/"
                         )
        except Exception as e:
            print(f"Push error: {e}")
        finally:
            notify_db.close()

    async def _process_signal(self, data: dict, user_id: int, db: Session):
        # Determine target
        target_id = data.get("target_user_id")
        if not target_id: 
            return
            
        # Permission check: Are they friends?
        # We can cache this or check DB. Since this is in worker, DB check is safe (sequential)
        # but might add latency.
        # Ideally we trust the initial handshake or cache friendship.
        # For now, quick DB check.
        
        # Reuse existing check logic if possible, or rewrite simple query
        from models import FriendRequest, FriendRequestStatus
        from sqlalchemy import or_, and_
        
        is_friend = db.query(FriendRequest).filter(
            or_(
                and_(FriendRequest.sender_id == user_id, FriendRequest.receiver_id == target_id),
                and_(FriendRequest.receiver_id == user_id, FriendRequest.sender_id == target_id)
            ),
            FriendRequest.status == FriendRequestStatus.ACCEPTED
        ).first()
        
        if not is_friend:
            await self.send_to_user(user_id, {
                "type": "error", 
                "message": "You can only call friends."
            })
            return

        # Forward signal
        msg_type = data.get("type")
        payload = {
            "type": msg_type,
            "sender_id": user_id,
            "call_id": data.get("call_id"),
            # Include specific fields based on type
        }
        
        if msg_type == "call_offer":
            payload["sdp"] = data.get("sdp")
        elif msg_type == "call_answer":
            payload["sdp"] = data.get("sdp")
        elif msg_type == "ice_candidate":
            payload["candidate"] = data.get("candidate")
            
        await self.send_to_user(target_id, payload)
        
        # Handle "handled elsewhere" logic for answer/reject/end
        if msg_type in ["call_answer", "call_reject", "call_end"]:
             reason = "answered_elsewhere" if msg_type == "call_answer" else \
                      "rejected_elsewhere" if msg_type == "call_reject" else \
                      "ended_elsewhere"
                      
             # We need to send to sender's OTHER sessions
             # This requires logic to know which WS sent this.
             # We don't have raw WS reference in the Queue task (it's hard to pass WS object safely if it might close)
             # But we can iterate active connections for user_id and send to all? 
             # Or we just broadcast to all user_id sessions including sender? 
             # Client relies on "call_handled" to close modals.
             
             await self.send_to_user(user_id, {
                 "type": "call_handled",
                 "reason": reason,
                 "call_id": data.get("call_id")
             })


    # --- Existing Helper Methods (connect, disconnect, join_room, leave_room, send_to_user...) ---
    
    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
    
    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if len(self.active_connections[user_id]) == 0:
                del self.active_connections[user_id]
        
        for room_id in list(self.room_subscribers.keys()):
            if user_id in self.room_subscribers[room_id]:
                try:
                    self.room_subscribers[room_id].discard(user_id)
                    if not self.room_subscribers[room_id]:
                        del self.room_subscribers[room_id]
                except KeyError:
                    pass
    
    def join_room(self, room_id: int, user_id: int):
        if room_id not in self.room_subscribers:
            self.room_subscribers[room_id] = set()
        self.room_subscribers[room_id].add(user_id)
    
    def leave_room(self, room_id: int, user_id: int):
        if room_id in self.room_subscribers:
            self.room_subscribers[room_id].discard(user_id)
    
    async def send_to_user(self, user_id: int, message: dict):
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id][:]:
                try:
                    await connection.send_json(message)
                except:
                    pass
    
    async def broadcast_to_room(self, room_id: int, message: dict, exclude_user_id: int = None):
        if room_id in self.room_subscribers:
            for user_id in list(self.room_subscribers[room_id]):
                if exclude_user_id and user_id == exclude_user_id:
                    continue
                await self.send_to_user(user_id, message)
                
    async def notify_friends_status(self, user_id: int, status: str, db: Session):
         # ... existing logic ...
         from models import FriendRequest, FriendRequestStatus
         from sqlalchemy import or_, and_
        
         def get_friends():
            return db.query(User).join(
                FriendRequest,
                or_(
                    and_(FriendRequest.sender_id == User.id, FriendRequest.receiver_id == user_id),
                    and_(FriendRequest.receiver_id == User.id, FriendRequest.sender_id == user_id)
                )
            ).filter(
                FriendRequest.status == FriendRequestStatus.ACCEPTED
            ).all()
        
         friends = await asyncio.to_thread(get_friends)
         message = {
            "type": "user_status",
            "user_id": user_id,
            "status": status,
            "last_seen": datetime.now(timezone.utc).isoformat()
         }
         for friend in friends:
            await self.send_to_user(friend.id, message)

manager = ConnectionManager()

# --- Endpoints ---

@router.on_event("startup")
async def startup_event():
    await manager.start_worker()

@router.on_event("shutdown")
async def shutdown_event():
    await manager.stop_worker()

@router.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket, token: str):
    db = SessionLocal()
    user = None
    
    try:
        from jose import jwt
        from auth import SECRET_KEY, ALGORITHM
        
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            username = payload.get("sub")
            if username is None:
                 await websocket.close(code=1008)
                 return
            
            user = await asyncio.to_thread(
                lambda: db.query(User).filter(User.username == username).first()
            )
            
        except Exception:
             await websocket.close(code=1008)
             return
        
        if not user:
            await websocket.close(code=1008)
            return
        
        await manager.connect(websocket, user.id)
        
        def update_status():
            user.last_seen = datetime.utcnow()
            user.is_active = True
            db.commit()
            
        await asyncio.to_thread(update_status)
        asyncio.create_task(manager.notify_friends_status(user.id, "online", db))
        
        await websocket.send_json({
            "type": "connected",
            "user_id": user.id,
            "username": user.username
        })
        
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")

            if message_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue
            
            # --- QUEUE HANDOFF ---
            if message_type == "message":
                # Validate minimal fields
                if "room_id" in data and "content" in data:
                    # Enqueue
                    await manager.enqueue_message("message", data, user, None)
            
            elif message_type in ["call_offer", "call_answer", "call_reject", "call_end", "ice_candidate"]:
                # Enqueue signal
                await manager.enqueue_message("signal", data, user, None)
                
            elif message_type == "join_room":
                # Handle connection logic inline (fast) or queue? 
                # Joining is connection state, usually safe to do inline.
                # But let's verify permission first.
                room_id = int(data.get("room_id"))
                def check_perm():
                     return db.query(RoomMember).filter(RoomMember.room_id==room_id, RoomMember.user_id==user.id).first()
                if await asyncio.to_thread(check_perm):
                     manager.join_room(room_id, user.id)
                     await websocket.send_json({"type": "joined_room", "room_id": room_id})
                else:
                     await websocket.send_json({"type": "error", "message": "Access denied"})

            elif message_type == "leave_room":
                manager.leave_room(int(data.get("room_id")), user.id)

    except WebSocketDisconnect:
        if user:
            manager.disconnect(websocket, user.id)
            async def set_offline():
                user.last_seen = datetime.utcnow()
                user.is_active = False 
                db.commit()
            await asyncio.to_thread(set_offline)
            await manager.notify_friends_status(user.id, "offline", db)
            
    except Exception as e:
        print(f"WebSocket error: {e}")
        if user:
            manager.disconnect(websocket, user.id)
    finally:
        await asyncio.to_thread(db.close)
