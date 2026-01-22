# Domain Setup Guide - Connecting aistocksage.com to Vercel & Railway
**Domain Registrar:** Porkbun.com  
**Frontend:** Vercel (frontend-vercel)  
**Backend:** Railway  
**Current Backend URL:** https://web-production-2e2e.up.railway.app

---

## 🎯 Overview

You need to configure:
1. **Frontend domain:** aistocksage.com → Vercel
2. **Backend domain:** api.aistocksage.com → Railway
3. **Update frontend config** to use new backend URL

---

## Part 1: Connect Frontend to Vercel (aistocksage.com)

### Step 1: Add Domain in Vercel Dashboard

1. **Go to Vercel Dashboard**
   - Visit: https://vercel.com/dashboard
   - Find your project (frontend-vercel or similar)
   - Click on the project

2. **Go to Settings → Domains**
   - Click "Settings" tab
   - Click "Domains" in the left sidebar

3. **Add Your Domain**
   - Click "Add" button
   - Enter: `aistocksage.com`
   - Click "Add"

4. **Add www Subdomain (Optional but Recommended)**
   - Click "Add" again
   - Enter: `www.aistocksage.com`
   - Click "Add"

5. **Get DNS Records**
   - Vercel will show you DNS records to add
   - Keep this page open - you'll need these values

**Vercel will provide records like:**
```
Type: A
Name: @
Value: 76.76.21.21

Type: CNAME  
Name: www
Value: cname.vercel-dns.com
```

---

### Step 2: Configure DNS in Porkbun

1. **Login to Porkbun**
   - Visit: https://porkbun.com/account/domain
   - Login to your account

2. **Go to Domain Management**
   - Find `aistocksage.com` in your domain list
   - Click "Details" or "DNS Records"

3. **Delete Default Records (If Any)**
   - Look for existing A, AAAA, or CNAME records for @ and www
   - Delete them (you can keep MX records for email)

4. **Add Vercel DNS Records**

   **Record 1: Root Domain (A Record)**
   ```
   Type: A
   Host: @ (or leave blank)
   Answer: 76.76.21.21
   TTL: 600 (default)
   ```
   Click "Add"

   **Record 2: WWW Subdomain (CNAME)**
   ```
   Type: CNAME
   Host: www
   Answer: cname.vercel-dns.com
   TTL: 600 (default)
   ```
   Click "Add"

5. **Save Changes**
   - DNS changes can take 5 minutes to 48 hours to propagate
   - Usually works within 10-30 minutes

---

### Step 3: Verify Frontend Domain

1. **Wait 10-30 Minutes**
   - DNS propagation takes time

2. **Check DNS Propagation**
   - Visit: https://www.whatsmydns.net/
   - Enter: `aistocksage.com`
   - Should show Vercel's IP: 76.76.21.21

3. **Check in Vercel Dashboard**
   - Go back to Vercel → Settings → Domains
   - Your domain should show "Valid Configuration" with a green checkmark
   - HTTPS certificate will be issued automatically (takes 5-10 minutes)

4. **Test Your Frontend**
   - Visit: https://aistocksage.com
   - Should load your app
   - Check for HTTPS (padlock icon)

**✅ Frontend is now connected!**

---

## Part 2: Connect Backend to Railway (api.aistocksage.com)

### Step 1: Add Domain in Railway Dashboard

1. **Go to Railway Dashboard**
   - Visit: https://railway.app/dashboard
   - Find your backend project
   - Click on it

2. **Go to Settings**
   - Click on your service (the Python/Flask app)
   - Click "Settings" tab
   - Scroll to "Domains" section

3. **Add Your Custom Domain**
   - Click "Add Domain" or "Custom Domain"
   - Enter: `api.aistocksage.com`
   - Click "Add"

4. **Get DNS Target**
   - Railway will show you DNS records to add
   - It will look like:
   ```
   Type: CNAME
   Name: api
   Value: your-service.up.railway.app
   ```
   - **Copy these values** - you'll need them for Porkbun

---

### Step 2: Add Backend DNS Record in Porkbun

1. **Go Back to Porkbun DNS**
   - Same page where you added frontend records

2. **Add CNAME Record for API Subdomain**
   ```
   Type: CNAME
   Host: api
   Answer: your-service.up.railway.app
   TTL: 600 (default)
   ```
   - Replace `your-service.up.railway.app` with YOUR actual Railway DNS target (shown in Railway dashboard)
   - Click "Add"

