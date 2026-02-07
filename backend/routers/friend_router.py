from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from typing import List

from database import get_db
from models import User, FriendRequest, FriendRequestStatus
from schemas import FriendRequestResponse, FriendRequestCreate, UserResponse, FriendResponse
from auth import get_current_user

router = APIRouter(prefix="/api/friends", tags=["friends"])

@router.post("/request/{user_id}", response_model=FriendRequestResponse)
async def send_friend_request(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot add yourself as a friend")
    
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Check if request already exists
    existing_request = db.query(FriendRequest).filter(
        or_(
            and_(FriendRequest.sender_id == current_user.id, FriendRequest.receiver_id == user_id),
            and_(FriendRequest.sender_id == user_id, FriendRequest.receiver_id == current_user.id)
        ),
        FriendRequest.status != FriendRequestStatus.REJECTED # Allow re-sending if rejected? Maybe not for now.
    ).first()
    
    if existing_request:
        if existing_request.status == FriendRequestStatus.ACCEPTED:
            raise HTTPException(status_code=400, detail="Already friends")
        if existing_request.sender_id == current_user.id:
            raise HTTPException(status_code=400, detail="Friend request already sent")
        if existing_request.receiver_id == current_user.id:
            raise HTTPException(status_code=400, detail="This user already sent you a friend request. Accept it instead.")
            
    new_request = FriendRequest(
        sender_id=current_user.id,
        receiver_id=user_id,
        status=FriendRequestStatus.PENDING
    )
    db.add(new_request)
    db.commit()
    db.refresh(new_request)
    return new_request

@router.put("/request/{request_id}/{action}", response_model=FriendRequestResponse)
async def respond_to_friend_request(
    request_id: int,
    action: str, # accept, reject
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    request = db.query(FriendRequest).filter(FriendRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Friend request not found")
        
    if request.receiver_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your friend request")
        
    if request.status != FriendRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail="Request already processed")
        
    if action == "accept":
        request.status = FriendRequestStatus.ACCEPTED
    elif action == "reject":
        request.status = FriendRequestStatus.REJECTED
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
        
    db.commit()
    db.refresh(request)
    return request

@router.get("/", response_model=List[UserResponse])
async def list_friends(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Find all accepted requests where user is sender OR receiver
    friends_query = db.query(User).join(
        FriendRequest,
        or_(
            and_(FriendRequest.sender_id == User.id, FriendRequest.receiver_id == current_user.id),
            and_(FriendRequest.receiver_id == User.id, FriendRequest.sender_id == current_user.id)
        )
    ).filter(
        FriendRequest.status == FriendRequestStatus.ACCEPTED
    )
    
    return friends_query.all()

@router.get("/requests/received", response_model=List[FriendRequestResponse])
async def list_received_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    requests = db.query(FriendRequest).filter(
        FriendRequest.receiver_id == current_user.id,
        FriendRequest.status == FriendRequestStatus.PENDING
    ).all()
    # Eager load sender manually if needed, or rely on lazy loading (pydantic will trigger it)
    # Actually better to eager load
    # ... but with Pydantic from_attributes=True and ORM, it should work.
    return requests

@router.get("/requests/sent", response_model=List[FriendRequestResponse])
async def list_sent_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    requests = db.query(FriendRequest).filter(
        FriendRequest.sender_id == current_user.id,
        FriendRequest.status == FriendRequestStatus.PENDING
    ).all()
    return requests

@router.get("/search", response_model=List[FriendResponse])
async def search_users(
    query: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Search users by username or display name
    search_term = f"%{query}%"
    users = db.query(User).filter(
        (User.username.ilike(search_term)) | 
        (User.display_name.ilike(search_term)),
        User.id != current_user.id # Exclude self
    ).limit(20).all()
    
    # Determine friendship status for each
    results = []
    for user in users:
        status = "none"
        # Check if friend or pending
        rel = db.query(FriendRequest).filter(
            or_(
                and_(FriendRequest.sender_id == current_user.id, FriendRequest.receiver_id == user.id),
                and_(FriendRequest.sender_id == user.id, FriendRequest.receiver_id == current_user.id)
            )
        ).first()
        
        if rel:
            if rel.status == FriendRequestStatus.ACCEPTED:
                status = "friend"
            elif rel.status == FriendRequestStatus.PENDING:
                if rel.sender_id == current_user.id:
                    status = "pending_sent"
                else:
                    status = "pending_received"
        
        # Manually construct FriendResponse to include status
        user_dict = UserResponse.model_validate(user).model_dump()
        user_dict["friendship_status"] = status
        results.append(user_dict)
        
    return results
