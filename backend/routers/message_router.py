from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional

from database import get_db
from models import User, Message, RoomMember
from schemas import MessageCreate, MessageResponse, MessageUpdate
from auth import get_current_user

# Note: We need to broadcast updates. Circular dependency with websocket_router?
# Only one router can own the websocket manager usually. 
# We'll import the manager from websocket_router (if it's global) or use an event bus.
# For simplicity, we'll assume we can import 'manager' from websocket_router
from routers.websocket_router import manager

router = APIRouter(prefix="/messages", tags=["messages"])

@router.put("/{message_id}", response_model=MessageResponse)
async def edit_message(
    message_id: int,
    message_update: MessageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
        
    # Check ownership
    if message.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this message")
        
    # Check time limit (2 hours)
    if datetime.utcnow() - message.created_at > timedelta(hours=2):
        raise HTTPException(status_code=400, detail="Message cannot be edited after 2 hours")

    # Update
    message.content = message_update.content
    message.is_edited = True
    message.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(message)
    
    # Broadcast update
    update_payload = {
        "type": "message_updated",
        "message": {
             "id": message.id,
             "content": message.content,
             "room_id": message.room_id,
             "is_edited": True,
             "updated_at": message.updated_at.isoformat()
        }
    }
    
    # Fire and forget broadcast
    # We need to await this, but we are in async path so it's fine.
    await manager.broadcast_to_room(message.room_id, update_payload)
    
    return message
