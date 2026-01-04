import React, { useState, useEffect, useCallback } from 'react';
import { Search, Music, Download, Filter, Star, Clock, Zap, Info } from 'lucide-react';

// Mock API calls (replace with actual fetch to your backend)
const API_BASE = 'http://localhost:8000';

const mockSearchResults = [
  {
    file: {
      id: '1',
      title: 'Für Elise',
      composer: 'Ludwig van Beethoven',
      genre: 'classical',
      difficulty: 'beginner',
      tempo_bpm: 120,
      duration_sec: 210,
      note_density: 2.5,
      quality: {
        total_score: 9.2,
        piano_suitability: 9.8
      },
      tags: ['piano', 'famous', 'romantic'],
      download_count: 5420,
      user_rating: 4.8
    },
    relevance_score: 85.5
  },
  {
    file: {
      id: '2',
      title: 'Moonlight Sonata',
      composer: 'Ludwig van Beethoven',
      genre: 'classical',
      difficulty: 'advanced',
      tempo_bpm: 60,
      duration_sec: 915,
      note_density: 4.8,
      quality: {
        total_score: 9.4,
        piano_suitability: 9.9
      },
      tags: ['piano', 'sonata', 'famous'],
      download_count: 8920,
      user_rating: 4.9
    },
    relevance_score: 82.3
  },
  {
    file: {
      id: '3',
      title: 'Prelude in C Major',
      composer: 'Johann Sebastian Bach',
      genre: 'classical',
      difficulty: 'intermediate',
      tempo_bpm: 96,
      duration_sec: 135,
      note_density: 3.2,
      quality: {
        total_score: 8.9,
        piano_suitability: 9.5
      },
      tags: ['piano', 'baroque', 'prelude'],
      download_count: 3200,
      user_rating: 4.7
    },
    relevance_score: 75.1
  }
];

