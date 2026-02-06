from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import User, Message, ReadReceipt
from schemas import (
    UserResponse,
    UserProfileUpdate,
    MessageResponse,
    MessageWithSender,
    ReadReceiptCreate,
    ReadReceiptResponse
)
from auth import get_current_user

router = APIRouter(prefix="/api", tags=["api"])

# User endpoints
@router.get("/users/me", response_model=UserResponse)
async def get_current_user_profile(current_user: User = Depends(get_current_user)):
    return current_user

@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.get("/users", response_model=List[UserResponse])
async def get_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=100),
    search: str = Query(None, min_length=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(User)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (User.username.ilike(search_term)) | 
            (User.display_name.ilike(search_term))
        )
    
    users = query.offset(skip).limit(limit).all()
    return users

@router.put("/users/me/profile", response_model=UserResponse)
async def update_profile(
    profile_data: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if profile_data.display_name is not None:
        current_user.display_name = profile_data.display_name
    if profile_data.avatar_url is not None:
        current_user.avatar_url = profile_data.avatar_url
    if profile_data.bio is not None:
        current_user.bio = profile_data.bio
    if profile_data.theme_preference is not None:
        current_user.theme_preference = profile_data.theme_preference
    
    db.commit()
    db.refresh(current_user)
    return current_user

# Message endpoints
@router.get("/messages", response_model=List[MessageWithSender])
async def get_messages(
    room_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    messages = db.query(Message).filter(
        Message.room_id == room_id,
        Message.is_deleted == False
    ).order_by(Message.created_at.desc()).offset(skip).limit(limit).all()
    
    return messages

@router.get("/messages/{message_id}/read-receipts", response_model=List[ReadReceiptResponse])
async def get_message_read_receipts(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    receipts = db.query(ReadReceipt).filter(ReadReceipt.message_id == message_id).all()
    return receipts

@router.post("/messages/{message_id}/read", response_model=ReadReceiptResponse)
async def mark_message_read(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Check if already read
    existing = db.query(ReadReceipt).filter(
        ReadReceipt.message_id == message_id,
        ReadReceipt.user_id == current_user.id
    ).first()
    
    if existing:
        return existing
    
    # Create new read receipt
    receipt = ReadReceipt(message_id=message_id, user_id=current_user.id)
    db.add(receipt)
    db.commit()
    db.refresh(receipt)
    
    return receipt
