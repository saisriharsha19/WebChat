from pydantic import BaseModel, EmailStr, Field, ConfigDict
from datetime import datetime
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
    id: int
    is_active: bool
    created_at: datetime
    last_seen: datetime
    
    model_config = ConfigDict(from_attributes=True)

class UserProfileUpdate(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    theme_preference: Optional[str] = None

# Room Schemas
class RoomMemberResponse(BaseModel):
    user_id: int
    role: str
    joined_at: datetime
    user: UserResponse
    
    model_config = ConfigDict(from_attributes=True)

class RoomCreate(BaseModel):
    name: Optional[str] = None
    type: RoomType = RoomType.DIRECT
    member_ids: List[int] = [] # Initial members

class RoomResponse(BaseModel):
    id: int
    name: Optional[str] = None
    type: RoomType
    created_at: datetime
    created_by: Optional[int] = None
    members: List[RoomMemberResponse] = []
    
    model_config = ConfigDict(from_attributes=True)

# File Schemas
class FileAttachmentResponse(BaseModel):
    id: int
    filename: str
    file_path: str
    file_size: int
    content_type: str
    uploaded_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

# Message Schemas
class MessageCreate(BaseModel):
    content: Optional[str] = None
    room_id: int
    message_type: str = "text"
    file_id: Optional[int] = None # If attaching a file

class MessageUpdate(BaseModel):
    content: str

class MessageResponse(BaseModel):
    id: int
    content: Optional[str] = None
    sender_id: int
    room_id: int
    message_type: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool
    is_edited: bool
    attachments: List[FileAttachmentResponse] = []
    
    model_config = ConfigDict(from_attributes=True)

class MessageWithSender(MessageResponse):
    sender: UserResponse

# Read Receipt Schemas
class ReadReceiptCreate(BaseModel):
    message_id: int

class ReadReceiptResponse(BaseModel):
    id: int
    message_id: int
    user_id: int
    read_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

# Sync Schemas
class SyncMessage(BaseModel):
    content: Optional[str]
    room_id: int
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
    receiver_id: int

class FriendRequestResponse(BaseModel):
    id: int
    sender_id: int
    receiver_id: int
    status: FriendRequestStatus
    created_at: datetime
    
    sender: Optional[UserResponse] = None
    receiver: Optional[UserResponse] = None
    
    model_config = ConfigDict(from_attributes=True)

class FriendResponse(UserResponse):
    friendship_status: Optional[str] = None # 'friend', 'pending_sent', 'pending_received', 'none'
