# 🔄 OAuth Flow Diagram — Shopify + Google Apps Script

Visual explanation of how the OAuth authorization flow works in this integration.

---

## ASCII Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                   SHOPIFY OAUTH FLOW — GOOGLE APPS SCRIPT                    │
└──────────────────────────────────────────────────────────────────────────────┘

  Your Browser           Apps Script          Shopify Auth          Shopify API
       │                    │                    Server                  │
       │                    │                      │                     │
  ① Run buildOAuth          │                      │                     │
       InstallUrl()         │                      │                     │
       │◄───────────────────│                      │                     │
       │  (logs OAuth URL)  │                      │                     │
       │                    │                      │                     │
  ② Open OAuth URL          │                      │                     │
       │──────────────────────────────────────────►│                     │
       │                    │                      │                     │
       │◄──────────────────────────────────────────│                     │
       │  (consent screen)  │                      │                     │
       │                    │                      │                     │
  ③ Click "Install"         │                      │                     │
       │──────────────────────────────────────────►│                     │
       │                    │                      │                     │
       │            ④ Redirect to Apps Script      │                     │
       │         ?code=ONE_TIME_CODE&shop=...       │                     │
       │─────────────────── ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─►│                     │
       │                    │◄────────────────────  │                     │
       │                    │  (doGet() fires)       │                     │
       │                    │                      │                     │
       │              ⑤ Exchange code for token    │                     │
       │                    │  POST /admin/oauth/  │                     │
       │                    │  access_token        │                     │
       │                    │  {client_id,         │                     │
       │                    │   client_secret,     │                     │
       │                    │   code}              │                     │
       │                    │─────────────────────►│                     │
       │                    │                      │                     │
       │              ⑥ Receive access token       │                     │
       │                    │◄─────────────────────│                     │
       │                    │  {access_token:      │                     │
       │                    │   "shpat_..."}        │                     │
       │                    │                      │                     │
       │              ⑦ Log token to console       │                     │
       │                    │  (View → Executions)  │                     │
       │                    │                      │                     │
       │◄───────────────────│                      │                     │
       │  "✅ App Installed  │                      │                     │
       │   Successfully!"   │                      │                     │
       │                    │                      │                     │
  ⑧ Copy token from logs    │                      │                     │
     Paste into Code.gs     │                      │                     │
     Redeploy               │                      │                     │
       │                    │                      │                     │
  ⑨ Open ?run=report        │                      │                     │
       │──────────────────► │                      │                     │
       │                    │                      │                     │
       │            ⑩ GraphQL API calls with token │                     │
       │                    │─────────────────────────────────────────── ►│
       │                    │◄──────────────────────────────────────────  │
       │                    │  (product data)      │                     │
       │                    │                      │                     │
       │◄───────────────────│                      │                     │
       │  Report complete   │                      │                     │
       │  (HTML in Drive)   │                      │                     │
