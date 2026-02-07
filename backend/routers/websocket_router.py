import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
from typing import Dict, List, Set
import json
from datetime import datetime

from database import get_db, SessionLocal
from models import Message, User, ReadReceipt, Room, RoomMember
from schemas import MessageCreate

router = APIRouter(tags=["websocket"])

class ConnectionManager:
    def __init__(self):
        # Maps user_id to list of websocket connections
        self.active_connections: Dict[int, List[WebSocket]] = {}
        # Maps room_id (int) to set of user_ids (for quick lookup of who is online in a room)
        # Note: We rely on DB for permission check, this is just for broadcasting to *connected* users.
        self.room_subscribers: Dict[int, Set[int]] = {}
    
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
        
        # Cleanup room subscriptions
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
            # Send to all connections for this user (e.g. mobile + desktop)
            # Iterate over a copy to avoid modification during iteration
            for connection in self.active_connections[user_id][:]:
                try:
                    await connection.send_json(message)
                except:
                    pass
    
    async def send_personal_message(self, message: dict, user_id: int):
        # Alias for send_to_user
        await self.send_to_user(user_id, message)

    async def send_to_user_except(self, user_id: int, message: dict, exclude_ws: WebSocket):
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id][:]:
                if connection != exclude_ws:
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
        # Find friends
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
        
        # Run DB query in thread
        friends = await asyncio.to_thread(get_friends)
        
        message = {
            "type": "user_status",
            "user_id": user_id,
            "status": status, # "online", "offline"
            "last_seen": datetime.utcnow().isoformat()
        }
        
        for friend in friends:
            await self.send_to_user(friend.id, message)

manager = ConnectionManager()

# Helper for non-blocking DB save
def save_message_to_db(db: Session, content: str, sender_id: int, room_id: int, msg_type: str):
    new_message = Message(
        content=content,
        sender_id=sender_id,
        room_id=room_id,
        message_type=msg_type,
    )
    db.add(new_message)
    db.commit()
    db.refresh(new_message)
    return new_message

@router.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket, token: str):
    # Run DB creation in thread if it were expensive, but SessionLocal is cheap
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
            
            # Non-blocking user fetch
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
        
        # Update last seen and notify friends
        # Run in background to be instant
        def update_status():
            user.last_seen = datetime.utcnow()
            user.is_active = True
            db.commit()
            
        await asyncio.to_thread(update_status)
        asyncio.create_task(manager.notify_friends_status(user.id, "online", db))
        
        # Send connection confirmation
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
            
            if message_type == "join_room":
                try:
                    room_id = int(data.get("room_id"))
                    # SECURITY: Check database permission (Non-blocking)
                    def check_member():
                        return db.query(RoomMember).filter(
                            RoomMember.room_id == room_id,
                            RoomMember.user_id == user.id
                        ).first()
                    
                    member = await asyncio.to_thread(check_member)
                    
                    if member:
                        manager.join_room(room_id, user.id)
                        await websocket.send_json({
                            "type": "joined_room",
                            "room_id": room_id
                        })
                    else:
                        await websocket.send_json({
                            "type": "error",
                            "message": "Access denied to room"
                        })
                except (ValueError, TypeError):
                    continue
            
            elif message_type == "leave_room":
                try:
                    room_id = int(data.get("room_id"))
                    manager.leave_room(room_id, user.id)
                except:
                    pass
            
            elif message_type == "message":
                try:
                    room_id = int(data.get("room_id"))
                    # Double check permission
                    def check_member_msg():
                         return db.query(RoomMember).filter(
                             RoomMember.room_id == room_id,
                             RoomMember.user_id == user.id
                         ).first()
                    
                    member = await asyncio.to_thread(check_member_msg)
                    
                    if not member:
                         continue

                    content = data.get("content")
                    
                    # Offload DB save
                    new_message = await asyncio.to_thread(
                        save_message_to_db, 
                        db, content, user.id, room_id, data.get("message_type", "text")
                    )
                    
                    # Broadcast to room
                    response = {
                        "type": "new_message",
                        "message": {
                            "id": new_message.id,
                            "content": new_message.content,
                            "sender_id": new_message.sender_id,
                            "room_id": new_message.room_id,
                            "message_type": new_message.message_type,
                            "created_at": new_message.created_at.isoformat(),
                            "sender": {
                                "id": user.id,
                                "username": user.username,
                                "display_name": user.display_name,
                                "avatar_url": user.avatar_url
                            },
                        },
                        "correlation_id": data.get("correlation_id")
                    }
                    
                    # Send ACK if correlation_id is present
                    correlation_id = data.get("correlation_id")
                    if correlation_id:
                         await websocket.send_json({
                             "type": "message_ack",
                             "correlation_id": correlation_id,
                             "message_id": new_message.id
                         })
                    
                    await manager.broadcast_to_room(room_id, response)
                except Exception as e:
                    print(f"Error handling message: {e}")
                    continue
            
            elif message_type == "read_receipt":
                # ... existing read receipt logic ...
                pass

            # --- WebRTC Signaling ---
            elif message_type == "call_offer":
                target_id = data.get("target_user_id")
                await manager.send_personal_message({
                    "type": "call_offer",
                    "sender_id": user.id,
                    "sdp": data.get("sdp")
                }, target_id)
                
            elif message_type == "call_answer":
                target_id = data.get("target_user_id")
                await manager.send_personal_message({
                    "type": "call_answer",
                    "sender_id": user.id,
                    "sdp": data.get("sdp")
                }, target_id)
                
                # Notify other sessions of the answerer that they handled the call
                await manager.send_to_user_except(user.id, {
                    "type": "call_handled",
                    "reason": "answered_elsewhere"
                }, websocket)


            elif message_type == "call_reject":
                # User rejected the call
                target_id = data.get("target_user_id")
                # Notify caller
                await manager.send_personal_message({
                    "type": "call_rejected",
                    "sender_id": user.id
                }, target_id)

                # Notify other sessions of the rejecter
                await manager.send_to_user_except(user.id, {
                    "type": "call_handled",
                    "reason": "rejected_elsewhere"
                }, websocket)

            elif message_type == "ice_candidate":
                target_id = data.get("target_user_id")
                await manager.send_personal_message({
                    "type": "ice_candidate",
                    "sender_id": user.id,
                    "candidate": data.get("candidate")
                }, target_id)
    
    except WebSocketDisconnect:
        if user:
            manager.disconnect(websocket, user.id)
            
            async def set_offline():
                user.last_seen = datetime.utcnow()
                user.is_active = False # Mark as offline
                db.commit()
            
            await asyncio.to_thread(set_offline)
            await manager.notify_friends_status(user.id, "offline", db)
            
    except Exception as e:
        print(f"WebSocket error: {e}")
        if user:
            manager.disconnect(websocket, user.id)
    finally:
        # Wrap db.close() just in case, though usually fast
        await asyncio.to_thread(db.close)