const MIDISearchApp = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    difficulty: [],
    genre: [],
    tempo_min: '',
    tempo_max: '',
    duration_max: '',
    min_quality: 6.0
  });
  const [showFilters, setShowFilters] = useState(false);
  const [autocomplete, setAutocomplete] = useState([]);

  // Debounced search
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

  const fetchAutocomplete = async (q) => {
    // Mock autocomplete
    const suggestions = ['Beethoven', 'Bach', 'Chopin', 'Mozart']
      .filter(s => s.toLowerCase().includes(q.toLowerCase()));
    setAutocomplete(suggestions);
  };

  const handleSearch = async () => {
    if (!query.trim() && filters.difficulty.length === 0) return;
    
    setLoading(true);
    
    // Mock API call - replace with real fetch
    setTimeout(() => {
      setResults(mockSearchResults);
      setLoading(false);
    }, 500);
    
    setAutocomplete([]);
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => {
      if (key === 'difficulty' || key === 'genre') {
        const current = prev[key];
        if (current.includes(value)) {
          return { ...prev, [key]: current.filter(v => v !== value) };
        } else {
          return { ...prev, [key]: [...current, value] };
        }
      }
      return { ...prev, [key]: value };
    });
  };

  const clearFilters = () => {
    setFilters({
      difficulty: [],
      genre: [],
      tempo_min: '',
      tempo_max: '',
      duration_max: '',
      min_quality: 6.0
    });
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getDifficultyColor = (difficulty) => {
    const colors = {
      beginner: 'bg-green-100 text-green-800',
      intermediate: 'bg-blue-100 text-blue-800',
      advanced: 'bg-orange-100 text-orange-800',
      expert: 'bg-red-100 text-red-800'
    };
    return colors[difficulty] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <Music className="w-8 h-8 text-indigo-600" />
            <h1 className="text-2xl font-bold text-slate-800">MIDI Library</h1>
          </div>
          
          {/* Search Bar */}
          <div className="relative">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search songs, composers, or genres..."
                  className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                
                {/* Autocomplete */}
                {autocomplete.length > 0 && (
                  <div className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg z-10">
                    {autocomplete.map((suggestion, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setQuery(suggestion);
                          setAutocomplete([]);
                          handleSearch();
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-slate-50 first:rounded-t-lg last:rounded-b-lg"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <button
                onClick={handleSearch}
                className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                Search
              </button>
              
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-4 py-3 border rounded-lg transition-colors flex items-center gap-2 ${
                  showFilters ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Filter className="w-5 h-5" />
                Filters
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Filters Sidebar */}
          {showFilters && (
            <aside className="w-64 flex-shrink-0">
              <div className="bg-white rounded-lg border border-slate-200 p-4 sticky top-24">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-slate-800">Filters</h2>
                  <button
                    onClick={clearFilters}
                    className="text-sm text-indigo-600 hover:text-indigo-700"
                  >
                    Clear
                  </button>
                </div>

                {/* Difficulty */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-slate-700 mb-2">Difficulty</h3>
                  {['beginner', 'intermediate', 'advanced', 'expert'].map(level => (
                    <label key={level} className="flex items-center gap-2 mb-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.difficulty.includes(level)}
                        onChange={() => handleFilterChange('difficulty', level)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-600 capitalize">{level}</span>
                    </label>
                  ))}
                </div>

                {/* Genre */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-slate-700 mb-2">Genre</h3>
                  {['classical', 'jazz', 'pop', 'game', 'film'].map(genre => (
                    <label key={genre} className="flex items-center gap-2 mb-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.genre.includes(genre)}
                        onChange={() => handleFilterChange('genre', genre)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-600 capitalize">{genre}</span>
                    </label>
                  ))}
                </div>

                {/* Tempo Range */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-slate-700 mb-2">Tempo (BPM)</h3>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={filters.tempo_min}
                      onChange={(e) => handleFilterChange('tempo_min', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-slate-300 rounded"
                    />
                    <input
                      type="number"
                      placeholder="Max"
                      value={filters.tempo_max}
                      onChange={(e) => handleFilterChange('tempo_max', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-slate-300 rounded"
                    />
                  </div>
                </div>

                {/* Duration */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-slate-700 mb-2">Max Duration (min)</h3>
                  <input
                    type="number"
                    placeholder="e.g., 5"
                    value={filters.duration_max}
                    onChange={(e) => handleFilterChange('duration_max', e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-slate-300 rounded"
                  />
                </div>

                {/* Quality */}
                <div>
                  <h3 className="text-sm font-medium text-slate-700 mb-2">
                    Min Quality: {filters.min_quality.toFixed(1)}
                  </h3>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.5"
                    value={filters.min_quality}
                    onChange={(e) => handleFilterChange('min_quality', parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            </aside>
          )}

          {/* Results */}
          <main className="flex-1">
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
                <p className="mt-4 text-slate-600">Searching...</p>
              </div>
            ) : results.length > 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-600 mb-4">
                  Found {results.length} results for "{query}"
                </p>
                
                {results.map((result) => (
                  <ResultCard key={result.file.id} result={result} formatDuration={formatDuration} getDifficultyColor={getDifficultyColor} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Music className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-700 mb-2">Find Your Perfect Song</h3>
                <p className="text-slate-500">Search for songs, composers, or browse by genre</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

const ResultCard = ({ result, formatDuration, getDifficultyColor }) => {
  const { file } = result;
  
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-slate-800 mb-1">{file.title}</h3>
          <p className="text-slate-600">{file.composer}</p>
        </div>
        
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getDifficultyColor(file.difficulty)}`}>
            {file.difficulty}
          </span>
          <div className="flex items-center gap-1 text-sm text-slate-600">
            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            <span>{file.user_rating.toFixed(1)}</span>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="flex flex-wrap gap-4 mb-4 text-sm text-slate-600">
        <div className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          {formatDuration(file.duration_sec)}
        </div>
        <div className="flex items-center gap-1">
          <Zap className="w-4 h-4" />
          {file.tempo_bpm} BPM
        </div>
        <div className="flex items-center gap-1">
          <Info className="w-4 h-4" />
          Quality: {file.quality.total_score.toFixed(1)}/10
        </div>
        <div>
          {file.download_count.toLocaleString()} downloads
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-2 mb-4">
        {file.tags.map((tag, i) => (
          <span key={i} className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded">
            {tag}
          </span>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
          <Download className="w-4 h-4" />
          Download MIDI
        </button>
        <button className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
          Preview
        </button>
      </div>
    </div>
  );
};

export default MIDISearchApp;