```

---

## Step-by-Step Explanation

### ① Build OAuth Install URL

You run `buildOAuthInstallUrl()` in the Apps Script editor. This function
constructs a URL pointing to Shopify's authorization endpoint with:

- `client_id` — identifies your app
- `scope` — permissions you're requesting
- `redirect_uri` — where Shopify should send the user after approval
- `state` — a random nonce stored in `PropertiesService` and validated in the
  callback to confirm the redirect was triggered by this script and not forged
  by a third party (CSRF protection)

The URL is logged to the execution console for you to copy.

---

### ② Open OAuth URL

You paste the URL into a browser and visit it. Shopify shows a consent page
listing the scopes your app is requesting (e.g., "Read inventory",
"Read products").

> **Why open it in a browser?** OAuth requires a human to approve the
> permissions. The browser session must be authenticated as the Shopify merchant.

---

### ③ Click Install

You click "Install" (or "Add app") on the consent page. Shopify records your
approval and generates a one-time authorization code.

---

### ④ Shopify Redirects to Apps Script

Shopify sends the user's browser to your `redirect_uri` with query parameters:

```
https://your-script-url.../exec?code=ONE_TIME_CODE&shop=your-store.myshopify.com&state=...
```

The browser hits your Apps Script web app URL. Apps Script fires `doGet(e)`,
passing the query parameters as `e.parameter`.

> **Why a one-time code and not the token directly?** Security. Sending a token
> through the browser URL would expose it in browser history and server logs.
> The code is only valid for a few minutes and can only be used once.

---

### ⑤ Apps Script Exchanges Code for Token

`handleShopifyOAuthCallback()` makes a **server-to-server POST request** from
Apps Script to Shopify's token endpoint, sending:

- `client_id` — your API key
- `client_secret` — your API secret
- `code` — the one-time code from the redirect

This is the step that requires the API secret. Because Apps Script makes this
call server-side (not from the browser), the secret is never exposed to the end user.

---

### ⑥ Shopify Returns the Access Token

Shopify validates the code, confirms the secret matches, and responds with:

```json
{
  "access_token": "shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "scope": "read_inventory,read_products,read_reports"
}
```

---

### ⑦ Token Logged to Execution Console

Apps Script logs the token prominently with `console.log()`. You retrieve it
by opening **View → Executions** and clicking the `doGet` execution that just fired.

> **Why not store it automatically?** Apps Script doesn't have a built-in secure
> key store. Logging it for manual copy-paste keeps the implementation simple
> and avoids storing secrets in `PropertiesService` without encryption.
>
> For a production multi-tenant app, you would store tokens in a database or
> use `PropertiesService` with appropriate access controls.

---

### ⑧ You Copy and Save the Token

You copy `shpat_...` from the logs, paste it into `SHOPIFY_ACCESS_TOKEN` in
`Code.gs`, save the script, and create a new deployment version.

---

### ⑨ Run the Report

You visit your Apps Script URL with `?run=report` appended, or run
`runOutOfStockReport()` directly in the editor.

---

### ⑩ Authenticated API Calls

The script uses the stored `SHOPIFY_ACCESS_TOKEN` in the
`X-Shopify-Access-Token` header on every Shopify GraphQL API request. Shopify
validates the token and returns the requested data.

---

## Key Concepts

### Why OAuth instead of a static API token?

Shopify is deprecating static **Admin API** tokens for public apps. OAuth is
the standard way to obtain tokens that:

- Can be revoked without changing passwords
- Have explicit scope limitations
- Are traceable (you know which app has which token)
- Support multi-store installations (each store gets its own token)

### Why Google Apps Script as the redirect handler?

A traditional OAuth integration requires a publicly accessible web server to
receive the redirect. Apps Script provides this for free, with no hosting,
no domain, and no infrastructure to maintain.

### Why are authorization codes single-use?

If a code could be used multiple times, an attacker who intercepted it (e.g.,
from browser history or server logs) could use it to get a token. Single-use
codes make interception much less useful.

---

## Security Considerations

| Item | Public or Secret? | Notes |
|------|------------------|-------|
| API key (Client ID) | Technically public | Visible in OAuth URLs |
| API secret (Client Secret) | **Secret** | Never put in client-side code or URLs |
| Authorization code (`?code=`) | Short-lived secret | Single-use, expires quickly |
| Access token (`shpat_...`) | **Secret** | Treat like a password |
| Apps Script exec URL | Public | Anyone can send GET requests to it |
| `state` nonce | Temporary | Generated by script, stored in `PropertiesService`, validated on callback to prevent CSRF |

---

## Common Pitfalls

| Pitfall | Why it happens | Solution |
|---------|---------------|----------|
| Redirect URI mismatch | URL in script ≠ URL in Dev Dashboard | Copy-paste exactly, check for trailing slashes |
| Code already used error | Tried to run OAuth URL twice | Generate a new URL with `buildOAuthInstallUrl()` |
| Token not working after save | Forgot to redeploy | Deploy → Manage deployments → New version |
| 401 on all API calls | Token not in active deployment | Redeploy with new version after saving token |
| Blank page on redirect | Web app not set to "Anyone" | Change access to "Anyone" in deployment settings |

---

## Summary

```
Developer runs buildOAuthInstallUrl()
    → Opens URL in browser
        → Shopify shows consent screen
            → Merchant clicks Install
                → Shopify redirects to Apps Script with ?code=...
                    → Apps Script POSTs code + secret to Shopify
                        → Shopify returns shpat_... token
                            → Developer copies token from logs
                                → Pastes token into Code.gs
                                    → Redeploys
                                        → Script can now call Shopify API ✅
```

---

*For setup instructions, see [SETUP.md](../SETUP.md).*
*For troubleshooting, see [TROUBLESHOOTING.md](../TROUBLESHOOTING.md).*
