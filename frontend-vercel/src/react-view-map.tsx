export {};
const { useState, useEffect, useRef, useCallback, useMemo } = React;

function routeTo(path: string, state?: Record<string, unknown>, replace?: boolean) {
    window.dispatchEvent(new CustomEvent('app:navigate', {
        detail: { path, state: state || {}, replace: !!replace }
    }));
}
function getCurrentUser() {
    return window.AppAuth?.getCurrentUser ? window.AppAuth.getCurrentUser() : null;
}
function getAuthHeaders(user?: FirebaseUser | null) {
    return window.AppAuth?.getAuthHeaders ? window.AppAuth.getAuthHeaders(user) : Promise.resolve({});
}

interface CompanyLocation {
    symbol: string;
    name: string;
    lat: number;
    lng: number;
    city: string;
    sector: string;
}

interface NearbyCompany extends CompanyLocation {
    distance: number;
}

// Map View Component - Shows publicly traded companies near user
const MapView = () => {
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [locationError, setLocationError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [mapCenter, setMapCenter] = useState<[number, number]>([39.8283, -98.5795]); // Center of USA
    const [mapZoom, setMapZoom] = useState(4);
    const [loading, setLoading] = useState(false);
    const [nearbyCompanies, setNearbyCompanies] = useState<NearbyCompany[]>([]);
    const [apiCompanies, setApiCompanies] = useState<CompanyLocation[]>([]);
    const [loadingCompanies, setLoadingCompanies] = useState(true);
    const [leafletReady, setLeafletReady] = useState(!!window.L);
    const [selectedSector, setSelectedSector] = useState('All');
    const [showAllNearby, setShowAllNearby] = useState(false);
    const [radiusMiles, setRadiusMiles] = useState(250);
    const [dataTimestamp, setDataTimestamp] = useState<string | null>(null);
    const [fetchTrigger, setFetchTrigger] = useState(0);
    const mapRef = useRef<HTMLDivElement | null>(null);
    const mapInstanceRef = useRef<any>(null);
    const markersRef = useRef<any[]>([]);
    const userMarkerRef = useRef<any>(null);
    const lastGeocodeFetchRef = useRef<number>(0);

    // Refresh company data
    const refreshCompanyData = () => {
        setApiCompanies([]);
        setDataTimestamp(null);
        setFetchTrigger(prev => prev + 1);
    };

    // Get sector color
    const getSectorColor = (sector: string) => {
        const colors: Record<string, string> = {
            'Technology': '#00D924',
            'Finance': '#FFD700',
            'Healthcare': '#FF6B6B',
            'Consumer': '#4ECDC4',
            'Retail': '#9B59B6',
            'Energy': '#E67E22',
            'Industrial': '#3498DB',
            'Telecom': '#1ABC9C',
            'Entertainment': '#E91E63',
            'Automotive': '#FF5722'
        };
        return colors[sector] || '#00D924';
    };

    // Fallback company locations — Fortune 1000 scale (used if API fails)
    const fallbackCompanyLocations: CompanyLocation[] = [
        // === Technology ===
        { symbol: 'AAPL', name: 'Apple Inc.', lat: 37.3349, lng: -122.0090, city: 'Cupertino, CA', sector: 'Technology' },
        { symbol: 'GOOGL', name: 'Alphabet Inc.', lat: 37.4220, lng: -122.0841, city: 'Mountain View, CA', sector: 'Technology' },
        { symbol: 'META', name: 'Meta Platforms', lat: 37.4845, lng: -122.1477, city: 'Menlo Park, CA', sector: 'Technology' },
        { symbol: 'MSFT', name: 'Microsoft Corp.', lat: 47.6405, lng: -122.1297, city: 'Redmond, WA', sector: 'Technology' },
        { symbol: 'AMZN', name: 'Amazon.com Inc.', lat: 47.6062, lng: -122.3321, city: 'Seattle, WA', sector: 'Technology' },
        { symbol: 'NVDA', name: 'NVIDIA Corp.', lat: 37.3707, lng: -122.0375, city: 'Santa Clara, CA', sector: 'Technology' },
        { symbol: 'NFLX', name: 'Netflix Inc.', lat: 37.2571, lng: -121.9626, city: 'Los Gatos, CA', sector: 'Entertainment' },
        { symbol: 'ORCL', name: 'Oracle Corp.', lat: 30.2672, lng: -97.7431, city: 'Austin, TX', sector: 'Technology' },
        { symbol: 'CRM', name: 'Salesforce Inc.', lat: 37.7900, lng: -122.3969, city: 'San Francisco, CA', sector: 'Technology' },
        { symbol: 'ADBE', name: 'Adobe Inc.', lat: 37.3309, lng: -121.8939, city: 'San Jose, CA', sector: 'Technology' },
        { symbol: 'INTC', name: 'Intel Corp.', lat: 37.3876, lng: -121.9636, city: 'Santa Clara, CA', sector: 'Technology' },
        { symbol: 'AMD', name: 'AMD Inc.', lat: 37.3809, lng: -121.9628, city: 'Santa Clara, CA', sector: 'Technology' },
        { symbol: 'CSCO', name: 'Cisco Systems', lat: 37.4086, lng: -121.9537, city: 'San Jose, CA', sector: 'Technology' },
        { symbol: 'IBM', name: 'IBM Corp.', lat: 41.1084, lng: -73.7203, city: 'Armonk, NY', sector: 'Technology' },
        { symbol: 'AVGO', name: 'Broadcom Inc.', lat: 37.3861, lng: -121.9636, city: 'San Jose, CA', sector: 'Technology' },
        { symbol: 'TXN', name: 'Texas Instruments', lat: 32.9070, lng: -96.7503, city: 'Dallas, TX', sector: 'Technology' },
        { symbol: 'QCOM', name: 'Qualcomm Inc.', lat: 32.8998, lng: -117.2000, city: 'San Diego, CA', sector: 'Technology' },
        { symbol: 'NOW', name: 'ServiceNow Inc.', lat: 37.3861, lng: -121.9636, city: 'San Jose, CA', sector: 'Technology' },
        { symbol: 'INTU', name: 'Intuit Inc.', lat: 37.3861, lng: -121.9636, city: 'San Jose, CA', sector: 'Technology' },
        { symbol: 'AMAT', name: 'Applied Materials', lat: 37.3861, lng: -121.9636, city: 'San Jose, CA', sector: 'Technology' },
        { symbol: 'PANW', name: 'Palo Alto Networks', lat: 37.3861, lng: -121.9636, city: 'San Jose, CA', sector: 'Technology' },
        { symbol: 'SNPS', name: 'Synopsys Inc.', lat: 37.3707, lng: -122.0375, city: 'Sunnyvale, CA', sector: 'Technology' },
        { symbol: 'CDNS', name: 'Cadence Design', lat: 37.3861, lng: -121.9636, city: 'San Jose, CA', sector: 'Technology' },
        { symbol: 'KLAC', name: 'KLA Corp.', lat: 37.0298, lng: -122.0622, city: 'Milpitas, CA', sector: 'Technology' },
        { symbol: 'LRCX', name: 'Lam Research', lat: 37.4094, lng: -121.9466, city: 'Fremont, CA', sector: 'Technology' },
        { symbol: 'MRVL', name: 'Marvell Technology', lat: 37.3974, lng: -121.9466, city: 'Wilmington, DE', sector: 'Technology' },
        { symbol: 'FTNT', name: 'Fortinet Inc.', lat: 37.3707, lng: -122.0375, city: 'Sunnyvale, CA', sector: 'Technology' },
        { symbol: 'WDAY', name: 'Workday Inc.', lat: 37.5485, lng: -122.0680, city: 'Pleasanton, CA', sector: 'Technology' },
        { symbol: 'TEAM', name: 'Atlassian Corp.', lat: 37.7749, lng: -122.4194, city: 'San Francisco, CA', sector: 'Technology' },
        { symbol: 'SNOW', name: 'Snowflake Inc.', lat: 43.6150, lng: -116.2023, city: 'Bozeman, MT', sector: 'Technology' },
        { symbol: 'DDOG', name: 'Datadog Inc.', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Technology' },
        { symbol: 'ZS', name: 'Zscaler Inc.', lat: 37.3861, lng: -121.9636, city: 'San Jose, CA', sector: 'Technology' },
        { symbol: 'CRWD', name: 'CrowdStrike', lat: 30.2672, lng: -97.7431, city: 'Austin, TX', sector: 'Technology' },
        { symbol: 'NET', name: 'Cloudflare Inc.', lat: 37.7749, lng: -122.4194, city: 'San Francisco, CA', sector: 'Technology' },
        { symbol: 'HUBS', name: 'HubSpot Inc.', lat: 42.3654, lng: -71.0640, city: 'Cambridge, MA', sector: 'Technology' },
        { symbol: 'MDB', name: 'MongoDB Inc.', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Technology' },
        { symbol: 'VEEV', name: 'Veeva Systems', lat: 37.5485, lng: -122.0680, city: 'Pleasanton, CA', sector: 'Technology' },
        { symbol: 'SPLK', name: 'Splunk Inc.', lat: 37.7749, lng: -122.4194, city: 'San Francisco, CA', sector: 'Technology' },
        { symbol: 'OKTA', name: 'Okta Inc.', lat: 37.7749, lng: -122.4194, city: 'San Francisco, CA', sector: 'Technology' },
        { symbol: 'TTD', name: 'The Trade Desk', lat: 34.4380, lng: -119.7674, city: 'Ventura, CA', sector: 'Technology' },
        { symbol: 'TWLO', name: 'Twilio Inc.', lat: 37.7749, lng: -122.4194, city: 'San Francisco, CA', sector: 'Technology' },
        { symbol: 'SQ', name: 'Block Inc.', lat: 37.7749, lng: -122.4194, city: 'San Francisco, CA', sector: 'Technology' },
        { symbol: 'SHOP', name: 'Shopify Inc.', lat: 45.4215, lng: -75.6972, city: 'Ottawa, ON', sector: 'Technology' },
        { symbol: 'UBER', name: 'Uber Technologies', lat: 37.7749, lng: -122.4194, city: 'San Francisco, CA', sector: 'Technology' },
        { symbol: 'LYFT', name: 'Lyft Inc.', lat: 37.7749, lng: -122.4194, city: 'San Francisco, CA', sector: 'Technology' },
        { symbol: 'ABNB', name: 'Airbnb Inc.', lat: 37.7749, lng: -122.4194, city: 'San Francisco, CA', sector: 'Technology' },
        { symbol: 'COIN', name: 'Coinbase Global', lat: 37.7749, lng: -122.4194, city: 'San Francisco, CA', sector: 'Finance' },
        { symbol: 'PLTR', name: 'Palantir Technologies', lat: 39.7392, lng: -104.9903, city: 'Denver, CO', sector: 'Technology' },
        { symbol: 'U', name: 'Unity Software', lat: 37.7749, lng: -122.4194, city: 'San Francisco, CA', sector: 'Technology' },
        { symbol: 'PATH', name: 'UiPath Inc.', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Technology' },
        { symbol: 'PAYC', name: 'Paycom Software', lat: 35.4676, lng: -97.5164, city: 'Oklahoma City, OK', sector: 'Technology' },
        { symbol: 'PCTY', name: 'Paylocity', lat: 42.0884, lng: -87.9806, city: 'Schaumburg, IL', sector: 'Technology' },
        { symbol: 'DST', name: 'DST Systems', lat: 39.0997, lng: -94.5786, city: 'Kansas City, MO', sector: 'Technology' },
        { symbol: 'EPAM', name: 'EPAM Systems', lat: 40.5362, lng: -74.1839, city: 'Newtown, PA', sector: 'Technology' },
        { symbol: 'GDDY', name: 'GoDaddy Inc.', lat: 33.4255, lng: -111.9400, city: 'Tempe, AZ', sector: 'Technology' },
        { symbol: 'GEN', name: 'Gen Digital', lat: 33.4255, lng: -111.9400, city: 'Tempe, AZ', sector: 'Technology' },
        { symbol: 'WEX', name: 'WEX Inc.', lat: 43.6591, lng: -70.2568, city: 'Portland, ME', sector: 'Technology' },
        { symbol: 'JKHY', name: 'Jack Henry & Assoc.', lat: 36.8381, lng: -93.2916, city: 'Monett, MO', sector: 'Technology' },
        { symbol: 'SMAR', name: 'Smartsheet Inc.', lat: 47.6159, lng: -122.2040, city: 'Bellevue, WA', sector: 'Technology' },
        { symbol: 'MANH', name: 'Manhattan Associates', lat: 33.9304, lng: -84.3733, city: 'Atlanta, GA', sector: 'Technology' },
        { symbol: 'DOCU', name: 'DocuSign Inc.', lat: 37.7749, lng: -122.4194, city: 'San Francisco, CA', sector: 'Technology' },
        { symbol: 'ZM', name: 'Zoom Video', lat: 37.3861, lng: -121.9636, city: 'San Jose, CA', sector: 'Technology' },
        { symbol: 'PINS', name: 'Pinterest Inc.', lat: 37.7749, lng: -122.4194, city: 'San Francisco, CA', sector: 'Technology' },
        { symbol: 'SNAP', name: 'Snap Inc.', lat: 34.0195, lng: -118.4912, city: 'Santa Monica, CA', sector: 'Technology' },
        { symbol: 'ROKU', name: 'Roku Inc.', lat: 37.3861, lng: -121.9636, city: 'San Jose, CA', sector: 'Technology' },
        { symbol: 'BILL', name: 'BILL Holdings', lat: 37.3861, lng: -121.9636, city: 'San Jose, CA', sector: 'Technology' },
        { symbol: 'ESTC', name: 'Elastic N.V.', lat: 37.3861, lng: -121.9636, city: 'San Jose, CA', sector: 'Technology' },
        { symbol: 'CFLT', name: 'Confluent Inc.', lat: 37.3861, lng: -121.9636, city: 'San Jose, CA', sector: 'Technology' },
        { symbol: 'ASAN', name: 'Asana Inc.', lat: 37.7749, lng: -122.4194, city: 'San Francisco, CA', sector: 'Technology' },
        { symbol: 'APP', name: 'AppLovin Corp.', lat: 37.4419, lng: -122.1430, city: 'Palo Alto, CA', sector: 'Technology' },
        { symbol: 'RBLX', name: 'Roblox Corp.', lat: 37.4132, lng: -122.1305, city: 'San Mateo, CA', sector: 'Technology' },
        { symbol: 'HPE', name: 'Hewlett Packard Enterprise', lat: 29.7604, lng: -95.3698, city: 'Houston, TX', sector: 'Technology' },
        { symbol: 'HPQ', name: 'HP Inc.', lat: 37.4419, lng: -122.1430, city: 'Palo Alto, CA', sector: 'Technology' },
        { symbol: 'DELL', name: 'Dell Technologies', lat: 30.4374, lng: -97.7586, city: 'Round Rock, TX', sector: 'Technology' },
        { symbol: 'STX', name: 'Seagate Technology', lat: 37.4094, lng: -121.9466, city: 'Fremont, CA', sector: 'Technology' },
        { symbol: 'WDC', name: 'Western Digital', lat: 37.3861, lng: -121.9636, city: 'San Jose, CA', sector: 'Technology' },
        { symbol: 'NTAP', name: 'NetApp Inc.', lat: 37.3861, lng: -121.9636, city: 'San Jose, CA', sector: 'Technology' },
        { symbol: 'AKAM', name: 'Akamai Technologies', lat: 42.3654, lng: -71.0640, city: 'Cambridge, MA', sector: 'Technology' },
        { symbol: 'JNPR', name: 'Juniper Networks', lat: 37.3707, lng: -122.0375, city: 'Sunnyvale, CA', sector: 'Technology' },
        { symbol: 'FFIV', name: 'F5 Inc.', lat: 47.6062, lng: -122.3321, city: 'Seattle, WA', sector: 'Technology' },
        { symbol: 'CDW', name: 'CDW Corp.', lat: 41.8993, lng: -88.0117, city: 'Lincolnshire, IL', sector: 'Technology' },
        { symbol: 'IT', name: 'Gartner Inc.', lat: 41.0534, lng: -73.5387, city: 'Stamford, CT', sector: 'Technology' },
        // === Finance ===
        { symbol: 'JPM', name: 'JPMorgan Chase', lat: 40.7558, lng: -73.9762, city: 'New York, NY', sector: 'Finance' },
        { symbol: 'BAC', name: 'Bank of America', lat: 35.2271, lng: -80.8431, city: 'Charlotte, NC', sector: 'Finance' },
        { symbol: 'WFC', name: 'Wells Fargo', lat: 37.7900, lng: -122.4006, city: 'San Francisco, CA', sector: 'Finance' },
        { symbol: 'GS', name: 'Goldman Sachs', lat: 40.7143, lng: -74.0146, city: 'New York, NY', sector: 'Finance' },
        { symbol: 'MS', name: 'Morgan Stanley', lat: 40.7614, lng: -73.9776, city: 'New York, NY', sector: 'Finance' },
        { symbol: 'V', name: 'Visa Inc.', lat: 37.5296, lng: -122.2656, city: 'San Francisco, CA', sector: 'Finance' },
        { symbol: 'MA', name: 'Mastercard Inc.', lat: 41.0520, lng: -73.5387, city: 'Purchase, NY', sector: 'Finance' },
        { symbol: 'AXP', name: 'American Express', lat: 40.7143, lng: -74.0060, city: 'New York, NY', sector: 'Finance' },
        { symbol: 'BRK.B', name: 'Berkshire Hathaway', lat: 41.2565, lng: -95.9345, city: 'Omaha, NE', sector: 'Finance' },
        { symbol: 'C', name: 'Citigroup Inc.', lat: 40.7209, lng: -74.0073, city: 'New York, NY', sector: 'Finance' },
        { symbol: 'SCHW', name: 'Charles Schwab', lat: 32.7555, lng: -97.3308, city: 'Westlake, TX', sector: 'Finance' },
        { symbol: 'BLK', name: 'BlackRock Inc.', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Finance' },
        { symbol: 'USB', name: 'U.S. Bancorp', lat: 44.9778, lng: -93.2650, city: 'Minneapolis, MN', sector: 'Finance' },
        { symbol: 'PNC', name: 'PNC Financial', lat: 40.4406, lng: -79.9959, city: 'Pittsburgh, PA', sector: 'Finance' },
        { symbol: 'TFC', name: 'Truist Financial', lat: 35.2271, lng: -80.8431, city: 'Charlotte, NC', sector: 'Finance' },
        { symbol: 'COF', name: 'Capital One', lat: 38.9339, lng: -77.1773, city: 'McLean, VA', sector: 'Finance' },
        { symbol: 'BK', name: 'Bank of New York Mellon', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Finance' },
        { symbol: 'STT', name: 'State Street Corp.', lat: 42.3601, lng: -71.0589, city: 'Boston, MA', sector: 'Finance' },
        { symbol: 'AIG', name: 'American Intl. Group', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Finance' },
        { symbol: 'MET', name: 'MetLife Inc.', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Finance' },
        { symbol: 'PRU', name: 'Prudential Financial', lat: 40.7357, lng: -74.1724, city: 'Newark, NJ', sector: 'Finance' },
        { symbol: 'ALL', name: 'Allstate Corp.', lat: 42.0884, lng: -87.9806, city: 'Northbrook, IL', sector: 'Finance' },
        { symbol: 'TRV', name: 'Travelers Companies', lat: 41.7658, lng: -72.6734, city: 'Hartford, CT', sector: 'Finance' },
        { symbol: 'AFL', name: 'Aflac Inc.', lat: 32.4610, lng: -84.9877, city: 'Columbus, GA', sector: 'Finance' },
        { symbol: 'CME', name: 'CME Group', lat: 41.8781, lng: -87.6298, city: 'Chicago, IL', sector: 'Finance' },
        { symbol: 'ICE', name: 'Intercontinental Exchange', lat: 33.7490, lng: -84.3880, city: 'Atlanta, GA', sector: 'Finance' },
        { symbol: 'MCO', name: "Moody's Corp.", lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Finance' },
        { symbol: 'SPGI', name: 'S&P Global', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Finance' },
        { symbol: 'MSCI', name: 'MSCI Inc.', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Finance' },
        { symbol: 'FIS', name: 'Fidelity National Info', lat: 30.3322, lng: -81.6557, city: 'Jacksonville, FL', sector: 'Finance' },
        { symbol: 'FISV', name: 'Fiserv Inc.', lat: 43.0389, lng: -87.9065, city: 'Milwaukee, WI', sector: 'Finance' },
        { symbol: 'PYPL', name: 'PayPal Holdings', lat: 37.3861, lng: -121.9636, city: 'San Jose, CA', sector: 'Finance' },
        { symbol: 'GPN', name: 'Global Payments', lat: 33.7490, lng: -84.3880, city: 'Atlanta, GA', sector: 'Finance' },
        { symbol: 'DFS', name: 'Discover Financial', lat: 41.8993, lng: -88.0117, city: 'Riverwoods, IL', sector: 'Finance' },
        { symbol: 'SYF', name: 'Synchrony Financial', lat: 41.0534, lng: -73.5387, city: 'Stamford, CT', sector: 'Finance' },
        { symbol: 'KEY', name: 'KeyCorp', lat: 41.4993, lng: -81.6944, city: 'Cleveland, OH', sector: 'Finance' },
        { symbol: 'RF', name: 'Regions Financial', lat: 33.5207, lng: -86.8025, city: 'Birmingham, AL', sector: 'Finance' },
        { symbol: 'CFG', name: 'Citizens Financial', lat: 41.8240, lng: -71.4128, city: 'Providence, RI', sector: 'Finance' },
        { symbol: 'HBAN', name: 'Huntington Bancshares', lat: 39.9612, lng: -82.9988, city: 'Columbus, OH', sector: 'Finance' },
        { symbol: 'FITB', name: 'Fifth Third Bancorp', lat: 39.1031, lng: -84.5120, city: 'Cincinnati, OH', sector: 'Finance' },
        { symbol: 'MTB', name: 'M&T Bank Corp.', lat: 42.8864, lng: -78.8784, city: 'Buffalo, NY', sector: 'Finance' },
        { symbol: 'ZION', name: 'Zions Bancorporation', lat: 40.7608, lng: -111.8910, city: 'Salt Lake City, UT', sector: 'Finance' },
        { symbol: 'CMA', name: 'Comerica Inc.', lat: 32.7767, lng: -96.7970, city: 'Dallas, TX', sector: 'Finance' },
        { symbol: 'FRC', name: 'First Republic Bank', lat: 37.7749, lng: -122.4194, city: 'San Francisco, CA', sector: 'Finance' },
        { symbol: 'SIVB', name: 'SVB Financial', lat: 37.3861, lng: -121.9636, city: 'San Jose, CA', sector: 'Finance' },
        { symbol: 'FNFG', name: 'First National Nebraska', lat: 41.2565, lng: -95.9345, city: 'Omaha, NE', sector: 'Finance' },
        { symbol: 'PRI', name: 'Principal Financial', lat: 41.5868, lng: -93.6250, city: 'Des Moines, IA', sector: 'Finance' },
        { symbol: 'WU', name: 'Western Union', lat: 39.5480, lng: -105.0040, city: 'Denver, CO', sector: 'Finance' },
        { symbol: 'NDAQ', name: 'Nasdaq Inc.', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Finance' },
        { symbol: 'CBOE', name: 'Cboe Global Markets', lat: 41.8781, lng: -87.6298, city: 'Chicago, IL', sector: 'Finance' },
        { symbol: 'RJF', name: 'Raymond James', lat: 27.7677, lng: -82.6403, city: 'St. Petersburg, FL', sector: 'Finance' },
        { symbol: 'AMG', name: 'Affiliated Managers', lat: 42.3601, lng: -71.0589, city: 'West Palm Beach, FL', sector: 'Finance' },
        { symbol: 'TROW', name: 'T. Rowe Price', lat: 39.2904, lng: -76.6122, city: 'Baltimore, MD', sector: 'Finance' },
        { symbol: 'IVZ', name: 'Invesco Ltd.', lat: 33.7490, lng: -84.3880, city: 'Atlanta, GA', sector: 'Finance' },
        { symbol: 'BEN', name: 'Franklin Resources', lat: 37.4132, lng: -122.1305, city: 'San Mateo, CA', sector: 'Finance' },
        { symbol: 'NTRS', name: 'Northern Trust', lat: 41.8781, lng: -87.6298, city: 'Chicago, IL', sector: 'Finance' },
        { symbol: 'L', name: 'Loews Corp.', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Finance' },
        { symbol: 'RE', name: 'Everest Group', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Finance' },
        { symbol: 'CINF', name: 'Cincinnati Financial', lat: 39.3498, lng: -84.5603, city: 'Fairfield, OH', sector: 'Finance' },
        // === Healthcare ===
        { symbol: 'JNJ', name: 'Johnson & Johnson', lat: 40.4774, lng: -74.4367, city: 'New Brunswick, NJ', sector: 'Healthcare' },
        { symbol: 'UNH', name: 'UnitedHealth Group', lat: 44.9561, lng: -93.3799, city: 'Minnetonka, MN', sector: 'Healthcare' },
        { symbol: 'PFE', name: 'Pfizer Inc.', lat: 40.7506, lng: -73.9749, city: 'New York, NY', sector: 'Healthcare' },
        { symbol: 'ABBV', name: 'AbbVie Inc.', lat: 42.2853, lng: -87.9532, city: 'North Chicago, IL', sector: 'Healthcare' },
        { symbol: 'MRK', name: 'Merck & Co.', lat: 40.7075, lng: -74.4065, city: 'Rahway, NJ', sector: 'Healthcare' },
        { symbol: 'LLY', name: 'Eli Lilly', lat: 39.7684, lng: -86.1581, city: 'Indianapolis, IN', sector: 'Healthcare' },
        { symbol: 'TMO', name: 'Thermo Fisher', lat: 42.4907, lng: -71.2745, city: 'Waltham, MA', sector: 'Healthcare' },
        { symbol: 'ABT', name: 'Abbott Labs', lat: 42.2847, lng: -87.8510, city: 'Abbott Park, IL', sector: 'Healthcare' },
        { symbol: 'DHR', name: 'Danaher Corp.', lat: 38.9072, lng: -77.0369, city: 'Washington, DC', sector: 'Healthcare' },
        { symbol: 'BMY', name: 'Bristol-Myers Squibb', lat: 40.4862, lng: -74.4518, city: 'New Brunswick, NJ', sector: 'Healthcare' },
        { symbol: 'AMGN', name: 'Amgen Inc.', lat: 34.1808, lng: -118.8765, city: 'Thousand Oaks, CA', sector: 'Healthcare' },
        { symbol: 'GILD', name: 'Gilead Sciences', lat: 37.5311, lng: -122.2604, city: 'Foster City, CA', sector: 'Healthcare' },
        { symbol: 'ISRG', name: 'Intuitive Surgical', lat: 37.3707, lng: -122.0375, city: 'Sunnyvale, CA', sector: 'Healthcare' },
        { symbol: 'VRTX', name: 'Vertex Pharmaceuticals', lat: 42.3601, lng: -71.0589, city: 'Boston, MA', sector: 'Healthcare' },
        { symbol: 'REGN', name: 'Regeneron Pharma', lat: 41.0690, lng: -73.8587, city: 'Tarrytown, NY', sector: 'Healthcare' },
        { symbol: 'ZTS', name: 'Zoetis Inc.', lat: 40.5362, lng: -74.1839, city: 'Parsippany, NJ', sector: 'Healthcare' },
        { symbol: 'BSX', name: 'Boston Scientific', lat: 42.2808, lng: -71.2275, city: 'Marlborough, MA', sector: 'Healthcare' },
        { symbol: 'MDT', name: 'Medtronic plc', lat: 44.9778, lng: -93.2650, city: 'Minneapolis, MN', sector: 'Healthcare' },
        { symbol: 'SYK', name: 'Stryker Corp.', lat: 42.2917, lng: -85.5872, city: 'Kalamazoo, MI', sector: 'Healthcare' },
        { symbol: 'BDX', name: 'Becton Dickinson', lat: 40.9176, lng: -74.1719, city: 'Franklin Lakes, NJ', sector: 'Healthcare' },
        { symbol: 'EW', name: 'Edwards Lifesciences', lat: 33.6846, lng: -117.8265, city: 'Irvine, CA', sector: 'Healthcare' },
        { symbol: 'CI', name: 'Cigna Group', lat: 41.1136, lng: -73.2651, city: 'Bloomfield, CT', sector: 'Healthcare' },
        { symbol: 'ELV', name: 'Elevance Health', lat: 39.7684, lng: -86.1581, city: 'Indianapolis, IN', sector: 'Healthcare' },
        { symbol: 'HUM', name: 'Humana Inc.', lat: 38.2527, lng: -85.7585, city: 'Louisville, KY', sector: 'Healthcare' },
        { symbol: 'CNC', name: 'Centene Corp.', lat: 38.6270, lng: -90.1994, city: 'St. Louis, MO', sector: 'Healthcare' },
        { symbol: 'HCA', name: 'HCA Healthcare', lat: 36.1627, lng: -86.7816, city: 'Nashville, TN', sector: 'Healthcare' },
        { symbol: 'MCK', name: 'McKesson Corp.', lat: 32.8140, lng: -96.9489, city: 'Irving, TX', sector: 'Healthcare' },
        { symbol: 'CAH', name: 'Cardinal Health', lat: 39.9612, lng: -82.9988, city: 'Columbus, OH', sector: 'Healthcare' },
        { symbol: 'ABC', name: 'AmerisourceBergen', lat: 40.0740, lng: -75.0159, city: 'Conshohocken, PA', sector: 'Healthcare' },
        { symbol: 'A', name: 'Agilent Technologies', lat: 37.3861, lng: -121.9636, city: 'Santa Clara, CA', sector: 'Healthcare' },
        { symbol: 'IQV', name: 'IQVIA Holdings', lat: 35.9940, lng: -78.8986, city: 'Durham, NC', sector: 'Healthcare' },
        { symbol: 'DGX', name: 'Quest Diagnostics', lat: 39.7392, lng: -104.9903, city: 'Secaucus, NJ', sector: 'Healthcare' },
        { symbol: 'HOLX', name: 'Hologic Inc.', lat: 42.2808, lng: -71.2275, city: 'Marlborough, MA', sector: 'Healthcare' },
        { symbol: 'IDXX', name: 'IDEXX Laboratories', lat: 43.7263, lng: -70.3563, city: 'Westbrook, ME', sector: 'Healthcare' },
        { symbol: 'MTD', name: 'Mettler-Toledo', lat: 39.9612, lng: -82.9988, city: 'Columbus, OH', sector: 'Healthcare' },
        { symbol: 'WAT', name: 'Waters Corp.', lat: 42.2808, lng: -71.2275, city: 'Milford, MA', sector: 'Healthcare' },
        { symbol: 'BAX', name: 'Baxter International', lat: 42.1711, lng: -87.8445, city: 'Deerfield, IL', sector: 'Healthcare' },
        { symbol: 'CERN', name: 'Cerner Corp.', lat: 39.0119, lng: -94.6244, city: 'Kansas City, MO', sector: 'Healthcare' },
        { symbol: 'ALGN', name: 'Align Technology', lat: 37.3861, lng: -121.9636, city: 'San Jose, CA', sector: 'Healthcare' },
        { symbol: 'DXCM', name: 'DexCom Inc.', lat: 32.7157, lng: -117.1611, city: 'San Diego, CA', sector: 'Healthcare' },
        { symbol: 'MRNA', name: 'Moderna Inc.', lat: 42.3654, lng: -71.0640, city: 'Cambridge, MA', sector: 'Healthcare' },
        { symbol: 'BIIB', name: 'Biogen Inc.', lat: 42.3654, lng: -71.0640, city: 'Cambridge, MA', sector: 'Healthcare' },
        // === Consumer / Retail ===
        { symbol: 'WMT', name: 'Walmart Inc.', lat: 36.3729, lng: -94.2088, city: 'Bentonville, AR', sector: 'Retail' },
        { symbol: 'PG', name: 'Procter & Gamble', lat: 39.1031, lng: -84.5120, city: 'Cincinnati, OH', sector: 'Consumer' },
        { symbol: 'KO', name: 'Coca-Cola Co.', lat: 33.7676, lng: -84.3880, city: 'Atlanta, GA', sector: 'Consumer' },
        { symbol: 'PEP', name: 'PepsiCo Inc.', lat: 41.0452, lng: -73.5331, city: 'Purchase, NY', sector: 'Consumer' },
        { symbol: 'COST', name: 'Costco Wholesale', lat: 47.5826, lng: -122.1543, city: 'Issaquah, WA', sector: 'Retail' },
        { symbol: 'HD', name: 'Home Depot', lat: 33.8709, lng: -84.4684, city: 'Atlanta, GA', sector: 'Retail' },
        { symbol: 'NKE', name: 'Nike Inc.', lat: 45.5087, lng: -122.8281, city: 'Beaverton, OR', sector: 'Consumer' },
        { symbol: 'MCD', name: "McDonald's Corp.", lat: 41.8850, lng: -87.8893, city: 'Chicago, IL', sector: 'Consumer' },
        { symbol: 'SBUX', name: 'Starbucks Corp.', lat: 47.5809, lng: -122.3359, city: 'Seattle, WA', sector: 'Consumer' },
        { symbol: 'TGT', name: 'Target Corp.', lat: 44.9286, lng: -93.2439, city: 'Minneapolis, MN', sector: 'Retail' },
        { symbol: 'LOW', name: "Lowe's Companies", lat: 35.4399, lng: -80.8560, city: 'Mooresville, NC', sector: 'Retail' },
        { symbol: 'TJX', name: 'TJX Companies', lat: 42.3188, lng: -71.0846, city: 'Framingham, MA', sector: 'Retail' },
        { symbol: 'ROST', name: 'Ross Stores', lat: 37.5485, lng: -122.0680, city: 'Dublin, CA', sector: 'Retail' },
        { symbol: 'DG', name: 'Dollar General', lat: 36.2710, lng: -86.2091, city: 'Goodlettsville, TN', sector: 'Retail' },
        { symbol: 'DLTR', name: 'Dollar Tree', lat: 36.8529, lng: -75.9780, city: 'Chesapeake, VA', sector: 'Retail' },
        { symbol: 'ORLY', name: "O'Reilly Automotive", lat: 37.2089, lng: -93.2923, city: 'Springfield, MO', sector: 'Retail' },
        { symbol: 'AZO', name: 'AutoZone Inc.', lat: 35.1495, lng: -90.0490, city: 'Memphis, TN', sector: 'Retail' },
        { symbol: 'BBY', name: 'Best Buy Co.', lat: 44.8848, lng: -93.2438, city: 'Richfield, MN', sector: 'Retail' },
        { symbol: 'KR', name: 'Kroger Co.', lat: 39.1031, lng: -84.5120, city: 'Cincinnati, OH', sector: 'Retail' },
        { symbol: 'ACI', name: 'Albertsons Companies', lat: 43.6150, lng: -116.2023, city: 'Boise, ID', sector: 'Retail' },
        { symbol: 'SYY', name: 'Sysco Corp.', lat: 29.7604, lng: -95.3698, city: 'Houston, TX', sector: 'Consumer' },
        { symbol: 'GIS', name: 'General Mills', lat: 44.9778, lng: -93.2650, city: 'Minneapolis, MN', sector: 'Consumer' },
        { symbol: 'K', name: 'Kellanova', lat: 41.9531, lng: -85.5920, city: 'Battle Creek, MI', sector: 'Consumer' },
        { symbol: 'KHC', name: 'Kraft Heinz Co.', lat: 41.8781, lng: -87.6298, city: 'Chicago, IL', sector: 'Consumer' },
        { symbol: 'HSY', name: 'Hershey Co.', lat: 40.2862, lng: -76.6505, city: 'Hershey, PA', sector: 'Consumer' },
        { symbol: 'MDLZ', name: 'Mondelez Intl.', lat: 41.8781, lng: -87.6298, city: 'Chicago, IL', sector: 'Consumer' },
        { symbol: 'ADM', name: 'Archer Daniels Midland', lat: 39.8403, lng: -88.9548, city: 'Decatur, IL', sector: 'Consumer' },
        { symbol: 'CL', name: 'Colgate-Palmolive', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Consumer' },
        { symbol: 'EL', name: 'Estee Lauder', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Consumer' },
        { symbol: 'CLX', name: 'Clorox Co.', lat: 37.8044, lng: -122.2712, city: 'Oakland, CA', sector: 'Consumer' },
        { symbol: 'SJM', name: 'J.M. Smucker', lat: 40.8173, lng: -81.3784, city: 'Orrville, OH', sector: 'Consumer' },
        { symbol: 'CAG', name: 'Conagra Brands', lat: 41.8781, lng: -87.6298, city: 'Chicago, IL', sector: 'Consumer' },
        { symbol: 'HRL', name: 'Hormel Foods', lat: 43.6783, lng: -92.9747, city: 'Austin, MN', sector: 'Consumer' },
        { symbol: 'CPB', name: 'Campbell Soup', lat: 39.9526, lng: -75.1252, city: 'Camden, NJ', sector: 'Consumer' },
        { symbol: 'MKC', name: 'McCormick & Co.', lat: 39.4632, lng: -76.3163, city: 'Hunt Valley, MD', sector: 'Consumer' },
        { symbol: 'TSN', name: 'Tyson Foods', lat: 36.1867, lng: -94.1288, city: 'Springdale, AR', sector: 'Consumer' },
        { symbol: 'STZ', name: 'Constellation Brands', lat: 42.8982, lng: -77.0115, city: 'Victor, NY', sector: 'Consumer' },
        { symbol: 'BF.B', name: 'Brown-Forman', lat: 38.2527, lng: -85.7585, city: 'Louisville, KY', sector: 'Consumer' },
        { symbol: 'TAP', name: 'Molson Coors', lat: 39.7392, lng: -104.9903, city: 'Denver, CO', sector: 'Consumer' },
        { symbol: 'SAM', name: 'Boston Beer Co.', lat: 42.3601, lng: -71.0589, city: 'Boston, MA', sector: 'Consumer' },
        { symbol: 'PM', name: 'Philip Morris Intl.', lat: 41.0534, lng: -73.5387, city: 'Stamford, CT', sector: 'Consumer' },
        { symbol: 'MO', name: 'Altria Group', lat: 37.5407, lng: -77.4360, city: 'Richmond, VA', sector: 'Consumer' },
        { symbol: 'YUM', name: 'Yum! Brands', lat: 38.2527, lng: -85.7585, city: 'Louisville, KY', sector: 'Consumer' },
        { symbol: 'QSR', name: 'Restaurant Brands Intl.', lat: 25.7617, lng: -80.1918, city: 'Miami, FL', sector: 'Consumer' },
        { symbol: 'DPZ', name: "Domino's Pizza", lat: 42.3314, lng: -83.0458, city: 'Ann Arbor, MI', sector: 'Consumer' },
        { symbol: 'CMG', name: 'Chipotle Mexican Grill', lat: 38.8816, lng: -77.0910, city: 'Newport Beach, CA', sector: 'Consumer' },
        { symbol: 'DARDEN', name: 'Darden Restaurants', lat: 28.5383, lng: -81.3792, city: 'Orlando, FL', sector: 'Consumer' },
        { symbol: 'GIII', name: 'G-III Apparel', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Consumer' },
        { symbol: 'VFC', name: 'VF Corp.', lat: 39.7392, lng: -104.9903, city: 'Denver, CO', sector: 'Consumer' },
        { symbol: 'PVH', name: 'PVH Corp.', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Consumer' },
        { symbol: 'RL', name: 'Ralph Lauren', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Consumer' },
        { symbol: 'TPR', name: 'Tapestry Inc.', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Consumer' },
        { symbol: 'LULU', name: 'Lululemon', lat: 49.2827, lng: -123.1207, city: 'Vancouver, BC', sector: 'Consumer' },
        { symbol: 'GPS', name: 'Gap Inc.', lat: 37.7749, lng: -122.4194, city: 'San Francisco, CA', sector: 'Retail' },
        { symbol: 'ANF', name: 'Abercrombie & Fitch', lat: 40.0992, lng: -82.8013, city: 'New Albany, OH', sector: 'Retail' },
        { symbol: 'ULTA', name: 'Ulta Beauty', lat: 42.1086, lng: -88.0464, city: 'Bolingbrook, IL', sector: 'Retail' },
        { symbol: 'FIVE', name: 'Five Below', lat: 39.9526, lng: -75.1652, city: 'Philadelphia, PA', sector: 'Retail' },
        { symbol: 'TSCO', name: 'Tractor Supply', lat: 36.3074, lng: -86.6252, city: 'Brentwood, TN', sector: 'Retail' },
        { symbol: 'WSM', name: 'Williams-Sonoma', lat: 37.7749, lng: -122.4194, city: 'San Francisco, CA', sector: 'Retail' },
        { symbol: 'RH', name: 'RH (Restoration Hardware)', lat: 37.5860, lng: -122.3491, city: 'Corte Madera, CA', sector: 'Retail' },
        { symbol: 'ETSY', name: 'Etsy Inc.', lat: 40.7128, lng: -74.0060, city: 'Brooklyn, NY', sector: 'Retail' },
        { symbol: 'W', name: 'Wayfair Inc.', lat: 42.3601, lng: -71.0589, city: 'Boston, MA', sector: 'Retail' },
        { symbol: 'CHWY', name: 'Chewy Inc.', lat: 27.7677, lng: -82.6403, city: 'Dania Beach, FL', sector: 'Retail' },
        // === Energy ===
        { symbol: 'XOM', name: 'Exxon Mobil', lat: 32.8140, lng: -96.9489, city: 'Irving, TX', sector: 'Energy' },
        { symbol: 'CVX', name: 'Chevron Corp.', lat: 37.7577, lng: -122.0466, city: 'San Ramon, CA', sector: 'Energy' },
        { symbol: 'COP', name: 'ConocoPhillips', lat: 29.7604, lng: -95.3698, city: 'Houston, TX', sector: 'Energy' },
        { symbol: 'SLB', name: 'Schlumberger', lat: 29.7604, lng: -95.3698, city: 'Houston, TX', sector: 'Energy' },
        { symbol: 'OXY', name: 'Occidental Petroleum', lat: 29.7604, lng: -95.3698, city: 'Houston, TX', sector: 'Energy' },
        { symbol: 'EOG', name: 'EOG Resources', lat: 29.7604, lng: -95.3698, city: 'Houston, TX', sector: 'Energy' },
        { symbol: 'PXD', name: 'Pioneer Natural Resources', lat: 32.0000, lng: -102.0974, city: 'Midland, TX', sector: 'Energy' },
        { symbol: 'MPC', name: 'Marathon Petroleum', lat: 39.3498, lng: -84.2261, city: 'Findlay, OH', sector: 'Energy' },
        { symbol: 'VLO', name: 'Valero Energy', lat: 29.4241, lng: -98.4936, city: 'San Antonio, TX', sector: 'Energy' },
        { symbol: 'PSX', name: 'Phillips 66', lat: 29.7604, lng: -95.3698, city: 'Houston, TX', sector: 'Energy' },
        { symbol: 'HAL', name: 'Halliburton Co.', lat: 29.7604, lng: -95.3698, city: 'Houston, TX', sector: 'Energy' },
        { symbol: 'BKR', name: 'Baker Hughes', lat: 29.7604, lng: -95.3698, city: 'Houston, TX', sector: 'Energy' },
        { symbol: 'FANG', name: 'Diamondback Energy', lat: 32.0000, lng: -102.0974, city: 'Midland, TX', sector: 'Energy' },
        { symbol: 'DVN', name: 'Devon Energy', lat: 35.4676, lng: -97.5164, city: 'Oklahoma City, OK', sector: 'Energy' },
        { symbol: 'HES', name: 'Hess Corp.', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Energy' },
        { symbol: 'APA', name: 'APA Corp.', lat: 29.7604, lng: -95.3698, city: 'Houston, TX', sector: 'Energy' },
        { symbol: 'OKE', name: 'ONEOK Inc.', lat: 36.1540, lng: -95.9928, city: 'Tulsa, OK', sector: 'Energy' },
        { symbol: 'WMB', name: 'Williams Companies', lat: 36.1540, lng: -95.9928, city: 'Tulsa, OK', sector: 'Energy' },
        { symbol: 'KMI', name: 'Kinder Morgan', lat: 29.7604, lng: -95.3698, city: 'Houston, TX', sector: 'Energy' },
        { symbol: 'ET', name: 'Energy Transfer', lat: 32.7767, lng: -96.7970, city: 'Dallas, TX', sector: 'Energy' },
        { symbol: 'EPD', name: 'Enterprise Products', lat: 29.7604, lng: -95.3698, city: 'Houston, TX', sector: 'Energy' },
        { symbol: 'TRGP', name: 'Targa Resources', lat: 29.7604, lng: -95.3698, city: 'Houston, TX', sector: 'Energy' },
        { symbol: 'LNG', name: 'Cheniere Energy', lat: 29.7604, lng: -95.3698, city: 'Houston, TX', sector: 'Energy' },
        { symbol: 'DTM', name: 'DT Midstream', lat: 42.3314, lng: -83.0458, city: 'Detroit, MI', sector: 'Energy' },
        { symbol: 'CTRA', name: 'Coterra Energy', lat: 29.7604, lng: -95.3698, city: 'Houston, TX', sector: 'Energy' },
        { symbol: 'MRO', name: 'Marathon Oil', lat: 29.7604, lng: -95.3698, city: 'Houston, TX', sector: 'Energy' },
        // === Industrial ===
        { symbol: 'BA', name: 'Boeing Co.', lat: 41.8855, lng: -87.6465, city: 'Arlington, VA', sector: 'Industrial' },
        { symbol: 'CAT', name: 'Caterpillar Inc.', lat: 40.7160, lng: -89.6171, city: 'Deerfield, IL', sector: 'Industrial' },
        { symbol: 'GE', name: 'GE Aerospace', lat: 42.3654, lng: -71.0640, city: 'Evendale, OH', sector: 'Industrial' },
        { symbol: 'HON', name: 'Honeywell Intl.', lat: 35.2226, lng: -80.8373, city: 'Charlotte, NC', sector: 'Industrial' },
        { symbol: 'MMM', name: '3M Company', lat: 44.9493, lng: -92.9283, city: 'St. Paul, MN', sector: 'Industrial' },
        { symbol: 'UPS', name: 'United Parcel Service', lat: 33.8038, lng: -84.4074, city: 'Atlanta, GA', sector: 'Industrial' },
        { symbol: 'FDX', name: 'FedEx Corp.', lat: 35.1495, lng: -90.0490, city: 'Memphis, TN', sector: 'Industrial' },
        { symbol: 'UNP', name: 'Union Pacific', lat: 41.2587, lng: -95.9378, city: 'Omaha, NE', sector: 'Industrial' },
        { symbol: 'RTX', name: 'RTX Corp.', lat: 38.8816, lng: -77.0910, city: 'Arlington, VA', sector: 'Industrial' },
        { symbol: 'LMT', name: 'Lockheed Martin', lat: 38.9847, lng: -77.0947, city: 'Bethesda, MD', sector: 'Industrial' },
        { symbol: 'NOC', name: 'Northrop Grumman', lat: 38.9310, lng: -77.2320, city: 'Falls Church, VA', sector: 'Industrial' },
        { symbol: 'GD', name: 'General Dynamics', lat: 38.9586, lng: -77.3570, city: 'Reston, VA', sector: 'Industrial' },
        { symbol: 'HII', name: 'Huntington Ingalls', lat: 36.9768, lng: -76.4310, city: 'Newport News, VA', sector: 'Industrial' },
        { symbol: 'LHX', name: 'L3Harris Technologies', lat: 28.0836, lng: -80.6081, city: 'Melbourne, FL', sector: 'Industrial' },
        { symbol: 'EMR', name: 'Emerson Electric', lat: 38.6270, lng: -90.1994, city: 'St. Louis, MO', sector: 'Industrial' },
        { symbol: 'ETN', name: 'Eaton Corp.', lat: 39.9612, lng: -82.9988, city: 'Dublin, OH', sector: 'Industrial' },
        { symbol: 'ITW', name: 'Illinois Tool Works', lat: 42.0779, lng: -87.7871, city: 'Glenview, IL', sector: 'Industrial' },
        { symbol: 'DE', name: 'Deere & Company', lat: 41.5236, lng: -90.5776, city: 'Moline, IL', sector: 'Industrial' },
        { symbol: 'WM', name: 'Waste Management', lat: 29.7604, lng: -95.3698, city: 'Houston, TX', sector: 'Industrial' },
        { symbol: 'RSG', name: 'Republic Services', lat: 33.4484, lng: -112.0740, city: 'Phoenix, AZ', sector: 'Industrial' },
        { symbol: 'CSX', name: 'CSX Corp.', lat: 30.3322, lng: -81.6557, city: 'Jacksonville, FL', sector: 'Industrial' },
        { symbol: 'NSC', name: 'Norfolk Southern', lat: 33.7490, lng: -84.3880, city: 'Atlanta, GA', sector: 'Industrial' },
        { symbol: 'PCAR', name: 'PACCAR Inc.', lat: 47.6159, lng: -122.2040, city: 'Bellevue, WA', sector: 'Industrial' },
        { symbol: 'CMI', name: 'Cummins Inc.', lat: 39.2014, lng: -85.9214, city: 'Columbus, IN', sector: 'Industrial' },
        { symbol: 'PH', name: 'Parker-Hannifin', lat: 41.4993, lng: -81.6944, city: 'Cleveland, OH', sector: 'Industrial' },
        { symbol: 'ROK', name: 'Rockwell Automation', lat: 43.0389, lng: -87.9065, city: 'Milwaukee, WI', sector: 'Industrial' },
        { symbol: 'IR', name: 'Ingersoll Rand', lat: 33.0198, lng: -96.6989, city: 'Davidson, NC', sector: 'Industrial' },
        { symbol: 'DOV', name: 'Dover Corp.', lat: 42.1711, lng: -87.8445, city: 'Downers Grove, IL', sector: 'Industrial' },
        { symbol: 'CHRW', name: 'C.H. Robinson', lat: 44.9778, lng: -93.2650, city: 'Minneapolis, MN', sector: 'Industrial' },
        { symbol: 'SAIA', name: 'Saia Inc.', lat: 39.0997, lng: -94.5786, city: 'Kansas City, MO', sector: 'Industrial' },
        { symbol: 'ODFL', name: 'Old Dominion Freight', lat: 37.2710, lng: -79.9414, city: 'Thomasville, NC', sector: 'Industrial' },
        { symbol: 'JBHT', name: 'J.B. Hunt Transport', lat: 36.3540, lng: -94.2319, city: 'Lowell, AR', sector: 'Industrial' },
        { symbol: 'XYL', name: 'Xylem Inc.', lat: 38.9072, lng: -77.0369, city: 'Washington, DC', sector: 'Industrial' },
        { symbol: 'GNRC', name: 'Generac Holdings', lat: 42.8686, lng: -88.3435, city: 'Waukesha, WI', sector: 'Industrial' },
        { symbol: 'GWW', name: 'W.W. Grainger', lat: 42.1082, lng: -87.8647, city: 'Lake Forest, IL', sector: 'Industrial' },
        { symbol: 'FAST', name: 'Fastenal Co.', lat: 44.0121, lng: -91.6384, city: 'Winona, MN', sector: 'Industrial' },
        { symbol: 'SWK', name: 'Stanley Black & Decker', lat: 41.7658, lng: -72.6734, city: 'New Britain, CT', sector: 'Industrial' },
        { symbol: 'TT', name: 'Trane Technologies', lat: 40.7598, lng: -73.5387, city: 'Swords, Ireland', sector: 'Industrial' },
        { symbol: 'AME', name: 'AMETEK Inc.', lat: 40.1800, lng: -75.4562, city: 'Berwyn, PA', sector: 'Industrial' },
        { symbol: 'VRSK', name: 'Verisk Analytics', lat: 40.8150, lng: -74.0800, city: 'Jersey City, NJ', sector: 'Industrial' },
        // === Telecom & Media ===
        { symbol: 'T', name: 'AT&T Inc.', lat: 32.7897, lng: -96.8062, city: 'Dallas, TX', sector: 'Telecom' },
        { symbol: 'VZ', name: 'Verizon Comm.', lat: 40.7614, lng: -73.9776, city: 'New York, NY', sector: 'Telecom' },
        { symbol: 'TMUS', name: 'T-Mobile US', lat: 47.6159, lng: -122.2040, city: 'Bellevue, WA', sector: 'Telecom' },
        { symbol: 'CMCSA', name: 'Comcast Corp.', lat: 39.9536, lng: -75.1636, city: 'Philadelphia, PA', sector: 'Telecom' },
        { symbol: 'CHTR', name: 'Charter Communications', lat: 41.0534, lng: -73.5387, city: 'Stamford, CT', sector: 'Telecom' },
        { symbol: 'DISH', name: 'DISH Network', lat: 39.5501, lng: -105.0314, city: 'Englewood, CO', sector: 'Telecom' },
        { symbol: 'LUMN', name: 'Lumen Technologies', lat: 39.7683, lng: -104.8535, city: 'Monroe, LA', sector: 'Telecom' },
        { symbol: 'FTR', name: 'Frontier Communications', lat: 41.0534, lng: -73.5387, city: 'Stamford, CT', sector: 'Telecom' },
        { symbol: 'USM', name: 'U.S. Cellular', lat: 41.8781, lng: -87.6298, city: 'Chicago, IL', sector: 'Telecom' },
        { symbol: 'CABO', name: 'Cable One', lat: 33.4484, lng: -112.0740, city: 'Phoenix, AZ', sector: 'Telecom' },
        // === Entertainment ===
        { symbol: 'DIS', name: 'Walt Disney Co.', lat: 34.1562, lng: -118.3254, city: 'Burbank, CA', sector: 'Entertainment' },
        { symbol: 'WBD', name: 'Warner Bros. Discovery', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Entertainment' },
        { symbol: 'PARA', name: 'Paramount Global', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Entertainment' },
        { symbol: 'FOX', name: 'Fox Corp.', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Entertainment' },
        { symbol: 'NWSA', name: 'News Corp.', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Entertainment' },
        { symbol: 'LYV', name: 'Live Nation', lat: 34.1476, lng: -118.1445, city: 'Beverly Hills, CA', sector: 'Entertainment' },
        { symbol: 'IMAX', name: 'IMAX Corp.', lat: 34.0522, lng: -118.2437, city: 'Los Angeles, CA', sector: 'Entertainment' },
        { symbol: 'EA', name: 'Electronic Arts', lat: 37.5311, lng: -122.2604, city: 'Redwood City, CA', sector: 'Entertainment' },
        { symbol: 'TTWO', name: 'Take-Two Interactive', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Entertainment' },
        { symbol: 'ATVI', name: 'Activision Blizzard', lat: 34.0195, lng: -118.4912, city: 'Santa Monica, CA', sector: 'Entertainment' },
        // === Automotive ===
        { symbol: 'TSLA', name: 'Tesla Inc.', lat: 30.2235, lng: -97.6218, city: 'Austin, TX', sector: 'Automotive' },
        { symbol: 'GM', name: 'General Motors', lat: 42.3314, lng: -83.0458, city: 'Detroit, MI', sector: 'Automotive' },
        { symbol: 'F', name: 'Ford Motor Co.', lat: 42.3223, lng: -83.1763, city: 'Dearborn, MI', sector: 'Automotive' },
        { symbol: 'RIVN', name: 'Rivian Automotive', lat: 33.6846, lng: -117.8265, city: 'Irvine, CA', sector: 'Automotive' },
        { symbol: 'LCID', name: 'Lucid Group', lat: 37.4094, lng: -121.9466, city: 'Newark, CA', sector: 'Automotive' },
        { symbol: 'APTV', name: 'Aptiv PLC', lat: 42.3314, lng: -83.0458, city: 'Dublin, Ireland', sector: 'Automotive' },
        { symbol: 'BWA', name: 'BorgWarner', lat: 42.2847, lng: -87.8510, city: 'Auburn Hills, MI', sector: 'Automotive' },
        { symbol: 'LEA', name: 'Lear Corp.', lat: 42.4612, lng: -83.1332, city: 'Southfield, MI', sector: 'Automotive' },
        { symbol: 'ALV', name: 'Autoliv Inc.', lat: 42.4612, lng: -83.1332, city: 'Stockholm, Sweden', sector: 'Automotive' },
        { symbol: 'PCAR', name: 'PACCAR Inc.', lat: 47.6159, lng: -122.2040, city: 'Bellevue, WA', sector: 'Automotive' },
        { symbol: 'CMI', name: 'Cummins Inc.', lat: 39.2014, lng: -85.9214, city: 'Columbus, IN', sector: 'Automotive' },
        { symbol: 'ORLY', name: "O'Reilly Auto Parts", lat: 37.2089, lng: -93.2923, city: 'Springfield, MO', sector: 'Automotive' },
        // === Utilities ===
        { symbol: 'NEE', name: 'NextEra Energy', lat: 26.8849, lng: -80.0612, city: 'Juno Beach, FL', sector: 'Energy' },
        { symbol: 'DUK', name: 'Duke Energy', lat: 35.2271, lng: -80.8431, city: 'Charlotte, NC', sector: 'Energy' },
        { symbol: 'SO', name: 'Southern Company', lat: 33.7490, lng: -84.3880, city: 'Atlanta, GA', sector: 'Energy' },
        { symbol: 'D', name: 'Dominion Energy', lat: 37.5407, lng: -77.4360, city: 'Richmond, VA', sector: 'Energy' },
        { symbol: 'AEP', name: 'American Electric Power', lat: 39.9612, lng: -82.9988, city: 'Columbus, OH', sector: 'Energy' },
        { symbol: 'EXC', name: 'Exelon Corp.', lat: 41.8781, lng: -87.6298, city: 'Chicago, IL', sector: 'Energy' },
        { symbol: 'SRE', name: 'Sempra Energy', lat: 32.7157, lng: -117.1611, city: 'San Diego, CA', sector: 'Energy' },
        { symbol: 'PCG', name: 'PG&E Corp.', lat: 37.8044, lng: -122.2712, city: 'Oakland, CA', sector: 'Energy' },
        { symbol: 'ED', name: 'Consolidated Edison', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Energy' },
        { symbol: 'WEC', name: 'WEC Energy', lat: 43.0389, lng: -87.9065, city: 'Milwaukee, WI', sector: 'Energy' },
        { symbol: 'ES', name: 'Eversource Energy', lat: 41.7658, lng: -72.6734, city: 'Hartford, CT', sector: 'Energy' },
        { symbol: 'XEL', name: 'Xcel Energy', lat: 44.9778, lng: -93.2650, city: 'Minneapolis, MN', sector: 'Energy' },
        { symbol: 'AWK', name: 'American Water Works', lat: 39.9526, lng: -75.1652, city: 'Camden, NJ', sector: 'Energy' },
        { symbol: 'DTE', name: 'DTE Energy', lat: 42.3314, lng: -83.0458, city: 'Detroit, MI', sector: 'Energy' },
        { symbol: 'PPL', name: 'PPL Corp.', lat: 40.6023, lng: -75.4714, city: 'Allentown, PA', sector: 'Energy' },
        { symbol: 'FE', name: 'FirstEnergy Corp.', lat: 41.1468, lng: -81.3437, city: 'Akron, OH', sector: 'Energy' },
        { symbol: 'CMS', name: 'CMS Energy', lat: 42.7654, lng: -84.5636, city: 'Jackson, MI', sector: 'Energy' },
        { symbol: 'AEE', name: 'Ameren Corp.', lat: 38.6270, lng: -90.1994, city: 'St. Louis, MO', sector: 'Energy' },
        { symbol: 'EVRG', name: 'Evergy Inc.', lat: 39.0997, lng: -94.5786, city: 'Kansas City, MO', sector: 'Energy' },
        { symbol: 'ATO', name: 'Atmos Energy', lat: 32.7767, lng: -96.7970, city: 'Dallas, TX', sector: 'Energy' },
        { symbol: 'NI', name: 'NiSource Inc.', lat: 41.0736, lng: -85.1394, city: 'Merrillville, IN', sector: 'Energy' },
        // === Real Estate / Other ===
        { symbol: 'AMT', name: 'American Tower', lat: 42.3601, lng: -71.0589, city: 'Boston, MA', sector: 'Industrial' },
        { symbol: 'PLD', name: 'Prologis Inc.', lat: 37.7749, lng: -122.4194, city: 'San Francisco, CA', sector: 'Industrial' },
        { symbol: 'CCI', name: 'Crown Castle', lat: 29.7604, lng: -95.3698, city: 'Houston, TX', sector: 'Industrial' },
        { symbol: 'EQIX', name: 'Equinix Inc.', lat: 37.5311, lng: -122.2604, city: 'Redwood City, CA', sector: 'Technology' },
        { symbol: 'SPG', name: 'Simon Property Group', lat: 39.7684, lng: -86.1581, city: 'Indianapolis, IN', sector: 'Finance' },
        { symbol: 'PSA', name: 'Public Storage', lat: 34.0736, lng: -118.3998, city: 'Glendale, CA', sector: 'Finance' },
        { symbol: 'WELL', name: 'Welltower Inc.', lat: 41.4993, lng: -81.6944, city: 'Toledo, OH', sector: 'Healthcare' },
        { symbol: 'AVB', name: 'AvalonBay Communities', lat: 38.8816, lng: -77.0910, city: 'Arlington, VA', sector: 'Finance' },
        { symbol: 'DLR', name: 'Digital Realty', lat: 30.2672, lng: -97.7431, city: 'Austin, TX', sector: 'Technology' },
        { symbol: 'O', name: 'Realty Income', lat: 32.7157, lng: -117.1611, city: 'San Diego, CA', sector: 'Finance' },
        { symbol: 'VICI', name: 'VICI Properties', lat: 40.7128, lng: -74.0060, city: 'New York, NY', sector: 'Entertainment' },
        { symbol: 'MU', name: 'Micron Technology', lat: 43.6150, lng: -116.2023, city: 'Boise, ID', sector: 'Technology' },
    ];

    // All sectors for filter
    const allSectors = ['All', 'Technology', 'Finance', 'Healthcare', 'Consumer', 'Retail', 'Energy', 'Industrial', 'Telecom', 'Entertainment', 'Automotive'];

    // Use API companies if loaded, otherwise fallback
    const companyLocations = apiCompanies.length > 0 ? apiCompanies : fallbackCompanyLocations;

    // Filtered companies by sector
    const filteredCompanyLocations = selectedSector === 'All'
        ? companyLocations
        : companyLocations.filter(c => c.sector === selectedSector);

    // Fetch company locations from API on mount
    useEffect(() => {
        const fetchCompanyLocations = async () => {
            try {
                setLoadingCompanies(true);
                const API_BASE = window.API_BASE_URL || (window.CONFIG ? window.CONFIG.API_BASE_URL : 'https://web-production-2e2e.up.railway.app');
                const response = await fetch(`${API_BASE}/api/companies/locations`);

                if (response.ok) {
                    const data = await response.json();
                    if (data.companies && data.companies.length > 0) {
                        setApiCompanies(data.companies);
                        setDataTimestamp(data.timestamp || null);
                        console.log(`Loaded ${data.companies.length} company locations from API`);
                    }
                }
            } catch (error) {
                console.log('Using fallback company locations:', (error as Error).message);
            } finally {
                setLoadingCompanies(false);
            }
        };

        fetchCompanyLocations();
    }, [fetchTrigger]);

    // Auto-dismiss error messages after 5 seconds
    useEffect(() => {
        if (locationError) {
            const timer = setTimeout(() => setLocationError(''), 5000);
            return () => clearTimeout(timer);
        }
    }, [locationError]);

    // Calculate distance between two points in miles
    const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
        const R = 3959; // Earth's radius in miles
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    };

    // Find companies near a location — uses filteredCompanyLocations for sector filtering
    const findNearbyCompanies = useCallback((lat: number, lng: number, radiusMiles = 250): NearbyCompany[] => {
        return filteredCompanyLocations
            .map(company => ({
                ...company,
                distance: calculateDistance(lat, lng, company.lat, company.lng)
            }))
            .filter(company => company.distance <= radiusMiles)
            .sort((a, b) => a.distance - b.distance);
    }, [filteredCompanyLocations]);

    // Request user location
    const requestLocation = () => {
        setLoading(true);
        setLocationError('');

        if (!navigator.geolocation) {
            setLocationError('Geolocation is not supported by your browser');
            setLoading(false);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                setUserLocation({ lat: latitude, lng: longitude });
                setMapCenter([latitude, longitude]);
                setMapZoom(10);
                setLoading(false);
            },
            (error) => {
                let errorMsg = 'Unable to get your location';
                if (error.code === 1) errorMsg = 'Location permission denied. Please enable location access.';
                if (error.code === 2) errorMsg = 'Location unavailable. Please try again.';
                if (error.code === 3) errorMsg = 'Location request timed out.';
                setLocationError(errorMsg);
                setLoading(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    // Search for location by city/zip — debounced (1s min between Nominatim requests)
    const searchLocation = async () => {
        if (!searchQuery.trim()) return;

        const now = Date.now();
        const timeSinceLast = now - lastGeocodeFetchRef.current;
        if (timeSinceLast < 1000) {
            await new Promise(resolve => setTimeout(resolve, 1000 - timeSinceLast));
        }

        setLoading(true);
        setLocationError('');

        try {
            lastGeocodeFetchRef.current = Date.now();
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=us&limit=1`,
                { headers: { 'User-Agent': 'AIStockSage/1.0' } }
            );
            const data = await response.json();

            if (data && data.length > 0) {
                const { lat, lon } = data[0];
                const latitude = parseFloat(lat);
                const longitude = parseFloat(lon);
                setUserLocation({ lat: latitude, lng: longitude });
                setMapCenter([latitude, longitude]);
                setMapZoom(10);
            } else {
                setLocationError('Location not found. Try a different search term.');
            }
        } catch (e) {
            setLocationError('Error searching for location. Please try again.');
        }

        setLoading(false);
    };

    // Load Leaflet CSS + JS once on mount
    useEffect(() => {
        if (!document.getElementById('leaflet-css')) {
            const link = document.createElement('link');
            link.id = 'leaflet-css';
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }

        if (!window.L) {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.onload = () => setLeafletReady(true);
            document.body.appendChild(script);
        }

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, []);

    // Initialize map once Leaflet is ready and mapRef is available
    useEffect(() => {
        if (!leafletReady || !mapRef.current || mapInstanceRef.current) return;

        const L = window.L as any;
        const map = L.map(mapRef.current).setView(mapCenter, mapZoom);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        mapInstanceRef.current = map;
    }, [leafletReady]);

    // Sanitize text for safe HTML insertion
    const esc = (str: string) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // Add company markers to map — wrapped in useCallback to avoid stale refs
    const addCompanyMarkers = useCallback((companies: (CompanyLocation | NearbyCompany)[]) => {
        if (!mapInstanceRef.current || !window.L) return;

        const L = window.L as any;

        // Clear existing company markers
        markersRef.current.forEach(marker => marker.remove());
        markersRef.current = [];

        companies.forEach(company => {
            const sectorColor = getSectorColor(company.sector);
            const companyIcon = L.divIcon({
                className: 'company-marker',
                html: `<div class="marker-pin" style="background: ${sectorColor}; box-shadow: 0 2px 8px ${sectorColor}66;"><i class="fas fa-building"></i></div>`,
                iconSize: [30, 42],
                iconAnchor: [15, 42],
                popupAnchor: [0, -42]
            });

            const marker = L.marker([company.lat, company.lng], { icon: companyIcon })
                .addTo(mapInstanceRef.current);

            // Hover tooltip — shows symbol + name
            marker.bindTooltip(`<strong>${esc(company.symbol)}</strong> — ${esc(company.name)}`, {
                direction: 'top',
                offset: [0, -42],
                className: 'stock-tooltip'
            });

            // Click popup with full details + View Stock button
            const sym = esc(company.symbol);
            const distance = (company as NearbyCompany).distance;
            const popupHtml = `
                <div class="company-popup">
                    <strong>${sym}</strong>
                    <div>${esc(company.name)}</div>
                    <div class="popup-city">${esc(company.city)}</div>
                    <div class="popup-sector" style="background: ${sectorColor}33; color: ${sectorColor};">${esc(company.sector)}</div>
                    ${distance ? `<div class="popup-distance">${distance.toFixed(1)} miles away</div>` : ''}
                    <button class="popup-btn" data-symbol="${sym}">View Stock</button>
                </div>
            `;

            marker.bindPopup(popupHtml, { maxWidth: 250, minWidth: 180 });

            // Safe click handler for the View Stock button inside popup
            marker.on('popupopen', () => {
                const popupEl = marker.getPopup().getElement();
                if (popupEl) {
                    const btn = popupEl.querySelector('.popup-btn[data-symbol]');
                    if (btn) {
                        (btn as HTMLButtonElement).onclick = () => {
                            routeTo(`/stock/${company.symbol}`);
                        };
                    }
                }
            });

            markersRef.current.push(marker);
        });
    }, []);

    // Add/update user location marker
    const updateUserMarker = useCallback((lat: number, lng: number) => {
        if (!mapInstanceRef.current || !window.L) return;
        const L = window.L as any;

        if (userMarkerRef.current) {
            userMarkerRef.current.remove();
        }

        const userIcon = L.divIcon({
            className: 'company-marker',
            html: '<div class="marker-pin user-marker-pin"><i class="fas fa-user"></i></div>',
            iconSize: [30, 42],
            iconAnchor: [15, 42],
            popupAnchor: [0, -42]
        });

        userMarkerRef.current = L.marker([lat, lng], { icon: userIcon })
            .addTo(mapInstanceRef.current)
            .bindPopup('<div class="company-popup"><strong>Your Location</strong></div>');
    }, []);

    // Update map view when center/zoom changes
    useEffect(() => {
        if (mapInstanceRef.current) {
            mapInstanceRef.current.setView(mapCenter, mapZoom);
        }
    }, [mapCenter, mapZoom]);

    // Re-render markers when companyLocations, sector filter, or userLocation changes
    useEffect(() => {
        if (!mapInstanceRef.current) return;

        if (userLocation) {
            const nearby = findNearbyCompanies(userLocation.lat, userLocation.lng, radiusMiles);
            setNearbyCompanies(nearby);
            addCompanyMarkers(nearby);
            updateUserMarker(userLocation.lat, userLocation.lng);
        } else {
            setNearbyCompanies([]);
            addCompanyMarkers(filteredCompanyLocations);
            if (userMarkerRef.current) {
                userMarkerRef.current.remove();
                userMarkerRef.current = null;
            }
        }
    }, [filteredCompanyLocations, userLocation, radiusMiles, findNearbyCompanies, addCompanyMarkers, updateUserMarker]);

    const nearbyLimit = showAllNearby ? nearbyCompanies.length : 20;

    return (
        <div className="map-view">
            <div className="map-header">
                <div className="map-title">
                    <h2><i className="fas fa-map-marker-alt"></i> Discover Public Companies</h2>
                    <p>Find publicly traded companies near you or search any location</p>
                    <div className="map-header-meta">
                        <span className="companies-count">
                            {loadingCompanies ? (
                                <><i className="fas fa-spinner fa-spin"></i> Loading companies...</>
                            ) : (
                                <><i className="fas fa-building"></i> {companyLocations.length} companies mapped</>
                            )}
                        </span>
                        {dataTimestamp && !loadingCompanies && (
                            <span className="data-timestamp">
                                <i className="fas fa-clock"></i> Updated {new Date(dataTimestamp).toLocaleTimeString()}
                            </span>
                        )}
                        <button className="refresh-btn" onClick={refreshCompanyData} disabled={loadingCompanies} title="Refresh company data">
                            <i className={`fas fa-sync-alt${loadingCompanies ? ' fa-spin' : ''}`}></i>
                        </button>
                    </div>
                </div>
            </div>

            <div className="map-controls">
                <div className="location-search">
                    <input
                        type="text"
                        placeholder="Search city, state, or zip code..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.currentTarget.value)}
                        onKeyDown={(e) => e.key === 'Enter' && searchLocation()}
                    />
                    <button onClick={searchLocation} disabled={loading}>
                        {loading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-search"></i>}
                    </button>
                </div>
                <button className="location-btn" onClick={requestLocation} disabled={loading}>
                    <i className="fas fa-crosshairs"></i>
                    {loading ? 'Searching...' : 'Use My Location'}
                </button>
            </div>

            {/* Sector filter chips */}
            <div className="sector-filters">
                {allSectors.map(sector => (
                    <button
                        key={sector}
                        className={`sector-chip ${selectedSector === sector ? 'active' : ''}`}
                        style={selectedSector === sector && sector !== 'All' ? { background: getSectorColor(sector) + '33', borderColor: getSectorColor(sector), color: getSectorColor(sector) } : {}}
                        onClick={() => { setSelectedSector(sector); setShowAllNearby(false); }}
                    >
                        {sector !== 'All' && <span className="chip-dot" style={{ background: getSectorColor(sector) }}></span>}
                        {sector}
                    </button>
                ))}
            </div>

            {userLocation && (
                <div className="radius-control">
                    <span className="radius-label"><i className="fas fa-circle-notch"></i> Radius:</span>
                    {[50, 100, 250, 500].map(r => (
                        <button
                            key={r}
                            className={`radius-btn${radiusMiles === r ? ' active' : ''}`}
                            onClick={() => setRadiusMiles(r)}
                        >{r} mi</button>
                    ))}
                </div>
            )}

            {locationError && (
                <div className="map-error">
                    <i className="fas fa-exclamation-circle"></i>
                    {locationError}
                </div>
            )}

            <div className="map-container">
                {!leafletReady ? (
                    <div className="map-loading">
                        <i className="fas fa-spinner fa-spin"></i>
                        <span>Loading map...</span>
                    </div>
                ) : (
                    <div ref={mapRef} className="leaflet-map"></div>
                )}

                {userLocation && nearbyCompanies.length > 0 && (
                    <div className="nearby-companies-panel">
                        <h3><i className="fas fa-building"></i> Nearby Companies ({nearbyCompanies.length})</h3>
                        <div className="companies-list">
                            {nearbyCompanies.slice(0, nearbyLimit).map((company) => (
                                <div
                                    key={company.symbol}
                                    className="company-item"
                                    onClick={() => routeTo(`/stock/${company.symbol}`)}
                                >
                                    <div className="company-symbol" style={{ borderLeftColor: getSectorColor(company.sector) }}>
                                        {company.symbol}
                                    </div>
                                    <div className="company-info">
                                        <div className="company-name">{company.name}</div>
                                        <div className="company-location">{company.city}</div>
                                    </div>
                                    <div className="company-distance">
                                        {company.distance.toFixed(0)} mi
                                    </div>
                                </div>
                            ))}
                        </div>
                        {nearbyCompanies.length > 20 && !showAllNearby && (
                            <button className="show-more-btn" onClick={() => setShowAllNearby(true)}>
                                Show all {nearbyCompanies.length} companies
                            </button>
                        )}
                    </div>
                )}

                {userLocation && nearbyCompanies.length === 0 && !loading && (
                    <div className="nearby-companies-panel">
                        <h3><i className="fas fa-building"></i> Nearby Companies</h3>
                        <div className="no-results">
                            <i className="fas fa-map-marker-alt"></i>
                            <p>No companies found within {radiusMiles} miles{selectedSector !== 'All' ? ` in ${selectedSector}` : ''}.</p>
                        </div>
                    </div>
                )}
            </div>


            <style>{`
                .map-view {
                    padding: 2rem;
                    max-width: 1400px;
                    margin: 0 auto;
                }
                .map-header {
                    margin-bottom: 1.5rem;
                }
                .map-title h2 {
                    font-size: 1.75rem;
                    font-weight: 700;
                    color: #fff;
                    margin-bottom: 0.5rem;
                }
                .map-title h2 i {
                    color: #00D924;
                    margin-right: 0.75rem;
                }
                .map-title p {
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 0.9375rem;
                }
                .companies-count {
                    display: inline-block;
                    margin-top: 0.5rem;
                    padding: 0.25rem 0.75rem;
                    background: rgba(0, 217, 36, 0.15);
                    border-radius: 20px;
                    color: #00D924;
                    font-size: 0.8125rem;
                }
                .companies-count i {
                    margin-right: 0.5rem;
                }
                .map-controls {
                    display: flex;
                    gap: 1rem;
                    margin-bottom: 1rem;
                    flex-wrap: wrap;
                }
                .location-search {
                    display: flex;
                    flex: 1;
                    min-width: 250px;
                    max-width: 400px;
                }
                .location-search input {
                    flex: 1;
                    padding: 0.75rem 1rem;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-right: none;
                    border-radius: 8px 0 0 8px;
                    color: #fff;
                    font-size: 0.9375rem;
                }
                .location-search input:focus {
                    outline: none;
                    border-color: #00D924;
                }
                .location-search button {
                    padding: 0.75rem 1.25rem;
                    background: linear-gradient(135deg, #00D924, #00b020);
                    border: none;
                    border-radius: 0 8px 8px 0;
                    color: #fff;
                    cursor: pointer;
                }
                .location-btn {
                    padding: 0.75rem 1.5rem;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    color: #fff;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    transition: all 0.3s ease;
                }
                .location-btn:hover {
                    background: rgba(255, 255, 255, 0.15);
                    border-color: #00D924;
                }
                .location-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                .sector-filters {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                    margin-bottom: 1rem;
                }
                .sector-chip {
                    display: flex;
                    align-items: center;
                    gap: 0.375rem;
                    padding: 0.375rem 0.75rem;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 20px;
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 0.8125rem;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .sector-chip:hover {
                    background: rgba(255, 255, 255, 0.1);
                }
                .sector-chip.active {
                    background: rgba(0, 217, 36, 0.15);
                    border-color: #00D924;
                    color: #00D924;
                }
                .chip-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }
                .map-error {
                    padding: 0.75rem 1rem;
                    background: rgba(255, 107, 53, 0.15);
                    border: 1px solid rgba(255, 107, 53, 0.3);
                    border-radius: 8px;
                    color: #FF6B35;
                    margin-bottom: 1rem;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    animation: fadeIn 0.3s ease;
                }
                .map-container {
                    display: flex;
                    gap: 1rem;
                    height: 500px;
                    margin-bottom: 1.5rem;
                }
                .leaflet-map {
                    flex: 1;
                    border-radius: 12px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    z-index: 1;
                }
                .nearby-companies-panel {
                    width: 300px;
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    padding: 1rem;
                    overflow-y: auto;
                }
                .nearby-companies-panel h3 {
                    font-size: 1rem;
                    font-weight: 600;
                    color: #fff;
                    margin-bottom: 1rem;
                    padding-bottom: 0.75rem;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                }
                .nearby-companies-panel h3 i {
                    color: #00D924;
                    margin-right: 0.5rem;
                }
                .companies-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                .company-item {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0.75rem;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }
                .company-item:hover {
                    background: rgba(0, 217, 36, 0.1);
                }
                .company-symbol {
                    font-weight: 700;
                    font-size: 0.875rem;
                    color: #00D924;
                    padding-left: 0.5rem;
                    border-left: 3px solid #00D924;
                }
                .company-info {
                    flex: 1;
                    min-width: 0;
                }
                .company-name {
                    font-size: 0.8125rem;
                    color: #fff;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .company-location {
                    font-size: 0.75rem;
                    color: rgba(255, 255, 255, 0.5);
                }
                .company-distance {
                    font-size: 0.75rem;
                    color: rgba(255, 255, 255, 0.6);
                    white-space: nowrap;
                }
                .map-legend {
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    padding: 1rem 1.5rem;
                }
                .map-legend h4 {
                    font-size: 0.875rem;
                    font-weight: 600;
                    color: rgba(255, 255, 255, 0.7);
                    margin-bottom: 0.75rem;
                }
                .legend-items {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 1rem;
                }
                .legend-item {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-size: 0.8125rem;
                    color: rgba(255, 255, 255, 0.7);
                }
                .legend-color {
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                }
                /* Custom marker styles */
                .company-marker {
                    background: transparent;
                    border: none;
                }
                .marker-pin {
                    width: 30px;
                    height: 30px;
                    border-radius: 50% 50% 50% 0;
                    transform: rotate(-45deg);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .marker-pin i {
                    transform: rotate(45deg);
                    color: #fff;
                    font-size: 12px;
                }
                .user-marker-pin {
                    background: #3B82F6 !important;
                    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.5) !important;
                }
                .map-loading {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 1rem;
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 0.9375rem;
                }
                .map-loading i {
                    font-size: 1.5rem;
                    color: #00D924;
                }
                .show-more-btn {
                    width: 100%;
                    margin-top: 0.75rem;
                    padding: 0.5rem;
                    background: rgba(0, 217, 36, 0.1);
                    border: 1px solid rgba(0, 217, 36, 0.3);
                    border-radius: 6px;
                    color: #00D924;
                    font-size: 0.8125rem;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .show-more-btn:hover {
                    background: rgba(0, 217, 36, 0.2);
                }
                .no-results {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 2rem 1rem;
                    text-align: center;
                    color: rgba(255, 255, 255, 0.5);
                }
                .no-results i {
                    font-size: 1.5rem;
                    color: rgba(255, 255, 255, 0.3);
                }
                .no-results p {
                    font-size: 0.875rem;
                    margin: 0;
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                /* Popup styles */
                .leaflet-popup-content-wrapper {
                    background: #1a1a1a;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                }
                .leaflet-popup-content {
                    color: #fff;
                    margin: 12px;
                }
                .leaflet-popup-tip {
                    background: #1a1a1a;
                }
                .company-popup strong {
                    font-size: 1.125rem;
                    color: #00D924;
                }
                .company-popup div {
                    margin-top: 0.25rem;
                }
                .popup-city {
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 0.8125rem;
                }
                .popup-sector {
                    display: inline-block;
                    padding: 0.25rem 0.5rem;
                    background: rgba(0, 217, 36, 0.2);
                    border-radius: 4px;
                    font-size: 0.75rem;
                    color: #00D924;
                    margin-top: 0.5rem;
                }
                .popup-distance {
                    font-size: 0.8125rem;
                    color: rgba(255, 255, 255, 0.6);
                    margin-top: 0.5rem;
                }
                .popup-btn {
                    margin-top: 0.75rem;
                    padding: 0.5rem 1rem;
                    background: linear-gradient(135deg, #00D924, #00b020);
                    border: none;
                    border-radius: 6px;
                    color: #fff;
                    font-size: 0.8125rem;
                    cursor: pointer;
                    width: 100%;
                }
                .popup-btn:hover {
                    opacity: 0.9;
                }
                /* Tooltip on hover */
                .stock-tooltip {
                    background: rgba(0, 0, 0, 0.9) !important;
                    border: 1px solid rgba(255, 255, 255, 0.2) !important;
                    border-radius: 6px !important;
                    color: #fff !important;
                    font-size: 0.8125rem !important;
                    padding: 4px 10px !important;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.4) !important;
                }
                .stock-tooltip .leaflet-tooltip-arrow {
                    display: none;
                }
                /* Ensure popups render above everything */
                .leaflet-popup {
                    z-index: 1000 !important;
                }
                .map-header-meta {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    flex-wrap: wrap;
                    margin-top: 0.5rem;
                }
                .map-header-meta .companies-count {
                    margin-top: 0;
                }
                .data-timestamp {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.375rem;
                    font-size: 0.8125rem;
                    color: rgba(255, 255, 255, 0.45);
                }
                .data-timestamp i {
                    font-size: 0.75rem;
                }
                .refresh-btn {
                    padding: 0.25rem 0.625rem;
                    background: rgba(255, 255, 255, 0.07);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 6px;
                    color: rgba(255, 255, 255, 0.6);
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-size: 0.875rem;
                }
                .refresh-btn:hover {
                    background: rgba(0, 217, 36, 0.15);
                    border-color: #00D924;
                    color: #00D924;
                }
                .refresh-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .radius-control {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin-bottom: 1rem;
                    flex-wrap: wrap;
                }
                .radius-label {
                    font-size: 0.8125rem;
                    color: rgba(255, 255, 255, 0.6);
                    display: flex;
                    align-items: center;
                    gap: 0.375rem;
                }
                .radius-btn {
                    padding: 0.3rem 0.75rem;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 20px;
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 0.8125rem;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .radius-btn:hover {
                    background: rgba(255, 255, 255, 0.1);
                }
                .radius-btn.active {
                    background: rgba(0, 217, 36, 0.15);
                    border-color: #00D924;
                    color: #00D924;
                }
                @media (max-width: 768px) {
                    .map-view {
                        padding: 1rem;
                    }
                    .map-container {
                        flex-direction: column;
                        height: auto;
                    }
                    .leaflet-map {
                        height: 350px;
                    }
                    .nearby-companies-panel {
                        width: 100%;
                        max-height: 300px;
                    }
                    .map-controls {
                        flex-direction: column;
                    }
                    .location-search {
                        max-width: 100%;
                    }
                }
            `}</style>
        </div>
    );
};


window.MapView = MapView;
