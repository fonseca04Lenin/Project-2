import React, { useState } from 'react';
import { Stock } from '../types/stock';
import StockCard from './StockCard';

interface SearchResult {
  symbol: string;
  name: string;
}

const SearchSection: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleSearch = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      setShowSuggestions(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/search/stocks?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.results || []);
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    handleSearch(query);
  };

  const handleSuggestionClick = async (symbol: string) => {
    setSearchQuery(symbol);
    setShowSuggestions(false);
    setLoading(true);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ symbol }),
      });

      if (response.ok) {
        const data = await response.json();
        setSelectedStock(data);
      } else {
        const error = await response.json();
        console.error('Stock search failed:', error);
      }
    } catch (error) {
      console.error('Stock search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      handleSuggestionClick(searchQuery.trim().toUpperCase());
    }
  };

  return (
    <>
      <section className="search-section">
        <div className="search-container">
          <div className="search-box">
            <i className="fas fa-search search-icon"></i>
            <form onSubmit={handleSearchSubmit} style={{ flex: 1, display: 'flex' }}>
              <input
                type="text"
                placeholder="Search stocks by name or symbol (e.g., Apple, AAPL, Tesla)"
                className="search-input"
                value={searchQuery}
                onChange={handleInputChange}
                onFocus={() => setShowSuggestions(true)}
              />
            </form>
            <button 
              className={`search-btn ${loading ? 'loading' : ''}`}
              onClick={() => handleSearchSubmit}
              disabled={loading}
            >
              <span className="btn-text">Search</span>
              <i className="fas fa-spinner fa-spin btn-loading"></i>
            </button>
          </div>

          {showSuggestions && searchResults.length > 0 && (
            <div className="main-search-suggestions">
              {searchResults.map((result, index) => (
                <div
                  key={index}
                  className="main-suggestion-item"
                  onClick={() => handleSuggestionClick(result.symbol)}
                >
                  <span className="suggestion-symbol">{result.symbol}</span>
                  <span className="suggestion-name">{result.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {selectedStock && (
        <section className="stock-results">
          <StockCard stock={selectedStock} />
        </section>
      )}
    </>
  );
};

export default SearchSection; 