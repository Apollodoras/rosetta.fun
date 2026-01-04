"""
MIDI/MusicXML Search Algorithm
Handles fuzzy search, filtering, quality ranking, and relevance scoring
"""

from dataclasses import dataclass
from typing import List, Optional, Dict, Any
from enum import Enum
import re
from difflib import SequenceMatcher

class Difficulty(Enum):
    BEGINNER = 1
    INTERMEDIATE = 2
    ADVANCED = 3
    EXPERT = 4

class Genre(Enum):
    CLASSICAL = "classical"
    POP = "pop"
    JAZZ = "jazz"
    ROCK = "rock"
    FOLK = "folk"
    GAME = "game"
    MOVIE = "movie"
    HYMN = "hymn"
    OTHER = "other"

class Period(Enum):
    BAROQUE = "baroque"
    CLASSICAL = "classical"
    ROMANTIC = "romantic"
    MODERN = "modern"
    CONTEMPORARY = "contemporary"

@dataclass
class MIDIFile:
    id: str
    title: str
    composer: str
    genre: Genre
    period: Optional[Period]
    difficulty: Difficulty
    tempo: int  # BPM
    duration: float  # minutes
    quality_score: float  # 0-10
    note_density: float  # notes per second
    download_count: int
    user_rating: float  # 0-5
    tags: List[str]
    file_formats: List[str]  # ['midi', 'musicxml']
    source: str
    date_added: str

@dataclass
class SearchFilters:
    difficulty: Optional[List[Difficulty]] = None
    genre: Optional[List[Genre]] = None
    period: Optional[List[Period]] = None
    tempo_min: Optional[int] = None
    tempo_max: Optional[int] = None
    duration_min: Optional[float] = None
    duration_max: Optional[float] = None
    file_format: Optional[str] = None  # 'midi', 'musicxml', or 'both'
    min_quality: Optional[float] = None

@dataclass
class SearchResult:
    file: MIDIFile
    relevance_score: float
    match_highlights: Dict[str, str]  # field -> matched text

