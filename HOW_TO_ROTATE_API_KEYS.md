# How to Rotate Exposed API Keys

**⚠️ DO NOT ROTATE NOW** - This is just a guide for when you're ready

---

## 🔍 Exposed Keys in Your Codebase

### 1. NewsAPI Key (stock.py line 9)
```python
self.api_key = '4ba3e56d52e54611b9485cdd2e28e679'
```

### 2. Finnhub Demo Key (stock.py line 405)
```python
self.api_key = api_key or 'c34391qad3i8edlcgrgg'
```

### 3. Firebase Credentials (firebase-credentials.json)
- Complete service account credentials exposed

---

## 📋 Step-by-Step Rotation Process

### Step 1: Get New API Keys

#### For NewsAPI:
1. Go to https://newsapi.org/account
2. Log in to your account
3. Navigate to "API Keys" section
4. Click "Generate New Key"
5. Copy the new key
6. **Disable/Delete the old key** in the dashboard

#### For Finnhub:
1. Go to https://finnhub.io/
2. Log in to your account
3. Go to "Dashboard" → "API Keys"
4. Generate a new key
5. Copy the new key
6. **Revoke the old key**

#### For Firebase:
1. Go to https://console.firebase.google.com/
2. Select your project: `stock-watcher-bbb20`
3. Go to Project Settings → Service Accounts
4. Click "Generate New Private Key"
5. Download the new JSON file
6. **Delete the old key** from the service account

---

### Step 2: Update Code to Use Environment Variables

**BEFORE (Hardcoded):**
```python
# stock.py
class NewsAPI:
    def __init__(self):
        self.api_key = '4ba3e56d52e54611b9485cdd2e28e679'  # ❌ Hardcoded
```

**AFTER (Environment Variable):**
```python
# stock.py
import os

class NewsAPI:
    def __init__(self):
        self.api_key = os.getenv('NEWS_API_KEY')  # ✅ From environment
        if not self.api_key:
            raise ValueError("NEWS_API_KEY not set in environment")
```

---

### Step 3: Set Environment Variables

#### On Railway (Backend):

1. Go to your Railway project dashboard
2. Click on your Flask service
3. Go to "Variables" tab
4. Add these environment variables:

```
NEWS_API_KEY=your_new_newsapi_key_here
FINNHUB_API_KEY=your_new_finnhub_key_here
GROQ_API_KEY=your_groq_key_here
```

5. Click "Deploy" to redeploy with new keys

#### On Vercel (Frontend):
Since the frontend doesn't directly use these keys (they're used in the backend), no Vercel changes needed.

#### On Local Development:
Create a `.env` file in your project root:

```bash
# .env file
NEWS_API_KEY=your_new_key_here
FINNHUB_API_KEY=your_new_key_here
GROQ_API_KEY=your_groq_key_here
```

Make sure `.env` is in `.gitignore`!

---

### Step 4: Update firebase-credentials.json

**IMPORTANT:** Don't commit the new file to Git!

#### Option A: Use Environment Variable (RECOMMENDED)

1. Convert the JSON to a string and store in Railway environment variable
2. Update your Firebase initialization:

```python
# firebase_service.py
import os
import json

def initialize_firebase():
    # Get credentials from environment variable
    creds_json = os.getenv('FIREBASE_CREDENTIALS_JSON')
    if creds_json:
        creds_dict = json.loads(creds_json)
        cred = credentials.Certificate(creds_dict)
    else:
        # Fallback to file (for local development)
        cred = credentials.Certificate('firebase-credentials.json')
    
    firebase_admin.initialize_app(cred)
```

#### Option B: Keep File for Local, Use Env Var in Production

1. Keep `firebase-credentials.json` for local development only
2. Add to `.gitignore`
3. Use environment variable in production (Railway)

---

### Step 5: Deploy the Changes

```bash
# Commit the code changes (not the credentials)
git add stock.py firebase_service.py .env.example
git commit -m "Security: Move API keys to environment variables"
git push origin main
```

Railway will automatically deploy with the new environment variables.

---

### Step 6: Verify Everything Works

#### Test NewsAPI:
```bash
curl https://your-api-url.com/api/news
# Should return news articles
```

#### Test Finnhub:
```bash
curl https://your-api-url.com/api/stock/AAPL
# Should return stock data
```

#### Test Firebase:
- Try logging in with a test account
- Check if data is stored in Firestore

---

### Step 7: Clean Up Old Keys

Once everything is working with new keys:

1. **Delete old keys** from provider dashboards
2. **Review access logs** to check for unauthorized usage
3. **Monitor costs** for unexpected charges
4. **Document the incident** and prevent future exposures

---

## 🚨 Firebase Credentials Special Handling

### Remove from Git History

If the credentials were committed:

```bash
# Remove from Git history (DANGEROUS - only if repository isn't shared publicly)
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch firebase-credentials.json" \
  --prune-empty --tag-name-filter cat -- --all

# Force push (WARNING: Rewrites history!)
git push origin --force --all
```

**⚠️ WARNING:** This rewrites Git history. Only do this if:
- Your repository is private
- No one else has cloned it
- You've backed up your repository

### Safer Alternative:

1. Leave the old credentials in Git history (they're already exposed)
2. Rotate to new credentials immediately
3. Add future credentials to `.gitignore`
4. Monitor for unauthorized access

---

## 📝 Checklist for Key Rotation

- [ ] Identify all exposed keys
- [ ] Generate new keys for each service
- [ ] Update code to use environment variables
- [ ] Set environment variables in Railway
- [ ] Update local `.env` file (don't commit!)
- [ ] Add `.env` and credentials files to `.gitignore`
- [ ] Deploy changes to Railway
- [ ] Test all API integrations
- [ ] Revoke old keys from providers
- [ ] Monitor for unauthorized access
- [ ] Document the incident
- [ ] Create `.env.example` template for team

---

## 🛡️ Prevention for Future

### Always Use Environment Variables

```python
# ❌ BAD
api_key = 'your-key-here'

# ✅ GOOD
api_key = os.getenv('API_KEY')
if not api_key:
    raise ValueError("API_KEY must be set")
```

### Create .env.example Template

```bash
# .env.example (commit this)
NEWS_API_KEY=your_newsapi_key_here
FINNHUB_API_KEY=your_finnhub_key_here
GROQ_API_KEY=your_groq_key_here
FIREBASE_CREDENTIALS_PATH=firebase-credentials.json
```

### Update .gitignore

```gitignore
# Environment variables
.env
.env.local
.env.*.local

# Firebase credentials
firebase-credentials.json
firebase-debug.log

# API keys
**/*-key*.json
**/*credentials*.json
```

---

## 📚 Additional Resources

- [Railway Environment Variables](https://docs.railway.app/develop/variables)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [Python-dotenv Guide](https://pypi.org/project/python-dotenv/)
- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

---

**Generated:** January 22, 2025  
**Status:** Informational only - DO NOT EXECUTE NOW
