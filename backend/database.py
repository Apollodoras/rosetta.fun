from sqlmodel import SQLModel, create_engine, Session

import os

sqlite_file_name = "database.db"
# Allow overriding the database URL via environment variable
sqlite_url = os.environ.get("DATABASE_URL", f"sqlite:///{sqlite_file_name}")

connect_args = {"check_same_thread": False}
engine = create_engine(sqlite_url, echo=True, connect_args=connect_args)

def get_engine():
    # Re-create engine if sqlite_url was changed (useful for Modal)
    return create_engine(sqlite_url, echo=True, connect_args=connect_args)

def create_db_and_tables():
    SQLModel.metadata.create_all(get_engine())

def get_session():
    with Session(get_engine()) as session:
        yield session