class MIDISearchEngine:
    def __init__(self, files: List[MIDIFile]):
        self.files = files
        self.composer_aliases = self._build_composer_aliases()
    
    def _build_composer_aliases(self) -> Dict[str, List[str]]:
        """Map composer variations to canonical names"""
        return {
            "Ludwig van Beethoven": ["beethoven", "l.v. beethoven", "van beethoven"],
            "Wolfgang Amadeus Mozart": ["mozart", "w.a. mozart", "amadeus"],
            "Johann Sebastian Bach": ["bach", "j.s. bach", "js bach"],
            "Frédéric Chopin": ["chopin", "f. chopin", "frederic chopin"],
            "Franz Schubert": ["schubert", "f. schubert"],
            "Claude Debussy": ["debussy", "c. debussy"],
            "Pyotr Ilyich Tchaikovsky": ["tchaikovsky", "tchaikowsky", "p.i. tchaikovsky"],
            # Add more as needed
        }
    
    def _normalize_composer(self, query: str) -> str:
        """Convert composer query to canonical name"""
        query_lower = query.lower()
        for canonical, aliases in self.composer_aliases.items():
            if query_lower in aliases or query_lower == canonical.lower():
                return canonical
        return query
    
    def _fuzzy_match(self, query: str, target: str, threshold: float = 0.6) -> float:
        """Return similarity score between 0 and 1"""
        query_lower = query.lower()
        target_lower = target.lower()
        
        # Exact match
        if query_lower == target_lower:
            return 1.0
        
        # Contains match
        if query_lower in target_lower:
            return 0.9
        
        # Fuzzy similarity
        return SequenceMatcher(None, query_lower, target_lower).ratio()
    
    def _calculate_relevance_score(self, file: MIDIFile, query: str, 
                                   sort_by: str = "relevance") -> float:
        """
        Calculate relevance score based on multiple factors
        Score range: 0-100
        """
        if not query.strip():
            # No query, use alternative ranking
            if sort_by == "popularity":
                return file.download_count / 100  # Normalize
            elif sort_by == "rating":
                return file.user_rating * 20
            elif sort_by == "quality":
                return file.quality_score * 10
            elif sort_by == "recent":
                return 50  # Would use date_added in real implementation
            return file.quality_score * 10
        
        query_lower = query.lower()
        score = 0.0
        
        # Title match (40 points max)
        title_match = self._fuzzy_match(query, file.title)
        if title_match > 0.6:
            score += title_match * 40
        
        # Composer match (30 points max)
        normalized_query = self._normalize_composer(query)
        composer_match = self._fuzzy_match(normalized_query, file.composer)
        if composer_match > 0.6:
            score += composer_match * 30
        
        # Tag match (15 points max)
        tag_matches = [self._fuzzy_match(query, tag) for tag in file.tags]
        if tag_matches:
            best_tag_match = max(tag_matches)
            if best_tag_match > 0.6:
                score += best_tag_match * 15
        
        # Genre match (10 points max)
        if query_lower in file.genre.value.lower():
            score += 10
        
        # Period match (5 points max)
        if file.period and query_lower in file.period.value.lower():
            score += 5
        
        # Quality boost (multiply by quality factor)
        quality_factor = 0.5 + (file.quality_score / 20)  # 0.5 to 1.0
        score *= quality_factor
        
        # Popularity boost (small influence)
        popularity_factor = min(file.download_count / 10000, 0.2)  # Max 0.2 boost
        score *= (1 + popularity_factor)
        
        # User rating boost
        rating_factor = (file.user_rating / 5) * 0.1  # Max 0.1 boost
        score *= (1 + rating_factor)
        
        return score
    
    def _apply_filters(self, file: MIDIFile, filters: SearchFilters) -> bool:
        """Check if file passes all filters"""
        if filters.difficulty and file.difficulty not in filters.difficulty:
            return False
        
        if filters.genre and file.genre not in filters.genre:
            return False
        
        if filters.period and (not file.period or file.period not in filters.period):
            return False
        
        if filters.tempo_min and file.tempo < filters.tempo_min:
            return False
        
        if filters.tempo_max and file.tempo > filters.tempo_max:
            return False
        
        if filters.duration_min and file.duration < filters.duration_min:
            return False
        
        if filters.duration_max and file.duration > filters.duration_max:
            return False
        
        if filters.file_format:
            if filters.file_format == 'both':
                if not ('midi' in file.file_formats and 'musicxml' in file.file_formats):
                    return False
            elif filters.file_format not in file.file_formats:
                return False
        
        if filters.min_quality and file.quality_score < filters.min_quality:
            return False
        
        return True
    
    def _get_match_highlights(self, file: MIDIFile, query: str) -> Dict[str, str]:
        """Return which fields matched the query"""
        highlights = {}
        query_lower = query.lower()
        
        if self._fuzzy_match(query, file.title) > 0.6:
            highlights['title'] = file.title
        
        normalized_query = self._normalize_composer(query)
        if self._fuzzy_match(normalized_query, file.composer) > 0.6:
            highlights['composer'] = file.composer
        
        for tag in file.tags:
            if self._fuzzy_match(query, tag) > 0.6:
                highlights['tags'] = tag
                break
        
        return highlights
    
    def search(self, 
               query: str = "", 
               filters: Optional[SearchFilters] = None,
               sort_by: str = "relevance",  # relevance, popularity, rating, quality, recent
               limit: int = 50,
               offset: int = 0) -> List[SearchResult]:
        """
        Main search function
        
        Args:
            query: Search string (title, composer, or keyword)
            filters: SearchFilters object with filter criteria
            sort_by: Sort method
            limit: Max results to return
            offset: Pagination offset
        
        Returns:
            List of SearchResult objects sorted by relevance
        """
        if filters is None:
            filters = SearchFilters()
        
        results = []
        
        # Filter and score all files
        for file in self.files:
            # Apply filters
            if not self._apply_filters(file, filters):
                continue
            
            # Calculate relevance
            relevance = self._calculate_relevance_score(file, query, sort_by)
            
            # Get match highlights
            highlights = self._get_match_highlights(file, query) if query else {}
            
            results.append(SearchResult(
                file=file,
                relevance_score=relevance,
                match_highlights=highlights
            ))
        
        # Sort results
        if sort_by == "relevance":
            results.sort(key=lambda x: x.relevance_score, reverse=True)
        elif sort_by == "popularity":
            results.sort(key=lambda x: x.file.download_count, reverse=True)
        elif sort_by == "rating":
            results.sort(key=lambda x: x.file.user_rating, reverse=True)
        elif sort_by == "quality":
            results.sort(key=lambda x: x.file.quality_score, reverse=True)
        elif sort_by == "title":
            results.sort(key=lambda x: x.file.title.lower())
        elif sort_by == "composer":
            results.sort(key=lambda x: x.file.composer.lower())
        elif sort_by == "recent":
            results.sort(key=lambda x: x.file.date_added, reverse=True)
        
        # Pagination
        return results[offset:offset + limit]
    
    def autocomplete(self, query: str, limit: int = 10) -> List[str]:
        """Provide autocomplete suggestions"""
        if len(query) < 2:
            return []
        
        suggestions = set()
        query_lower = query.lower()
        
        # Suggest titles
        for file in self.files:
            if query_lower in file.title.lower():
                suggestions.add(file.title)
            if query_lower in file.composer.lower():
                suggestions.add(file.composer)
            for tag in file.tags:
                if query_lower in tag.lower():
                    suggestions.add(tag)
        
        return sorted(list(suggestions))[:limit]


