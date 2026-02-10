from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from datetime import datetime, timezone
from typing import Optional, List
import enum

class RoomType(str, enum.Enum):
    DIRECT = "direct"
    GROUP = "group"

# Auth Schemas
class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6)
    display_name: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

# User Schemas
class UserBase(BaseModel):
    username: str
    email: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    theme_preference: str = "dark"

class UserResponse(UserBase):
    id: str
    is_active: bool
    created_at: datetime
    last_seen: datetime
    
    model_config = ConfigDict(from_attributes=True)

    @field_validator("created_at", "last_seen", check_fields=False)
    def force_utc(cls, v):
        if v and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

class UserProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    theme_preference: Optional[str] = None

# Room Schemas
class RoomMemberResponse(BaseModel):
    user_id: str
    role: str
    joined_at: datetime
    user: UserResponse
    
    model_config = ConfigDict(from_attributes=True)

    @field_validator("joined_at", check_fields=False)
    def force_utc(cls, v):
        if v and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

class RoomCreate(BaseModel):
    name: Optional[str] = None
    type: RoomType = RoomType.DIRECT
    member_ids: List[str] = [] # Initial members

class RoomResponse(BaseModel):
    id: str
    name: Optional[str] = None
    type: RoomType
    created_at: datetime
    created_by: Optional[str] = None
    members: List[RoomMemberResponse] = []
    
    model_config = ConfigDict(from_attributes=True)

    @field_validator("created_at", check_fields=False)
    def force_utc(cls, v):
        if v and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

# File Schemas
class FileAttachmentResponse(BaseModel):
    id: str
    filename: str
    file_path: str
    file_size: int
    content_type: str
    uploaded_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

    @field_validator("uploaded_at", check_fields=False)
    def force_utc(cls, v):
        if v and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

# Message Schemas
class MessageCreate(BaseModel):
    content: Optional[str] = None
    room_id: str
    message_type: str = "text"
    file_id: Optional[str] = None # If attaching a file

class MessageUpdate(BaseModel):
    content: str

class MessageResponse(BaseModel):
    id: str
    content: Optional[str] = None
    sender_id: str
    room_id: str
    message_type: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool
    is_edited: bool
    attachments: List[FileAttachmentResponse] = []
    read_receipts: List["ReadReceiptResponse"] = []
    
    model_config = ConfigDict(from_attributes=True)

    @field_validator("created_at", "updated_at", check_fields=False)
    def force_utc(cls, v):
        if v and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

class MessageWithSender(MessageResponse):
    sender: UserResponse

# Read Receipt Schemas
class ReadReceiptCreate(BaseModel):
    message_id: str

class ReadReceiptResponse(BaseModel):
    id: str
    message_id: str
    user_id: str
    read_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

    @field_validator("read_at", check_fields=False)
    def force_utc(cls, v):
        if v and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

# Sync Schemas
class SyncMessage(BaseModel):
    content: Optional[str]
    room_id: str
    message_type: str = "text"
    client_timestamp: datetime
    temp_id: str

class SyncRequest(BaseModel):
    messages: List[SyncMessage]
    last_sync_time: Optional[datetime] = None

class SyncResponse(BaseModel):
    synced_messages: List[MessageResponse]
    new_messages: List[MessageWithSender]

# Friend Schemas
class FriendRequestStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"

class FriendRequestCreate(BaseModel):
    receiver_id: str

class FriendRequestResponse(BaseModel):
    id: str
    sender_id: str
    receiver_id: str
    status: FriendRequestStatus
    created_at: datetime
    
    sender: Optional[UserResponse] = None
    receiver: Optional[UserResponse] = None
    
    model_config = ConfigDict(from_attributes=True)

    @field_validator("created_at", check_fields=False)
    def force_utc(cls, v):
        if v and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

class FriendResponse(UserResponse):
    friendship_status: Optional[str] = None # 'friend', 'pending_sent', 'pending_received', 'none'
