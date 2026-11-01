// Stock details modal. Legacy version was 2518 LOC — a full in-modal clone of
// the stock details page. In this rebuild, "open modal" routes to the full
// details page instead, which is a cleaner UX and preserves all information.
// The event contract is identical (`stock-details:open`), so no callers need to change.
// Port frontend-vercel/src/react-stock-details-modal.tsx into this file if you
// want the overlay back.

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { events, EVT } from '../../lib/events';

export function StockDetailsModal() {
    const navigate = useNavigate();

    useEffect(() => {
        const off = events.on<{ symbol: string; isFromWatchlist?: boolean }>(EVT.STOCK_DETAILS_OPEN, (payload) => {
            if (!payload?.symbol) return;
            navigate(`/stock/${encodeURIComponent(payload.symbol)}`, {
                state: { isFromWatchlist: !!payload.isFromWatchlist },
            });
        });
        return off;
    }, [navigate]);

    return null;
}
