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
        # Check for duplicates (Idempotency) based on content, room, sender, and exact timestamp
        # This prevents double-insertion if client retries or had local double-write issues
        existing_msg = db.query(Message).filter(
            Message.sender_id == current_user.id,
            Message.room_id == msg.room_id,
            Message.content == msg.content,
            Message.created_at == msg.client_timestamp
        ).first()

        if existing_msg:
            synced_messages.append(existing_msg)
            continue

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
    # Get new messages since last sync
    new_messages = []
    
    # Get all rooms user is a member of
    # We must join RoomMember to find which rooms the user belongs to
    from models import RoomMember
    user_rooms = db.query(RoomMember.room_id).filter(
        RoomMember.user_id == current_user.id
    ).all()
    room_ids = [r[0] for r in user_rooms]
    
    if room_ids:
        query = db.query(Message).filter(Message.room_id.in_(room_ids))
        
        if sync_data.last_sync_time:
            # Normal sync: Get everything since last check
            query = query.filter(Message.created_at > sync_data.last_sync_time)
            query = query.filter(Message.sender_id != current_user.id) # Don't return own messages (unless we want to verify sync?)
            # Actually, for multi-device, we DO want own messages that were sent from other devices.
            # But sticking to previous logic for now to avoid duplicates if handling isn't robust.
            # Let's include everything > time. The frontend handles deduping via DB constraints usually.
        else:
            # Initial sync: Get last 50 messages per room or just last 100 global?
            # Global last 500 for now to populate dashboard
            query = query.order_by(Message.created_at.desc()).limit(500)
            
        messages = query.order_by(Message.created_at.asc()).all()
        new_messages = messages
    
    # Fix timezones for serialization (pydantic will use these)
    from datetime import timezone
    
    for msg in synced_messages:
        if msg.created_at and msg.created_at.tzinfo is None:
            msg.created_at = msg.created_at.replace(tzinfo=timezone.utc)
        if msg.updated_at and msg.updated_at.tzinfo is None:
            msg.updated_at = msg.updated_at.replace(tzinfo=timezone.utc)
            
    for msg in new_messages:
        if msg.created_at and msg.created_at.tzinfo is None:
            msg.created_at = msg.created_at.replace(tzinfo=timezone.utc)
        if msg.updated_at and msg.updated_at.tzinfo is None:
            msg.updated_at = msg.updated_at.replace(tzinfo=timezone.utc)
    
    return SyncResponse(
        synced_messages=synced_messages,
        new_messages=new_messages
    )
