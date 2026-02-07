from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List

from database import get_db
from models import User, Room, RoomMember, RoomType
from schemas import RoomCreate, RoomResponse, UserResponse
from auth import get_current_user

router = APIRouter(prefix="/rooms", tags=["rooms"])

@router.post("/dm", response_model=RoomResponse)
async def create_dm_room(
    target_user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Check if target user exists
    target_user = db.query(User).filter(User.id == target_user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if DM already exists
    # Complex query: Find a room of type DIRECT where both users are members
    # Optimization: For now, just create a new one if logic is complex, but ideally we check.
    # Logic: 
    # 1. Get Room IDs where current_user is member
    # 2. Get Room IDs where target_user is member
    # 3. Intersect + Filter by type=DIRECT
    
    my_rooms = db.query(RoomMember.room_id).filter(RoomMember.user_id == current_user.id).subquery()
    target_rooms = db.query(RoomMember.room_id).filter(RoomMember.user_id == target_user_id).subquery()
    
    existing_dm = db.query(Room).filter(
        Room.type == RoomType.DIRECT,
        Room.id.in_(my_rooms),
        Room.id.in_(target_rooms)
    ).first()
    
    if existing_dm:
        return existing_dm

    # Create new DM Room
    new_room = Room(type=RoomType.DIRECT, created_by=current_user.id)
    db.add(new_room)
    db.commit()
    db.refresh(new_room)
    
    # Add members
    member1 = RoomMember(room_id=new_room.id, user_id=current_user.id, role="admin")
    member2 = RoomMember(room_id=new_room.id, user_id=target_user_id, role="member")
    db.add_all([member1, member2])
    db.commit()
    db.refresh(new_room)
    
    return new_room

@router.post("/group", response_model=RoomResponse)
async def create_group_room(
    room_data: RoomCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    new_room = Room(
        name=room_data.name,
        type=RoomType.GROUP,
        created_by=current_user.id
    )
    db.add(new_room)
    db.commit()
    db.refresh(new_room)
    
    # Add creator as admin
    admin_member = RoomMember(room_id=new_room.id, user_id=current_user.id, role="admin")
    db.add(admin_member)
    
    # Add other members
    for uid in room_data.member_ids:
        if uid != current_user.id:
            # check existence?
            member = RoomMember(room_id=new_room.id, user_id=uid, role="member")
            db.add(member)
            
    db.commit()
    db.refresh(new_room)
    return new_room

@router.get("/", response_model=List[RoomResponse])
async def get_my_rooms(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Eager load members and their user info for display
    rooms = db.query(Room).join(RoomMember).filter(
        RoomMember.user_id == current_user.id
    ).options(
        joinedload(Room.members).joinedload(RoomMember.user)
    ).all()
    
    return rooms

@router.get("/{room_id}", response_model=RoomResponse)
async def get_room_details(
    room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    room = db.query(Room).options(
        joinedload(Room.members).joinedload(RoomMember.user)
    ).filter(Room.id == room_id).first()
    
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
        
    # Check if user is member
    is_member = any(m.user_id == current_user.id for m in room.members)
    if not is_member:
        raise HTTPException(status_code=403, detail="Not a member of this room")
        
    return room
