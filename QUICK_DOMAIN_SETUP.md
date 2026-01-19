# Quick Domain Setup - aistocksage.com with Porkbun
**5 Simple Steps to Connect Your Domain**

---

## Step 1: Vercel - Add Domain (5 minutes)

1. Go to https://vercel.com/dashboard
2. Click your project → Settings → Domains
3. Click "Add" button
4. Type: `aistocksage.com` → Click Add
5. Type: `www.aistocksage.com` → Click Add
6. **Keep this page open** - copy the DNS records shown

---

## Step 2: Porkbun - Add Frontend DNS (5 minutes)

1. Go to https://porkbun.com
2. Find aistocksage.com → Click "Details"
3. Go to DNS Records section
4. Delete any existing A or CNAME records for @ and www
5. Add these 2 records:

**Record 1:**
```
Type: A
Host: @ 
Answer: 76.76.21.21
TTL: 600
```
Click "Add"

**Record 2:**
```
Type: CNAME
Host: www
Answer: cname.vercel-dns.com
TTL: 600
```
Click "Add"

**Wait 10-30 minutes for DNS to propagate**

---

## Step 3: Railway - Add Backend Domain (5 minutes)

1. Go to https://railway.app/dashboard
2. Click your backend project
3. Click Settings → Domains section
4. Click "Custom Domain"
5. Type: `''
''` → Click Add
6. **Copy the CNAME value** (looks like: web-production-XXXX.up.railway.app)

---

## Step 4: Porkbun - Add Backend DNS (2 minutes)

1. Go back to Porkbun DNS page
2. Add this record:

```
Type: CNAME
Host: api
Answer: [paste the Railway CNAME value you copied]
TTL: 600
```
Click "Add"

**Wait 10-30 minutes for DNS to propagate**

---

## Step 5: Update Your Code (10 minutes)

### A. Update Frontend Config

Edit: `frontend-vercel/config.js`

**Change line 6 from:**
```javascript
API_BASE_URL: 'https://web-production-2e2e.up.railway.app',
```

**To:**
```javascript
API_BASE_URL: 'https://api.aistocksage.com',
```

Save the file.

### B. Update Backend CORS

Edit: `app.py`

Find this section (around line 32):
```python
allowed_origins = [
    "http://localhost:3000",
    # ... other entries ...
    "https://stock-watchlist-frontend.vercel.app",
]
```

Add these two lines before the closing `]`:
```python
    "https://aistocksage.com",
    "https://www.aistocksage.com",
]
```

Save the file.

### C. Deploy Both Changes

```bash
# Deploy frontend
cd /Users/leninfonseca/Project-2/frontend-vercel
git add config.js
git commit -m "Update domain to aistocksage.com"
git push origin main

# Deploy backend
cd /Users/leninfonseca/Project-2
git add app.py
git commit -m "Add aistocksage.com to CORS"
git push origin main
```

**Wait 3-5 minutes for deployments to complete**

---

## Step 6: Test Everything! ✅

### Test Frontend
1. Visit: https://aistocksage.com
2. Should load your app
3. Check for padlock icon (HTTPS)

### Test Backend
1. Visit: https://api.aistocksage.com/
2. Should show API message
3. Check for padlock icon (HTTPS)

### Test Full Integration
1. Go to https://aistocksage.com
2. Try to register or login
3. Add a stock to watchlist
4. Should all work!

---

## 🎉 Done!

Your app is now live at:
- **Frontend:** https://aistocksage.com
- **Backend API:** https://api.aistocksage.com

---

## ⏰ Timing

- DNS propagation: 10-60 minutes (usually ~20 minutes)
- SSL certificates: Automatic (5-15 minutes after DNS works)
- Total time: 30 minutes setup + 20 minutes waiting

---

## 🚨 Troubleshooting

### Frontend Not Loading?
- Wait longer (up to 2 hours max)
- Check DNS: https://www.whatsmydns.net/ (enter: aistocksage.com)
- Clear browser cache

### Backend API Not Working?
- Check Railway dashboard → Domains (should show "Active")
- Test directly: https://api.aistocksage.com/
- Check DNS: https://www.whatsmydns.net/ (enter: api.aistocksage.com)

### CORS Errors in Console?
- Make sure you deployed the CORS changes
- Check Railway logs for errors
- Wait 5 minutes and try again

---

## 📚 Need More Help?

See the detailed guide: `DOMAIN_SETUP_GUIDE.md`

---

**That's it! You're live on aistocksage.com! 🚀**
