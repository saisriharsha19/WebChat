from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "sqlite:///./webchat.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def check_files():
    db = SessionLocal()
    try:
        result = db.execute(text("SELECT id, filename, file_path FROM file_attachments"))
        print("\n--- File Attachments in DB ---")
        for row in result:
            print(f"ID: {row.id}, Filename: {row.filename}, Path: {row.file_path}")
    finally:
        db.close()

if __name__ == "__main__":
    check_files()
