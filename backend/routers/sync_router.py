from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from database import get_db
from models import Message, User
from schemas import SyncRequest, SyncResponse, MessageResponse, MessageWithSender
from auth import get_current_user

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
    
    # Process and save offline messages from client
    for msg in sync_data.messages:
        new_message = Message(
            content=msg.content,
            sender_id=current_user.id,
            room_id=msg.room_id,
            message_type=msg.message_type,
            created_at=msg.client_timestamp
        )
        db.add(new_message)
        db.flush()  # Get ID without committing
        synced_messages.append(new_message)
    
    db.commit()
    
    # Get new messages since last sync
    new_messages = []
    if sync_data.last_sync_time:
        # Get all messages newer than last sync (across all rooms user has access to)
        # For simplicity, we'll get messages from rooms the user has sent messages in
        user_rooms = db.query(Message.room_id).filter(
            Message.sender_id == current_user.id
        ).distinct().all()
        room_ids = [room[0] for room in user_rooms]
        
        if room_ids:
            messages = db.query(Message).filter(
                Message.room_id.in_(room_ids),
                Message.created_at > sync_data.last_sync_time,
                Message.sender_id != current_user.id  # Don't return own messages
            ).order_by(Message.created_at.asc()).all()
            
            new_messages = messages
    
    return SyncResponse(
        synced_messages=synced_messages,
        new_messages=new_messages
    )
