import { useState, useEffect, useRef } from 'react';
import { useFazendas, type SearchResult } from '@/hooks/useFazendas';
import { Search, X, History } from 'lucide-react';

interface SearchBarProps {
  onSelect: (result: SearchResult) => void;
}

export default function SearchBar({ onSelect }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searchHistory, setSearchHistory] = useState<SearchResult[]>([]);
  const { searchFazendas } = useFazendas();
  const inputRef = useRef<HTMLInputElement>(null);

  // Carregar histórico do localStorage
  useEffect(() => {
    const saved = localStorage.getItem('searchHistory');
    if (saved) {
      try {
        setSearchHistory(JSON.parse(saved));
      } catch {
        // Ignorar erro de parsing
      }
    }
  }, []);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (value.trim()) {
      const searchResults = searchFazendas(value);
      setResults(searchResults);
      setShowResults(true);
    } else {
      setResults([]);
      setShowResults(true);
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    // Adicionar ao histórico (máximo 5)
    const newHistory = [
      result,
      ...searchHistory.filter((r) => r.label !== result.label),
    ].slice(0, 5);
    setSearchHistory(newHistory);
    localStorage.setItem('searchHistory', JSON.stringify(newHistory));

    onSelect(result);
    setQuery('');
    setShowResults(false);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setShowResults(false);
    inputRef.current?.focus();
  };

  return (
    <div className="relative w-full">
      <div className="glass-liquid flex items-center gap-2 rounded-2xl px-3 py-2 text-white shadow-2xl">
        <Search className="w-5 h-5 text-white/55" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Buscar fundo, talhão ou 'Fundo 1 Talhão 2'..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => setShowResults(true)}
          className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-white/45"
        />
        {query && (
          <button
            onClick={handleClear}
            className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Dropdown de resultados */}
      {showResults && (
        <div className="glass-liquid-strong modal-scroll absolute top-full left-0 right-0 z-50 mt-2 max-h-80 overflow-y-auto rounded-2xl shadow-2xl">
          {/* Resultados de busca */}
          {results.length > 0 && (
            <div>
              <div className="sticky top-0 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/60 bg-white/8 backdrop-blur">
                RESULTADOS ({results.length})
              </div>
              {results.map((result, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectResult(result)}
                  className="bp-search-result-item w-full border-b border-white/8 px-3 py-2 text-left transition last:border-b-0 hover:bg-lime-300/10"
                >
                  <div className="bp-search-result-label text-sm font-semibold text-white">
                    {result.label}
                  </div>
                  <div className="bp-search-result-zone text-xs text-white/55">
                    Zona {result.fazenda.ZONA}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Histórico de pesquisas */}
          {!query && searchHistory.length > 0 && (
            <div>
              <div className="flex items-center gap-1 bg-white/8 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/60 backdrop-blur">
                <History className="w-3 h-3" />
                HISTÓRICO
              </div>
              {searchHistory.map((result, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectResult(result)}
                  className="w-full border-b border-white/8 px-3 py-2 text-left transition last:border-b-0 hover:bg-white/8"
                >
                  <div className="text-sm text-white/78">{result.label}</div>
                </button>
              ))}
            </div>
          )}

          {/* Sem resultados */}
          {query && results.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-white/62">
              Nenhum resultado encontrado
            </div>
          )}
        </div>
      )}
    </div>
  );
}
