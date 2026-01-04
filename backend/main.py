from fastapi import FastAPI, Depends, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from typing import List, Optional
from database import create_db_and_tables, get_session
from models import MIDIFile, MIDIFileRead, Tag, Genre, Difficulty, Period
import uvicorn
from contextlib import asynccontextmanager
from difflib import SequenceMatcher

# Reuse fuzzy match logic from original draft
def fuzzy_match(query: str, target: str) -> float:
    """Return similarity score between 0 and 1"""
    if not target:
        return 0.0
    query_lower = query.lower()
    target_lower = target.lower()
    
    if query_lower == target_lower:
        return 1.0
    if query_lower in target_lower:
        return 0.9
    return SequenceMatcher(None, query_lower, target_lower).ratio()

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "https://rosetta.fun",
        "https://apollodoras.github.io",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/search", response_model=List[MIDIFileRead])
def search_midi_files(
    query: Optional[str] = None,
    difficulty: Optional[List[Difficulty]] = Query(None),
    genre: Optional[List[Genre]] = Query(None),
    period: Optional[List[Period]] = Query(None),
    limit: int = 50,
    offset: int = 0,
    session: Session = Depends(get_session)
):
    sql_query = select(MIDIFile)
    
    # 1. Database Filters (Hard filters)
    if difficulty:
        sql_query = sql_query.where(MIDIFile.difficulty.in_(difficulty))
    if genre:
        sql_query = sql_query.where(MIDIFile.genre.in_(genre))
    if period:
        sql_query = sql_query.where(MIDIFile.period.in_(period))
        
    results = session.exec(sql_query).all()
    
    # 2. In-Memory Fuzzy Search & Ranking (if query is present)
    if query:
        ranked_results = []
        for file in results:
            score = 0.0
            # Title match
            title_score = fuzzy_match(query, file.title)
            if title_score > 0.6: score += title_score * 40
            
            # Composer match
            composer_score = fuzzy_match(query, file.composer)
            if composer_score > 0.6: score += composer_score * 30
            
            # Tag match (simple check for now)
            # You would need to load tags eagerly or join them for efficient searching
            
            if score > 0:
                ranked_results.append((score, file))
        
        ranked_results.sort(key=lambda x: x[0], reverse=True)
        results = [r[1] for r in ranked_results]
    
    return results[offset : offset + limit]

@app.get("/autocomplete", response_model=List[str])
def autocomplete(query: str, limit: int = 10, session: Session = Depends(get_session)):
    if len(query) < 2:
        return []
    
    # Simple SQL LIKE for autocomplete
    statement = select(MIDIFile.title).where(MIDIFile.title.ilike(f"%{query}%")).limit(limit)
    titles = session.exec(statement).all()
    
    statement_comp = select(MIDIFile.composer).where(MIDIFile.composer.ilike(f"%{query}%")).limit(limit)
    composers = session.exec(statement_comp).all()
    
    suggestions = sorted(list(set(titles + composers)))
    return suggestions[:limit]

@app.get("/files/{file_id}", response_model=MIDIFileRead)
def get_file(file_id: int, session: Session = Depends(get_session)):
    file = session.get(MIDIFile, file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    return file

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
