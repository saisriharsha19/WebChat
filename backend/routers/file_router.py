from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
import aiofiles
import os
import hashlib
from datetime import datetime

from database import get_db
from models import User, Message, FileAttachment, RoomMember
from auth import get_current_user
# Broadcast for new attachment message
from routers.websocket_router import manager

router = APIRouter(prefix="/files", tags=["files"])

UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

@router.post("/upload")
async def upload_file(
    room_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Check room access first
    member = db.query(RoomMember).filter(
        RoomMember.room_id == room_id,
        RoomMember.user_id == current_user.id
    ).first()
    if not member:
         raise HTTPException(status_code=403, detail="Access denied to room")

    # Deduplication Strategy
    # We will read chunks, compute hash, and write appropriately.
    # Ideally we'd wash the file to a temp location first, but for simplicity:
    
    # Generate unique-ish filename to prevent collisions if hash logic fails or is skipped
    # actually let's use hash as filename? No, we need original extension.
    # Let's save as {hash}_{original_name}
    
    # We need to calculate hash WHILE reading/saving to avoid double reading
    sha256_hash = hashlib.sha256()
    
    # Temp path
    temp_filename = f"temp_{current_user.id}_{datetime.utcnow().timestamp()}_{file.filename}"
    temp_path = os.path.join(UPLOAD_DIR, temp_filename)
    
    size = 0
    async with aiofiles.open(temp_path, 'wb') as out_file:
        while content := await file.read(1024 * 1024): # 1MB chunks
            sha256_hash.update(content)
            await out_file.write(content)
            size += len(content)
            
    file_hash = sha256_hash.hexdigest()
    
    # Image Optimization logic using Pillow
    # Requires: pip install Pillow
    try:
        from PIL import Image
        import io
        
        if file.content_type.startswith("image/"):
            # Re-open temp file to compress
            with open(temp_path, 'rb') as f:
                img_data = f.read()
                
            with Image.open(io.BytesIO(img_data)) as img:
                # Convert RGBA to RGB if needed
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')
                
                # Resize if too large (max 1920px width)
                max_width = 1920
                if img.width > max_width:
                    ratio = max_width / img.width
                    new_height = int(img.height * ratio)
                    img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
                
                # Save compressed to buffer
                buffer = io.BytesIO()
                img.save(buffer, format="JPEG", quality=80, optimize=True)
                buffer.seek(0)
                
                # Overwrite content for final save
                compressed_data = buffer.getvalue()
                
                # Update hash for compressed file (optional, but good for consistency)
                # Actually, let's keep original hash for dedup of *uploads*, 
                # but saving compressed version is fine.
                
                # Write compressed data to temp (overwrite)
                with open(temp_path, 'wb') as f:
                    f.write(compressed_data)
                    
                size = len(compressed_data)
                # We update filename to .jpg if we converted
                if not file.filename.lower().endswith(('.jpg', '.jpeg')):
                     file.filename = os.path.splitext(file.filename)[0] + ".jpg"
                     
    except ImportError:
        print("Pillow not installed, skipping image compression")
    except Exception as e:
        print(f"Image compression failed: {e}")

    final_filename = f"{file_hash}_{file.filename}"
    final_path = os.path.join(UPLOAD_DIR, final_filename)
    
    # Rename/Move
    if os.path.exists(final_path):
        # File exists, delete temp and use existing
        os.remove(temp_path)
    else:
        os.rename(temp_path, final_path)
        
    # Create Message Record
    # We create a 'file' type message automatically
    new_message = Message(
        sender_id=current_user.id,
        room_id=room_id,
        message_type="file",
        content=f"Sent a file: {file.filename}" 
    )
    db.add(new_message)
    db.commit()
    db.refresh(new_message)
    
    # Create Attachment Record
    attachment = FileAttachment(
        message_id=new_message.id,
        filename=final_filename, # Store the actual on-disk filename (hashed) so links work
        file_path=final_path,
        file_size=size,
        content_type=file.content_type
    )
    db.add(attachment)
    db.commit()
    
    # Broadcast
    # We construct specific payload for file
    response = {
        "type": "new_message",
        "message": {
            "id": new_message.id,
            "sender_id": new_message.sender_id,
            "room_id": new_message.room_id,
            "message_type": "file",
            "content": new_message.content,
            "created_at": new_message.created_at.isoformat(),
            "attachments": [{
                "id": attachment.id,
                "filename": attachment.filename,
                "file_size": attachment.file_size,
                "content_type": attachment.content_type
            }],
             "sender": {
                "id": current_user.id,
                "username": current_user.username,
                "display_name": current_user.display_name,
                "avatar_url": current_user.avatar_url
            }
        }
    }
    await manager.broadcast_to_room(room_id, response)
    
    return {"status": "success", "file_id": attachment.id}
