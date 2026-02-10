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
    
    logger.info(f"Sync request from user {current_user.id} ({current_user.username})")
    if sync_data.last_sync_time:
        logger.info(f"Client last_sync_time: {sync_data.last_sync_time}")

    # Process and save offline messages from client
    for msg in sync_data.messages:
        # Check for duplicates (Idempotency) based on content, room, sender, and exact timestamp
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
    logger.info(f"Processed {len(sync_data.messages)} offline messages. Synced: {len(synced_messages)}")
    
    # Get new messages since last sync
    new_messages = []
    
    # Get all rooms user is a member of
    user_rooms = db.query(RoomMember.room_id).filter(
        RoomMember.user_id == current_user.id
    ).all()
    room_ids = [r[0] for r in user_rooms]
    
    if room_ids:
        query = db.query(Message).filter(Message.room_id.in_(room_ids))
        
        if sync_data.last_sync_time:
            # IMPORTANT: Ensure last_sync_time is naive UTC if DB uses naive UTC
            last_sync = sync_data.last_sync_time
            if last_sync.tzinfo is not None:
                # Convert to UTC and then make naive
                last_sync = last_sync.astimezone(timezone.utc).replace(tzinfo=None)
            
            logger.info(f"Querying messages since: {last_sync}")
            
            # Normal sync: Get everything since last check
            query = query.filter(Message.created_at > last_sync)
            
            # Note: We DO want own messages if they were sent from another device, 
            # but currently we don't distinguish device IDs. 
            # For now, excluding own messages to prevent echoing back what we just sent/synced.
            query = query.filter(Message.sender_id != current_user.id)
            
            messages = query.order_by(Message.created_at.asc()).all()
        else:
            # Initial sync: Get last 1000 global for dashboard population
            # We want the *latest* 1000, so we order desc, limit, then reverse list
            messages = query.order_by(Message.created_at.desc()).limit(1000).all()
            messages.reverse() # Make them chronological
            
        new_messages = messages
        logger.info(f"Found {len(new_messages)} new messages for client")
    
    # Fix timezones for serialization (pydantic will use these)
    # Ensure all return dates are timezone-aware (UTC)
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
