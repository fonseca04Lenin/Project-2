// WhatsWhat view: glossary / education content. The legacy version is 557 LOC
// of mostly static copy. See frontend-vercel/src/react-view-whatswhat.tsx for
// the full version — port the remaining sections 1:1 when needed.

export default function WhatsWhat() {
    return (
        <div className="whatswhat-view">
            <div className="view-header">
                <h2>What's What — Terms & Concepts</h2>
            </div>
            <div className="ww-grid" style={{ display: 'grid', gap: '1rem', padding: '1.5rem 2rem', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                {[
                    { term: 'P/E Ratio', body: 'Price-to-earnings ratio. Lower often means the stock is "cheaper" relative to its earnings — but context matters by sector.' },
                    { term: 'Market Cap', body: 'Total value of a company\'s outstanding shares. Mega-cap > $200B, large > $10B, mid > $2B.' },
                    { term: 'EPS', body: 'Earnings per share — profit / outstanding shares. Trending growth is the signal, not any one quarter.' },
                    { term: 'Dividend Yield', body: 'Annual dividend / current price. Sustained high yields can signal risk, not value.' },
                    { term: '52-Week High / Low', body: 'The highest and lowest price over the past year. Breakouts and breakdowns are common technical signals.' },
                    { term: 'Volume', body: 'Shares traded today. Spikes often accompany news; sustained high volume = conviction.' },
                    { term: 'Beta', body: 'How volatile the stock is relative to the market. β > 1 = more volatile, β < 1 = less.' },
                    { term: 'RSI', body: 'Relative Strength Index. 70+ typically "overbought", 30- "oversold". Not a buy / sell signal on its own.' },
                ].map((item) => (
                    <div key={item.term} className="ww-card" style={{ padding: '1rem 1.25rem', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', background: 'rgba(255,255,255,0.02)' }}>
                        <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem', color: '#00D924' }}>{item.term}</h3>
                        <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.55 }}>{item.body}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
