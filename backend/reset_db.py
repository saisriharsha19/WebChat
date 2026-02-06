from database import engine, Base
from models import User, Room, RoomMember, Message, FileAttachment, ReadReceipt
import os

def reset_db():
    print("Dropping all tables...")
    try:
        if os.path.exists("webchat.db"):
            print("Removing old SQLite file...")
            try:
                os.remove("webchat.db")
            except PermissionError:
                print("Could not remove webchat.db. Make sure the server is stopped.")
                return False
        
        print("Creating new tables...")
        Base.metadata.create_all(bind=engine)
        print("Database reset successfully!")
        return True
    except Exception as e:
        print(f"Error resetting database: {e}")
        return False

if __name__ == "__main__":
    reset_db()
