from typing import List, Optional
from sqlmodel import Field, SQLModel, Relationship
from datetime import datetime
from enum import Enum

class Difficulty(str, Enum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"
    EXPERT = "expert"

class Genre(str, Enum):
    CLASSICAL = "classical"
    POP = "pop"
    JAZZ = "jazz"
    ROCK = "rock"
    FOLK = "folk"
    GAME = "game"
    MOVIE = "movie"
    HYMN = "hymn"
    OTHER = "other"

class Period(str, Enum):
    BAROQUE = "baroque"
    CLASSICAL = "classical"
    ROMANTIC = "romantic"
    MODERN = "modern"
    CONTEMPORARY = "contemporary"

class MIDIFileBase(SQLModel):
    title: str = Field(index=True)
    composer: str = Field(index=True)
    genre: Genre = Field(default=Genre.OTHER, index=True)
    period: Optional[Period] = Field(default=None, index=True)
    difficulty: Difficulty = Field(default=Difficulty.INTERMEDIATE, index=True)
    tempo: Optional[int] = None  # BPM
    duration: Optional[float] = None  # seconds
    quality_score: float = Field(default=0.0)  # 0-10
    note_density: Optional[float] = None  # notes per second
    download_count: int = Field(default=0)
    user_rating: float = Field(default=0.0)  # 0-5
    source: str
    source_url: str
    download_url: str
    file_type: str = Field(default="midi") # midi, musicxml
    file_hash: str = Field(unique=True, index=True)
    date_added: datetime = Field(default_factory=datetime.utcnow)

class MIDIFile(MIDIFileBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tags: List["Tag"] = Relationship(back_populates="midi_files", link_model="MIDIFileTagLink")

class Tag(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    midi_files: List[MIDIFile] = Relationship(back_populates="tags", link_model="MIDIFileTagLink")

class MIDIFileTagLink(SQLModel, table=True):
    midi_file_id: Optional[int] = Field(default=None, foreign_key="midifile.id", primary_key=True)
    tag_id: Optional[int] = Field(default=None, foreign_key="tag.id", primary_key=True)

class MIDIFileCreate(MIDIFileBase):
    tags: List[str] = []

class MIDIFileRead(MIDIFileBase):
    id: int
    tags: List[Tag] = []
