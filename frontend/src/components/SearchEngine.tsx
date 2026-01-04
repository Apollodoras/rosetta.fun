import React, { useState, useEffect } from 'react';
import { Search, Music, Download, Filter, Star, Clock, Zap, Info } from 'lucide-react';

// Define types matching backend models
export enum Difficulty {
    BEGINNER = "beginner",
    INTERMEDIATE = "intermediate",
    ADVANCED = "advanced",
    EXPERT = "expert"
}

export enum Genre {
    CLASSICAL = "classical",
    POP = "pop",
    JAZZ = "jazz",
    GAME = "game",
    OTHER = "other"
}

export interface MIDIFile {
    id: number;
    title: string;
    composer: string;
    genre: Genre;
    difficulty: Difficulty;
    tempo?: number;
    duration?: number;
    quality_score: number;
    note_density?: number;
    download_count: number;
    user_rating: number;
    tags: any[];
    file_type: string;
}

const API_BASE = 'http://localhost:8000';

const SearchEngine = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<MIDIFile[]>([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({
        difficulty: [] as Difficulty[],
        genre: [] as Genre[],
    });
    const [showFilters, setShowFilters] = useState(false);
    const [autocomplete, setAutocomplete] = useState<string[]>([]);

    // Debounced search/autocomplete
    useEffect(() => {
        const timer = setTimeout(() => {
            if (query.length >= 2) {
                fetchAutocomplete(query);
            } else {
                setAutocomplete([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [query]);

    const fetchAutocomplete = async (q: string) => {
        try {
            const res = await fetch(`${API_BASE}/autocomplete?query=${q}`);
            if (res.ok) {
                const data = await res.json();
                setAutocomplete(data);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleSearch = async () => {
        setLoading(true);
        try {
            let url = `${API_BASE}/search?limit=50`;
            if (query) url += `&query=${encodeURIComponent(query)}`;

            filters.difficulty.forEach(d => url += `&difficulty=${d}`);
            filters.genre.forEach(g => url += `&genre=${g}`);

            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setResults(data);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
            setAutocomplete([]);
        }
    };

    const handleFilterChange = (key: 'difficulty' | 'genre', value: string) => {
        setFilters(prev => {
            const current = prev[key] as string[];
            if (current.includes(value)) {
                return { ...prev, [key]: current.filter(v => v !== value) };
            } else {
                return { ...prev, [key]: [...current, value] };
            }
        });
    };

    const getDifficultyColor = (difficulty: Difficulty) => {
        const colors: Record<string, string> = {
            [Difficulty.BEGINNER]: 'bg-green-100 text-green-800',
            [Difficulty.INTERMEDIATE]: 'bg-blue-100 text-blue-800',
            [Difficulty.ADVANCED]: 'bg-orange-100 text-orange-800',
            [Difficulty.EXPERT]: 'bg-red-100 text-red-800'
        };
        return colors[difficulty] || 'bg-gray-100 text-gray-800';
    };

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 py-4">
                    <div className="flex items-center gap-3 mb-4">
                        <Music className="w-8 h-8 text-indigo-600" />
                        <h1 className="text-2xl font-bold text-slate-800">MIDI Library</h1>
                    </div>

                    <div className="relative">
                        <div className="flex gap-2">
                            <div className="flex-1 relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                                    placeholder="Search songs, composers..."
                                    className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />

                                {autocomplete.length > 0 && (
                                    <div className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg z-10">
                                        {autocomplete.map((s, i) => (
                                            <button
                                                key={i}
                                                onClick={() => {
                                                    setQuery(s);
                                                    setAutocomplete([]);
                                                    handleSearch();
                                                }}
                                                className="w-full px-4 py-2 text-left hover:bg-slate-50"
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={handleSearch}
                                className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
                            >
                                Search
                            </button>

                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className={`px-4 py-3 border rounded-lg flex items-center gap-2 ${showFilters ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-300'}`}
                            >
                                <Filter className="w-5 h-5" />
                                Filters
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
                {showFilters && (
                    <aside className="w-64 flex-shrink-0">
                        <div className="bg-white rounded-lg border border-slate-200 p-4 sticky top-24">
                            <h3 className="font-semibold mb-2">Difficulty</h3>
                            {Object.values(Difficulty).map(d => (
                                <label key={d} className="flex items-center gap-2 mb-2">
                                    <input
                                        type="checkbox"
                                        checked={filters.difficulty.includes(d)}
                                        onChange={() => handleFilterChange('difficulty', d)}
                                    />
                                    <span className="capitalize">{d}</span>
                                </label>
                            ))}

                            <h3 className="font-semibold mb-2 mt-4">Genre</h3>
                            {Object.values(Genre).map(g => (
                                <label key={g} className="flex items-center gap-2 mb-2">
                                    <input
                                        type="checkbox"
                                        checked={filters.genre.includes(g)}
                                        onChange={() => handleFilterChange('genre', g)}
                                    />
                                    <span className="capitalize">{g}</span>
                                </label>
                            ))}
                        </div>
                    </aside>
                )}

                <main className="flex-1">
                    {loading ? (
                        <div className="text-center py-12">Loading...</div>
                    ) : (
                        <div className="space-y-4">
                            {results.map(file => (
                                <div key={file.id} className="bg-white p-5 rounded-lg border border-slate-200 hover:shadow-md transition-shadow">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="text-xl font-semibold text-slate-800">{file.title}</h3>
                                            <p className="text-slate-600">{file.composer}</p>
                                        </div>
                                        <span className={`px-2 py-1 rounded text-xs uppercase font-bold ${getDifficultyColor(file.difficulty)}`}>
                                            {file.difficulty}
                                        </span>
                                    </div>
                                    <div className="mt-4 flex gap-4 text-sm text-slate-500">
                                        <span>Genre: {file.genre}</span>
                                        <span>Rating: {file.user_rating} ★</span>
                                        <span>Downloads: {file.download_count}</span>
                                    </div>
                                </div>
                            ))}
                            {results.length === 0 && !loading && (
                                <div className="text-center text-slate-500 py-12">No results found</div>
                            )}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default SearchEngine;
