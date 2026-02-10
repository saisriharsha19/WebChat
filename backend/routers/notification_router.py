from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from database import get_db
from models import User, PushSubscription
from auth import get_current_user
from utils.push_service import send_push_notification

router = APIRouter(prefix="/notifications", tags=["notifications"])

class SubscriptionCreate(BaseModel):
    endpoint: str
    keys: dict

@router.post("/subscribe", status_code=status.HTTP_201_CREATED)
async def subscribe(subscription: SubscriptionCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Check if subscription already exists
    existing_sub = db.query(PushSubscription).filter(PushSubscription.endpoint == subscription.endpoint).first()
    
    if existing_sub:
        # Update if user changed (unlikely but possible if logged out/in)
        if existing_sub.user_id != current_user.id:
             existing_sub.user_id = current_user.id
             db.commit()
        return {"message": "Subscription updated"}

    new_sub = PushSubscription(
        user_id=current_user.id,
        endpoint=subscription.endpoint,
        p256dh=subscription.keys["p256dh"],
        auth=subscription.keys["auth"]
    )
    
    db.add(new_sub)
    db.commit()
    return {"message": "Subscribed successfully"}

@router.api_route("/test", methods=["GET", "POST"])
async def test_notification(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    send_push_notification(
        db, 
        current_user.id, 
        "Test Notification", 
        "This is a test notification from Entropy!",
        "/"
    )
    return {"message": "Test notification sent"}

import os

@router.get("/vapid-public-key")
async def get_vapid_public_key():
    public_key = os.getenv("VAPID_PUBLIC_KEY")
    if not public_key:
        raise HTTPException(status_code=500, detail="VAPID_PUBLIC_KEY not configured on server")
    return {"public_key": public_key}
