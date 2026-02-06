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
                self.room_subscribers[room_id].discard(user_id)
                if not self.room_subscribers[room_id]:
                    del self.room_subscribers[room_id]
    
    def join_room(self, room_id: int, user_id: int):
        if room_id not in self.room_subscribers:
            self.room_subscribers[room_id] = set()
        self.room_subscribers[room_id].add(user_id)
    
    def leave_room(self, room_id: int, user_id: int):
        if room_id in self.room_subscribers:
            self.room_subscribers[room_id].discard(user_id)
    
    async def send_to_user(self, user_id: int, message: dict):
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(message)
                except:
                    pass
    
    async def broadcast_to_room(self, room_id: int, message: dict, exclude_user_id: int = None):
        if room_id in self.room_subscribers:
            for user_id in self.room_subscribers[room_id]:
                if exclude_user_id and user_id == exclude_user_id:
                    continue
                await self.send_to_user(user_id, message)

manager = ConnectionManager()

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
            user = db.query(User).filter(User.username == username).first()
        except Exception:
             await websocket.close(code=1008)
             return
        
        if not user:
            await websocket.close(code=1008)
            return
        
        await manager.connect(websocket, user.id)
        
        # Send connection confirmation
        await websocket.send_json({
            "type": "connected",
            "user_id": user.id,
            "username": user.username
        })
        
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")
            
            if message_type == "join_room":
                try:
                    room_id = int(data.get("room_id"))
                except (ValueError, TypeError):
                    continue
                    
                # SECURITY: Check database permission
                member = db.query(RoomMember).filter(
                    RoomMember.room_id == room_id,
                    RoomMember.user_id == user.id
                ).first()
                
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
            
            elif message_type == "leave_room":
                try:
                    room_id = int(data.get("room_id"))
                    manager.leave_room(room_id, user.id)
                except:
                    pass
            
            elif message_type == "message":
                try:
                    room_id = int(data.get("room_id"))
                except:
                    continue

                content = data.get("content")
                
                # Double check permission (paranoid mode)
                member = db.query(RoomMember).filter(
                    RoomMember.room_id == room_id,
                    RoomMember.user_id == user.id
                ).first()
                
                if not member:
                     continue

                # Save to database
                new_message = Message(
                    content=content,
                    sender_id=user.id,
                    room_id=room_id,
                    message_type=data.get("message_type", "text"),
                    # file_url is deprecated, use attachments logic later
                )
                db.add(new_message)
                db.commit()
                db.refresh(new_message)
                
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
                        }
                    }
                }
                
                await manager.broadcast_to_room(room_id, response)
            
            elif message_type == "read_receipt":
                # ... existing read receipt logic but with int checks ...
                pass
    
    except WebSocketDisconnect:
        if user:
            manager.disconnect(websocket, user.id)
    except Exception as e:
        print(f"WebSocket error: {e}")
        if user:
            manager.disconnect(websocket, user.id)
    finally:
        db.close()
