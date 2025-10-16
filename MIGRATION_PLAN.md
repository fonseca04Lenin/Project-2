# Migration Plan: Heroku/Firestore → Supabase

## Why Supabase?
- ✅ No cold starts (always-on database)
- ✅ Real-time subscriptions (live watchlist updates)
- ✅ Built-in REST API (no backend code needed)
- ✅ PostgreSQL (reliable, fast, SQL queries)
- ✅ Built-in auth (migration from Firebase Auth)
- ✅ Generous free tier: 50,000 monthly active users

## Migration Steps

### Step 1: Setup Supabase
```bash
# 1. Create account at supabase.com
# 2. Create new project
# 3. Get API URL and anon key
```

### Step 2: Create Watchlist Table
```sql
-- Run in Supabase SQL editor
CREATE TABLE user_watchlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol VARCHAR(10) NOT NULL,
  company_name VARCHAR(200),
  added_at TIMESTAMP DEFAULT NOW(),
  notes TEXT,
  target_price DECIMAL(10,2),
  UNIQUE(user_id, symbol)
);

-- Enable Row Level Security
ALTER TABLE user_watchlists ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own watchlist
CREATE POLICY "Users can view own watchlist" 
ON user_watchlists FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own watchlist" 
ON user_watchlists FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own watchlist" 
ON user_watchlists FOR DELETE 
USING (auth.uid() = user_id);
```

### Step 3: Replace Frontend Code
```javascript
// Replace Firebase/backend calls with Supabase
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'YOUR_SUPABASE_URL',
  'YOUR_SUPABASE_ANON_KEY'
)

// Add to watchlist (replaces current backend call)
async function addToWatchlist(symbol, companyName) {
  const { data, error } = await supabase
    .from('user_watchlists')
    .insert({
      user_id: supabase.auth.user().id,
      symbol: symbol,
      company_name: companyName
    })
  
  if (error) throw error
  return data
}

// Load watchlist (replaces current backend call)
async function loadWatchlist() {
  const { data, error } = await supabase
    .from('user_watchlists')
    .select('*')
    .order('added_at', { ascending: false })
  
  if (error) throw error
  return data
}

// Real-time updates (bonus feature!)
supabase
  .from('user_watchlists')
  .on('*', payload => {
    console.log('Watchlist updated!', payload)
    // Auto-refresh watchlist display
  })
  .subscribe()
```

### Step 4: Authentication Migration
```javascript
// Keep Firebase Auth OR migrate to Supabase Auth
// Supabase Auth is easier:

// Sign in
const { user, error } = await supabase.auth.signIn({
  email: 'user@example.com',
  password: 'password'
})

// Auto-handles sessions, no token management needed!
```

## Benefits of This Migration

1. **Instant Response**: No more "Fetch is aborted" errors
2. **Real-time Updates**: Watchlist updates instantly across devices
3. **No Backend Code**: Supabase handles all API endpoints
4. **Better Reliability**: PostgreSQL > Firestore for this use case
5. **Simpler Code**: Direct database calls instead of backend proxy
6. **Built-in Features**: Search, filtering, pagination out of the box

## Timeline
- **Setup**: 30 minutes
- **Migration**: 2-3 hours  
- **Testing**: 1 hour
- **Total**: Half day to completely solve all issues

Would you like me to start this migration?