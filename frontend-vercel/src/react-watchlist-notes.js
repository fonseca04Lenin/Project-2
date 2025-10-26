// React Watchlist Notes Editor Component
const { useState, useEffect, useCallback } = React;

const WatchlistNotesEditor = ({ symbol, initialNotes = '' }) => {
    const [notes, setNotes] = useState(initialNotes);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Update notes when initialNotes prop changes
    useEffect(() => {
        setNotes(initialNotes || '');
        setHasChanges(false);
    }, [initialNotes]);

    // Auto-save on blur with debounce
    const handleBlur = useCallback(() => {
        if (hasChanges && !isSaving) {
            saveNotes();
        } else {
            setIsEditing(false);
        }
    }, [hasChanges, isSaving]);

    const handleChange = (e) => {
        setNotes(e.target.value);
        setHasChanges(true);
    };

    const saveNotes = async () => {
        if (!symbol || isSaving) return;

        setIsSaving(true);
        try {
            // Get auth headers
            const authHeaders = await window.getAuthHeaders();
            
            const response = await fetch(`${window.API_BASE_URL || 'https://web-production-2e2e.up.railway.app'}/api/watchlist/${symbol}/notes`, {
                method: 'PUT',
                headers: authHeaders,
                credentials: 'include',
                body: JSON.stringify({ notes })
            });

            if (response.ok) {
                const data = await response.json();
                setHasChanges(false);
                setIsEditing(false);
                
                // Show success message
                if (window.showToast) {
                    window.showToast('Notes saved successfully', 'success');
                }
            } else {
                throw new Error('Failed to save notes');
            }
        } catch (error) {
            console.error('Error saving notes:', error);
            if (window.showToast) {
                window.showToast('Failed to save notes', 'error');
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleKeyDown = (e) => {
        // Save on Cmd/Ctrl + Enter
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            saveNotes();
        }
        // Cancel on Escape
        if (e.key === 'Escape') {
            setNotes(initialNotes || '');
            setHasChanges(false);
            setIsEditing(false);
        }
    };

    if (!isEditing && !initialNotes && !notes) {
        // Empty state
        return (
            <div className="watchlist-notes-section">
                <div className="watchlist-notes-header">
                    <h4>
                        <i className="fas fa-sticky-note"></i>
                        Notes
                    </h4>
                    <button 
                        className="btn-icon btn-icon-sm" 
                        onClick={() => setIsEditing(true)}
                        title="Add notes"
                    >
                        <i className="fas fa-plus"></i>
                    </button>
                </div>
                <div className="watchlist-notes-empty">
                    <span>Click + to add notes about this stock</span>
                </div>
            </div>
        );
    }

    if (!isEditing) {
        // View mode
        return (
            <div className="watchlist-notes-section">
                <div className="watchlist-notes-header">
                    <h4>
                        <i className="fas fa-sticky-note"></i>
                        Notes
                    </h4>
                    <button 
                        className="btn-icon btn-icon-sm" 
                        onClick={() => setIsEditing(true)}
                        title="Edit notes"
                    >
                        <i className="fas fa-edit"></i>
                    </button>
                </div>
                <div className="watchlist-notes-content">
                    <p>{notes}</p>
                </div>
            </div>
        );
    }

    // Edit mode
    return (
        <div className="watchlist-notes-section watchlist-notes-editing">
            <div className="watchlist-notes-header">
                <h4>
                    <i className="fas fa-sticky-note"></i>
                    Notes
                </h4>
                <div className="watchlist-notes-actions">
                    {hasChanges && (
                        <span className="watchlist-notes-unsaved">
                            <i className="fas fa-circle" style={{ fontSize: '8px', color: 'var(--primary)' }}></i>
                            Unsaved changes
                        </span>
                    )}
                    <button 
                        className="btn-icon btn-icon-sm" 
                        onClick={handleBlur}
                        disabled={isSaving}
                        title="Save notes (Ctrl+Enter)"
                    >
                        <i className={`fas ${isSaving ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
                    </button>
                </div>
            </div>
            <textarea
                className="watchlist-notes-textarea"
                value={notes}
                onChange={handleChange}
                onBlur={handleBlur}
                onKeyDown={handleKeyDown}
                placeholder="Add your notes here... (Press Ctrl+Enter to save, Esc to cancel)"
                autoFocus
                rows="4"
            />
            <div className="watchlist-notes-hint">
                <small>
                    <i className="fas fa-info-circle"></i>
                    Press Ctrl+Enter to save, Esc to cancel
                </small>
            </div>
        </div>
    );
};

// Function to render the notes editor
window.renderWatchlistNotes = (symbol, notes) => {
    const container = document.getElementById('watchlistNotesEditor');
    if (!container) return;

    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(WatchlistNotesEditor, { 
        symbol, 
        initialNotes: notes 
    }));
};

// Cleanup function
window.unmountWatchlistNotes = () => {
    const container = document.getElementById('watchlistNotesEditor');
    if (container) {
        const root = ReactDOM.createRoot(container);
        root.render(null);
    }
};