3. **Save Changes**
   - Wait 10-30 minutes for propagation

---

### Step 3: SSL Certificate (Railway - Automatic)

**Good News:** Railway automatically provisions SSL certificates for custom domains!

1. **No Action Required**
   - Railway handles SSL automatically
   - Once DNS propagates, SSL certificate is issued
   - Takes 5-15 minutes after DNS is configured

2. **Verify SSL Status**
   - In Railway dashboard → Settings → Domains
   - Your custom domain should show "Active" with SSL enabled
   - Green checkmark indicates everything is working

---

### Step 4: Verify Backend Domain

1. **Check DNS Propagation**
   - Visit: https://www.whatsmydns.net/
   - Enter: `api.aistocksage.com`
   - Should point to Heroku

2. **Test Backend API**
   - Visit: https://api.aistocksage.com/
   - Should return: `{"message": "Stock Watchlist API"}` or similar
   - Or try: https://api.aistocksage.com/api/health
   - Check for HTTPS (padlock icon)

**✅ Backend is now connected!**

---

## Part 3: Update Frontend to Use New Backend URL

### Step 1: Update config.js

1. **Edit Frontend Config**
   ```bash
   cd /Users/leninfonseca/Project-2/frontend-vercel
   ```

2. **Open config.js**
   - Find the API_BASE_URL setting
   - Update it:

   **Before:**
   ```javascript
   const API_BASE_URL = 'https://your-old-backend.herokuapp.com';
   ```

   **After:**
   ```javascript
   const API_BASE_URL = 'https://api.aistocksage.com';
   ```

3. **Save the file**

---

### Step 2: Update CORS in Backend

Your backend needs to allow requests from the new domain.

1. **Find CORS Configuration**
   - In your backend: `/Users/leninfonseca/Project-2/app.py`
   - Look for CORS settings

2. **Add New Domain to Allowed Origins**
   
   Find this section in `app.py` (around line 32):
   ```python
   allowed_origins = [
       "http://localhost:3000",
       "http://localhost:5000",
       # ... other localhost entries ...
       "https://stock-watchlist-frontend.vercel.app",
   ]
   ```
   
   Add your new domains:
   ```python
   allowed_origins = [
       "http://localhost:3000",
       "http://localhost:5000",
       # ... other localhost entries ...
       "https://stock-watchlist-frontend.vercel.app",
       "https://aistocksage.com",  # ADD THIS
       "https://www.aistocksage.com",  # ADD THIS
   ]
   ```

3. **Save and Deploy to Railway**
   ```bash
   cd /Users/leninfonseca/Project-2
   git add app.py
   git commit -m "Update CORS for new domain aistocksage.com"
   git push origin main
   ```
   
   - Railway auto-deploys from Git
   - Wait 2-3 minutes for deployment
   - Check Railway dashboard for deployment status

---

### Step 3: Deploy Frontend Changes

1. **Commit and Push to Vercel**
   ```bash
   cd /Users/leninfonseca/Project-2/frontend-vercel
   git add config.js
   git commit -m "Update API URL to api.aistocksage.com"
   git push origin main
   ```

2. **Vercel Auto-Deploys**
   - Vercel will automatically deploy
   - Wait 2-3 minutes
   - Check deployment status in Vercel dashboard

---

## Part 4: Final Testing

### Test Frontend
1. Visit: https://aistocksage.com
2. Open browser console (F12)
3. Check for any errors
4. Try these features:
   - Register/Login
   - Add stock to watchlist
   - View stock details
   - Check if data loads

### Test Backend Connection
1. Open browser Network tab (F12 → Network)
2. Refresh page
3. Look for API calls to `api.aistocksage.com`
4. Should all return 200 status codes
5. No CORS errors in console

### Test HTTPS
1. Both domains should show padlock icon
2. Click padlock → "Connection is secure"
3. Certificate should be valid

**✅ Everything should work!**

---

## 🔧 Troubleshooting

### Frontend Not Loading

**Problem:** aistocksage.com doesn't load or shows error

**Solutions:**
1. Check DNS propagation: https://www.whatsmydns.net/
2. Wait longer (up to 48 hours in rare cases)
3. Clear browser cache (Ctrl+Shift+Delete)
4. Try incognito/private window
5. Check Vercel dashboard for domain status

---

### Backend API Not Working

**Problem:** API calls fail or show CORS errors

