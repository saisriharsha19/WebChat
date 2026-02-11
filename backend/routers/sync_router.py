from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone
import logging

from database import get_db
from models import Message, User, RoomMember
from schemas import SyncRequest, SyncResponse, MessageResponse, MessageWithSender
from auth import get_current_user

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["sync"])

@router.post("/sync", response_model=SyncResponse)
async def sync_messages(
    sync_data: SyncRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Sync offline messages from client to server and get new messages
    """
    synced_messages = []
    
    # 1. Process offline messages from client
    for msg in sync_data.messages:
        try:
            # Check if message already exists (duplicate prevention)
            existing = db.query(Message).filter(
                Message.sender_id == current_user.id,
                Message.room_id == msg.room_id,
                Message.content == msg.content
            ).order_by(Message.created_at.desc()).first()
            
            if existing:
                time_delta = datetime.now(timezone.utc) - existing.created_at.replace(tzinfo=timezone.utc)
                if time_delta.total_seconds() < 2:
                    # Likely duplicate, skip
                    synced_messages.append({
                        "temp_id": msg.temp_id,
                        "server_id": existing.id,
                        "status": "duplicate"
                    })
                    continue
            
            # Create new message
            new_message = Message(
                content=msg.content,
                sender_id=current_user.id,
                room_id=msg.room_id,
                message_type=msg.message_type,
                created_at=datetime.now(timezone.utc)
            )
            db.add(new_message)
            db.flush()
            
            synced_messages.append({
                "temp_id": msg.temp_id,
                "server_id": new_message.id,
                "status": "synced"
            })
            
            # Broadcast to room members via WebSocket
            from routers.websocket_router import manager
            await manager.broadcast_to_room(msg.room_id, {
                "type": "new_message",
                "message": {
                    "id": new_message.id,
                    "content": new_message.content,
                    "sender_id": new_message.sender_id,
                    "room_id": new_message.room_id,
                    "message_type": new_message.message_type,
                    "created_at": new_message.created_at.replace(tzinfo=timezone.utc).isoformat(),
                    "sender": {
                        "id": current_user.id,
                        "username": current_user.username,
                        "display_name": current_user.display_name,
                        "avatar_url": current_user.avatar_url
                    }
                }
            })
        except Exception as msg_error:
            logger.error(f"Error processing offline message: {msg_error}", exc_info=True)
            synced_messages.append({
                "temp_id": msg.temp_id,
                "status": "error",
                "error": str(msg_error)
            })
    
    db.commit()
    
    # 2. Get new messages since last sync  
    last_sync = None
    if sync_data.last_sync_time:
        last_sync = datetime.fromisoformat(sync_data.last_sync_time.replace('Z', '+00:00'))
    
    # Get user's rooms
    room_ids = [rm.room_id for rm in db.query(RoomMember).filter(RoomMember.user_id == current_user.id).all()]
    
    # Fetch new messages (reduced from 1000 to 100 to prevent timeouts)
    query = db.query(Message).filter(Message.room_id.in_(room_ids))
    if last_sync:
        query = query.filter(Message.created_at > last_sync)
    
    new_messages = query.order_by(Message.created_at.desc()).limit(100).all()
    
    messages_data = []
    for msg in new_messages:
        messages_data.append({
            "id": msg.id,
            "content": msg.content,
            "sender_id": msg.sender_id,
            "room_id": msg.room_id,
            "message_type": msg.message_type,
            "created_at": msg.created_at.replace(tzinfo=timezone.utc).isoformat(),
            "sender": {
                "id": msg.sender.id,
                "username": msg.sender.username,
                "display_name": msg.sender.display_name,
                "avatar_url": msg.sender.avatar_url
            } if msg.sender else None
        })
    
    return SyncResponse(
        synced_messages=synced_messages,
        new_messages=messages_data
    )
