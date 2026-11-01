import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { notify } from '../../lib/notifications';

interface Props {
    symbol: string;
    initialNotes?: string;
}

export function WatchlistNotesSection({ symbol, initialNotes = '' }: Props) {
    const [notes, setNotes] = useState(initialNotes);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        setNotes(initialNotes || '');
        setHasChanges(false);
    }, [initialNotes]);

    const saveNotes = async () => {
        if (!symbol || isSaving) return;
        setIsSaving(true);
        try {
            await api.watchlist.updateNotes(symbol, notes);
            setHasChanges(false);
            setIsEditing(false);
            notify('Notes saved successfully', 'success');
        } catch {
            notify('Failed to save notes', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleBlur = useCallback(() => {
        if (hasChanges && !isSaving) saveNotes();
        else setIsEditing(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasChanges, isSaving, notes]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setNotes(e.currentTarget.value);
        setHasChanges(true);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            saveNotes();
        }
        if (e.key === 'Escape') {
            setNotes(initialNotes || '');
            setHasChanges(false);
            setIsEditing(false);
        }
    };

    if (!isEditing && !initialNotes && !notes) {
        return (
            <div className="watchlist-notes-section">
                <div className="watchlist-notes-header">
                    <h4><i className="fas fa-sticky-note"></i>Notes</h4>
                    <button className="btn-icon btn-icon-sm" onClick={() => setIsEditing(true)} title="Add notes">
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
        return (
            <div className="watchlist-notes-section">
                <div className="watchlist-notes-header">
                    <h4><i className="fas fa-sticky-note"></i>Notes</h4>
                    <button className="btn-icon btn-icon-sm" onClick={() => setIsEditing(true)} title="Edit notes">
                        <i className="fas fa-edit"></i>
                    </button>
                </div>
                <div className="watchlist-notes-content">
                    <p>{notes}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="watchlist-notes-section watchlist-notes-editing">
            <div className="watchlist-notes-header">
                <h4><i className="fas fa-sticky-note"></i>Notes</h4>
                <div className="watchlist-notes-actions">
                    {hasChanges && (
                        <span className="watchlist-notes-unsaved">
                            <i className="fas fa-circle" style={{ fontSize: '8px', color: 'var(--primary)' }}></i>
                            Unsaved changes
                        </span>
                    )}
                    <button className="btn-icon btn-icon-sm" onClick={handleBlur} disabled={isSaving} title="Save notes (Ctrl+Enter)">
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
                rows={4}
            />
            <div className="watchlist-notes-hint">
                <small>
                    <i className="fas fa-info-circle"></i>
                    Press Ctrl+Enter to save, Esc to cancel
                </small>
            </div>
        </div>
    );
}