**Solutions:**
1. Check Heroku domain status in dashboard
2. Verify DNS points to correct Heroku target
3. Check CORS settings in backend
4. Test API directly: `https://api.aistocksage.com/`
5. Check Railway logs in dashboard → Deployments → View Logs

---

### SSL Certificate Issues

**Problem:** "Not Secure" warning or certificate errors

**Solutions:**

**For Vercel (Frontend):**
- Wait 10-15 minutes after adding domain
- Check in Vercel dashboard → Domains
- Should show "Valid Configuration"
- Contact Vercel support if stuck

**For Railway (Backend):**
- Check domain status in Railway dashboard
- Should show "Active" with SSL enabled
- Takes 5-15 minutes to provision
- If stuck after 1 hour, check DNS propagation first
- Contact Railway support if still stuck

---

### CORS Errors

**Problem:** Console shows "CORS policy blocked" errors

**Solutions:**
1. Verify backend CORS settings include new domain
2. Check exact URLs (https vs http)
3. Deploy backend after changing CORS
4. Wait 2-3 minutes for Railway to redeploy
5. Clear browser cache and reload

---

### Mixed Content Warnings

**Problem:** Some resources load over HTTP instead of HTTPS

**Solutions:**
1. Check config.js - ensure API URL uses `https://`
2. Search for any hardcoded `http://` URLs
3. Update all URLs to use HTTPS
4. Redeploy frontend

---

## 📋 Quick Command Reference

### Check Your Current Setup
```bash
# Check what domain frontend is using
grep "API_BASE_URL" /Users/leninfonseca/Project-2/frontend-vercel/config.js

# Check Railway domain (use Railway dashboard, no CLI command needed)
# Go to: https://railway.app/dashboard → Your Project → Settings → Domains

# Check DNS for frontend
nslookup aistocksage.com

# Check DNS for backend  
nslookup api.aistocksage.com
```

### Deploy Changes
```bash
# Deploy frontend (Vercel auto-deploys from git)
cd /Users/leninfonseca/Project-2/frontend-vercel
git add .
git commit -m "Update for new domain"
git push origin main

# Deploy backend (Railway - auto-deploys from Git)
cd /Users/leninfonseca/Project-2
git add .
git commit -m "Update CORS for new domain"
git push origin main  # Railway watches your main branch
```

### Check Logs
```bash
# Check Railway backend logs
# Go to Railway dashboard → Your Project → Deployments → View Logs
# Or use Railway CLI: railway logs

# Vercel logs are in dashboard
# https://vercel.com/your-username/your-project/deployments
```

---

## 🎯 Complete DNS Configuration Summary

When done, your Porkbun DNS should look like this:

```
Type: A
Host: @
Answer: 76.76.21.21
TTL: 600

Type: CNAME
Host: www
Answer: cname.vercel-dns.com
TTL: 600

Type: CNAME
Host: api
Answer: your-service.up.railway.app
TTL: 600
```

---

## 📱 Optional: Email Setup

If you want to use email with your domain (e.g., contact@aistocksage.com):

1. Choose email provider (Google Workspace, Zoho, ProtonMail)
2. Add MX records from provider to Porkbun DNS
3. Add SPF and DKIM records for deliverability

---

## ✅ Final Checklist

Once everything is set up:

- [ ] Frontend loads at https://aistocksage.com
- [ ] WWW redirect works (www.aistocksage.com → aistocksage.com)
- [ ] Both domains show HTTPS padlock
- [ ] API calls work (check Network tab)
- [ ] No CORS errors in console
- [ ] Can register/login
- [ ] Can add stocks to watchlist
- [ ] Can view stock details
- [ ] AI chat works
- [ ] All features functional
- [ ] Update Google Search Console with new domain
- [ ] Update social media links

---

## 🆘 Still Having Issues?

### Contact Support

**Porkbun DNS Issues:**
- Email: support@porkbun.com
- Portal: https://porkbun.com/support

**Vercel Issues:**
- Help: https://vercel.com/help
- Discord: https://vercel.com/discord

**Railway Issues:**
- Help: https://docs.railway.app/
- Discord: https://discord.gg/railway
- Support: help@railway.app

---

## 🎉 You're All Set!

Once complete:
1. Your frontend will be at https://aistocksage.com
2. Your backend API will be at https://api.aistocksage.com  
3. Both will have valid SSL certificates
4. Your app will be production-ready

**Estimated Setup Time:** 30-60 minutes + DNS propagation wait time

Good luck! 🚀
