from datetime import datetime
from pydantic import BaseModel, ConfigDict
try:
    from pydantic import VERSION
    print(f"Pydantic Version: {VERSION}")
except ImportError:
    import pydantic
    print(f"Pydantic Version: {pydantic.VERSION}")

# Mock ORM object
class UserORM:
    def __init__(self, id, username, email, is_active, created_at, last_seen):
        self.id = id
        self.username = username
        self.email = email
        self.is_active = is_active
        self.created_at = created_at
        self.last_seen = last_seen

# Schema from schemas.py (simplified)
class UserBase(BaseModel):
    username: str
    email: str
    display_name: str | None = None
    avatar_url: str | None = None
    bio: str | None = None

class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    last_seen: datetime
    
    model_config = ConfigDict(from_attributes=True)

try:
    user = UserORM(
        id=1, 
        username="test", 
        email="test@example.com", 
        is_active=True, 
        created_at=datetime.now(), 
        last_seen=datetime.now()
    )
    # Test validation
    model = UserResponse.model_validate(user)
    print("Validation Successful!")
    print(model.model_dump())
except Exception as e:
    print(f"Validation Failed: {e}")
    import traceback
    traceback.print_exc()