# Example usage
if __name__ == "__main__":
    # Sample data
    sample_files = [
        MIDIFile(
            id="1",
            title="Für Elise",
            composer="Ludwig van Beethoven",
            genre=Genre.CLASSICAL,
            period=Period.ROMANTIC,
            difficulty=Difficulty.BEGINNER,
            tempo=120,
            duration=3.5,
            quality_score=9.2,
            note_density=2.5,
            download_count=5420,
            user_rating=4.8,
            tags=["piano", "famous", "easy"],
            file_formats=["midi", "musicxml"],
            source="musescore",
            date_added="2024-01-15"
        ),
        MIDIFile(
            id="2",
            title="Moonlight Sonata",
            composer="Ludwig van Beethoven",
            genre=Genre.CLASSICAL,
            period=Period.ROMANTIC,
            difficulty=Difficulty.ADVANCED,
            tempo=60,
            duration=15.2,
            quality_score=9.5,
            note_density=4.8,
            download_count=8920,
            user_rating=4.9,
            tags=["piano", "famous", "sonata", "advanced"],
            file_formats=["midi", "musicxml"],
            source="imslp",
            date_added="2024-01-10"
        ),
        MIDIFile(
            id="3",
            title="Eine Kleine Nachtmusik",
            composer="Wolfgang Amadeus Mozart",
            genre=Genre.CLASSICAL,
            period=Period.CLASSICAL,
            difficulty=Difficulty.INTERMEDIATE,
            tempo=140,
            duration=6.0,
            quality_score=8.8,
            note_density=3.2,
            download_count=3200,
            user_rating=4.5,
            tags=["piano", "mozart", "serenade"],
            file_formats=["midi"],
            source="musescore",
            date_added="2024-02-01"
        ),
    ]
    
    # Create search engine
    engine = MIDISearchEngine(sample_files)
    
    # Example searches
    print("=== Search: 'beethoven' ===")
    results = engine.search(query="beethoven", limit=10)
    for result in results:
        print(f"{result.file.title} by {result.file.composer}")
        print(f"  Relevance: {result.relevance_score:.2f}")
        print(f"  Matches: {result.match_highlights}")
        print()
    
    print("\n=== Search: 'beginner piano' with filters ===")
    filters = SearchFilters(
        difficulty=[Difficulty.BEGINNER],
        duration_max=5.0
    )
    results = engine.search(query="piano", filters=filters, limit=10)
    for result in results:
        print(f"{result.file.title} - {result.file.difficulty.name}")
        print(f"  Duration: {result.file.duration} min")
        print()
    
    print("\n=== Autocomplete: 'bee' ===")
    suggestions = engine.autocomplete("bee")
    print(suggestions)
