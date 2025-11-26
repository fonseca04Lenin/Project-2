# Alpaca Account Connection Feature

## Overview

This feature allows users to connect their Alpaca trading accounts to:
- Import their existing positions
- Sync positions to their watchlist
- Enable future trading functionality

## Security

- User API keys are **encrypted** using Fernet symmetric encryption before storage
- Keys are stored in Firestore user documents
- Keys are only decrypted server-side when needed for API calls
- Never exposed to the frontend

## Setup Required

### 1. Generate Encryption Key

You need to generate an encryption key for storing user API keys securely:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Add this to your environment variables:
- **Railway**: Add `ENCRYPTION_KEY` in the Variables tab
- **Local**: Add to `.env` file

### 2. Install Dependencies

The `cryptography` package has been added to `requirements.txt`. Make sure to install it:

```bash
pip install -r requirements.txt
```

## Backend Endpoints

### Connect Alpaca Account
- **POST** `/api/alpaca/connect`
- **Body**: `{ "api_key": "...", "secret_key": "...", "use_paper": true }`
- **Response**: Connection status and account info

### Disconnect Alpaca Account
- **POST** `/api/alpaca/disconnect`
- **Response**: Success message

### Get Connection Status
- **GET** `/api/alpaca/status`
- **Response**: Connection status, account number, paper/live mode

### Get Positions
- **GET** `/api/alpaca/positions`
- **Response**: Array of user's positions with P/L data

### Sync Positions to Watchlist
- **POST** `/api/alpaca/sync-positions`
- **Response**: Number of positions synced

## Frontend UI

The Alpaca account connection is available in the **Preferences** modal:
1. Click Account → Preferences
2. Scroll to "Alpaca Account" section
3. Click "Connect Alpaca Account"
4. Enter your API Key and Secret Key
5. Choose Paper Trading or Live Trading
6. Click Connect

Once connected:
- View your positions
- Sync positions to watchlist
- Disconnect account

## Future Trading Features

With the account connection in place, you can now add:
- Place orders (buy/sell)
- View order history
- View account balance
- Real-time portfolio value
- Trading analytics

## Security Notes

⚠️ **Important**:
- Never log or expose user API keys
- Keys are encrypted at rest in Firestore
- Only decrypted server-side for API calls
- Consider adding rate limiting for position fetching
- Monitor for suspicious activity

## Testing

1. Get Alpaca API keys from: https://app.alpaca.markets/paper/dashboard/overview
2. Use Paper Trading keys for testing (safer)
3. Connect account in Preferences
4. Test loading positions
5. Test syncing to watchlist

