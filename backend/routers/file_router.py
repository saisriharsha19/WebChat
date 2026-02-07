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
    final_content_type = file.content_type
    final_extension = os.path.splitext(file.filename)[1].lower()
    
    # Compression Logic
    try:
        import gzip
        import shutil
        
        # 1. Image Compression (Pillow)
        if file.content_type.startswith("image/"):
            try:
                from PIL import Image
                import io
                
                # Re-open temp file
                with open(temp_path, 'rb') as f:
                    img_data = f.read()
                    
                with Image.open(io.BytesIO(img_data)) as img:
                    # Convert to RGB
                    if img.mode in ('RGBA', 'P'):
                        img = img.convert('RGB')
                    
                    # Resize (Max 1280px)
                    max_width = 1280
                    if img.width > max_width:
                        ratio = max_width / img.width
                        new_height = int(img.height * ratio)
                        img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
                    
                    # Save compressed to buffer (JPEG, Quality 30)
                    buffer = io.BytesIO()
                    img.save(buffer, format="JPEG", quality=30, optimize=True)
                    buffer.seek(0)
                    
                    compressed_data = buffer.getvalue()
                    
                    # Overwrite temp file
                    with open(temp_path, 'wb') as f:
                        f.write(compressed_data)
                        
                    size = len(compressed_data)
                    final_content_type = "image/jpeg"
                    final_extension = ".jpg"
                    
                    # Update filename to .jpg if needed
                    if not file.filename.lower().endswith(('.jpg', '.jpeg')):
                         file.filename = os.path.splitext(file.filename)[0] + ".jpg"

            except ImportError:
                print("Pillow not installed, skipping image compression")
            except Exception as e:
                print(f"Image compression failed: {e}")

        # 2. GZIP Compression for non-images
        else:
            # Attempt GZIP
            gzip_path = temp_path + ".gz"
            with open(temp_path, 'rb') as f_in:
                with gzip.open(gzip_path, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
            
            gzip_size = os.path.getsize(gzip_path)
            
            # Use GZIP if it saves space (arbitrary threshold: 95% of original or better)
            if gzip_size < size * 0.95:
                # Replace temp file with gzipped version
                os.remove(temp_path)
                os.rename(gzip_path, temp_path)
                size = gzip_size
                final_extension += ".gz" # Append .gz
                # We do NOT change content_type, server will handle encoding
            else:
                # Discard gzip if not efficient
                os.remove(gzip_path)

    except Exception as e:
        print(f"Compression logic failed: {e}")

    final_filename = f"{file_hash}_{file.filename}{final_extension if final_extension.endswith('.gz') and not file.filename.endswith('.gz') else ''}"
    
    # Fix double extension issue if present or just keep it simple
    # If we gzipped, final_filename should end in .gz
    # If we turned to jpg, it should end in .jpg
    # Let's rebuild filename safely
    base_name = os.path.splitext(file.filename)[0]
    if final_content_type == "image/jpeg":
        final_filename = f"{file_hash}_{base_name}.jpg"
    elif final_extension.endswith(".gz"):
        final_filename = f"{file_hash}_{file.filename}.gz"
    else:
        final_filename = f"{file_hash}_{file.filename}"

    final_path = os.path.join(UPLOAD_DIR, final_filename)
    
    # Rename/Move
    if os.path.exists(final_path):
        os.remove(temp_path)
    else:
        os.rename(temp_path, final_path)
        
    # Create Message Record
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
        filename=final_filename, 
        file_path=final_path,
        file_size=size,
        content_type=final_content_type 
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
