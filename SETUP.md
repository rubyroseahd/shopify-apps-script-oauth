# 🚀 SETUP.md — Shopify OAuth with Google Apps Script

Complete step-by-step guide to obtain a Shopify Admin API access token using
Google Apps Script as the OAuth redirect handler — **no backend server required**.

---

## Table of Contents

- [Phase 1: Create Shopify Dev Dashboard App](#phase-1-create-shopify-dev-dashboard-app)
- [Phase 2: Set Up Google Apps Script](#phase-2-set-up-google-apps-script)
- [Phase 3: Deploy Apps Script as Web App](#phase-3-deploy-apps-script-as-web-app)
- [Phase 4: Configure Redirect URL in Dev Dashboard](#phase-4-configure-redirect-url-in-dev-dashboard)
- [Phase 5: Generate and Open OAuth Install URL](#phase-5-generate-and-open-oauth-install-url)
- [Phase 6: Complete OAuth Flow and Extract Token](#phase-6-complete-oauth-flow-and-extract-token)
- [Phase 7: Save Token and Redeploy](#phase-7-save-token-and-redeploy)
- [Phase 8: Test Your Integration](#phase-8-test-your-integration)

---

## Phase 1: Create Shopify Dev Dashboard App

> **Why?** Shopify requires every API integration to be registered as an "app"
> in your Partner account. This gives you a Client ID and Client Secret needed
> for OAuth.

### Steps

1. Go to [partners.shopify.com](https://partners.shopify.com) and log in.
2. In the left sidebar, click **Apps**.
3. Click **Create app** → **Create app manually**.
4. Fill in:
   - **App name**: `Inventory Report` (or any name you like)
   - **App URL**: `https://example.com` (placeholder — doesn't matter for private apps)
5. Click **Create app**.

### What you get

On the **API credentials** tab, note down:
- **API key** (this is your Client ID)
- **API secret key** (this is your Client Secret)

> ⚠️ **Keep these secret!** Never commit them to version control.
> Add them to `Code.gs` but ensure `.gitignore` covers your local config.

---

## Phase 2: Set Up Google Apps Script

> **Why?** Apps Script acts as your backend — it receives the OAuth redirect
> from Shopify and exchanges the authorization code for an access token,
> without requiring you to host a server.

### Steps

1. Go to [script.google.com](https://script.google.com).
2. Click **+ New project**.
3. Rename the project (click "Untitled project" at the top):
   - Name it: `Shopify Inventory Report`
4. Delete all default code in `Code.gs`.
5. Copy the entire contents of `Code.gs` from this repository and paste it in.
6. Fill in the configuration at the top of the file:

```javascript
const SHOPIFY_API_KEY    = "YOUR_CLIENT_ID_HERE";      // From Phase 1
const SHOPIFY_API_SECRET = "YOUR_CLIENT_SECRET_HERE";  // From Phase 1
const SHOPIFY_STORE_URL  = "your-store.myshopify.com"; // Your store domain
const DRIVE_FOLDER_ID    = "YOUR_DRIVE_FOLDER_ID";     // Google Drive folder
```

7. Press **Ctrl+S** (or **Cmd+S** on Mac) to save.

> 💡 **Finding your Drive Folder ID**: Open the folder in Google Drive.
> The ID is the long string at the end of the URL:
> `https://drive.google.com/drive/folders/`**THIS_IS_THE_ID**

---

## Phase 3: Deploy Apps Script as Web App

> **Why?** The Apps Script project needs to be publicly accessible via a URL
> so that Shopify can redirect the user to it after they approve the OAuth
> consent screen.

### Steps

1. In the Apps Script editor, click **Deploy** → **New deployment**.
2. Click the gear icon ⚙️ next to "Select type".
3. Choose **Web app**.
4. Fill in:
   - **Description**: `OOS Report OAuth v1`
   - **Execute as**: `Me`
   - **Who has access**: `Anyone` ← This is required so Shopify can redirect here
5. Click **Deploy**.
6. If prompted, click **Authorize access** and follow the Google permission prompts.
7. **Copy the Web app URL** — it looks like:

```
https://script.google.com/macros/s/AKfycbzb2RkN9hbY9yWV...LONG_ID.../exec
```

> ⚠️ **Critical**: The URL must end with `/exec`, **not** `/dev`.
> The `/dev` URL requires you to be logged into Google to access it.

### Update the script

Go back to the editor and paste the URL into the script:

```javascript
const SHOPIFY_REDIRECT_URI = "https://script.google.com/macros/s/YOUR_ID/exec";
```

Save the script again (**Ctrl+S**).

> 💡 **Common pitfall**: Any time you change the script code, you must create a
> **new version** of the deployment for the changes to go live. The URL stays
> the same — only the code behind it updates.

---

## Phase 4: Configure Redirect URL in Dev Dashboard

> **Why?** Shopify validates the `redirect_uri` in every OAuth request against
> an allowlist you configure. If the URL doesn't match exactly, you'll get an
> `invalid_request: The redirect_uri is not whitelisted` error.

### Steps

1. Go back to [partners.shopify.com](https://partners.shopify.com) → **Apps** → your app.
2. Click **Configuration** (or **App setup** in older UI).
3. Under **URLs**, find **Allowed redirection URL(s)**.
4. Click **Add URL** (or edit the existing entry).
5. Paste your Apps Script exec URL **exactly** as it appears in the script:

```
https://script.google.com/macros/s/AKfycbzb2RkN9hbY9yWV...LONG_ID.../exec
```

6. Click **Save**.

> ⚠️ **Exact match required**: The URL must be character-for-character identical
> to what's in `SHOPIFY_REDIRECT_URI`. A trailing slash, extra space, or `http`
> vs `https` difference will cause a redirect error.

### If you see "Version saved but not Active"

Shopify requires you to create a **version** and mark it **active**:

1. Click **Create version** (or **Release**).
2. Fill in the required fields (App name, App URL, Redirect URLs).
3. Click **Save** → **Release**.
4. Confirm the version shows as **Active**.

---

## Phase 5: Generate and Open OAuth Install URL

> **Why?** The OAuth install URL is a special Shopify URL that starts the
> authorization flow. When a merchant opens it, they see a consent screen
> listing the permissions your app is requesting.

### Steps

1. In the Apps Script editor, select **`buildOAuthInstallUrl`** from the
   function dropdown (next to the Run button).
2. Click **Run ▶**.
3. Open **View → Executions** (or click the Executions icon in the left sidebar).
4. Click the latest execution to see its logs.
5. Find and copy the URL that looks like:

```
https://your-store.myshopify.com/admin/oauth/authorize?client_id=abc123&scope=read_inventory,read_products,read_reports&redirect_uri=https://script.google.com/...&state=xyz789
```

6. **Open that URL in your browser**.

> 💡 You'll see a Shopify page titled something like **"Inventory Report would
> like to access your store"** listing the scopes. This is expected.

### Common issues at this stage

| Problem | Solution |
|---------|----------|
| "App not found" | Check that `SHOPIFY_API_KEY` is correct and the app is active |
| "invalid_request: The redirect_uri is not whitelisted" | Redirect URL in Dev Dashboard doesn't match `SHOPIFY_REDIRECT_URI` exactly |
| 400 error page | Usually a scope issue — check the scopes match what's configured |

---

## Phase 6: Complete OAuth Flow and Extract Token

> **Why?** Clicking "Install" sends a one-time authorization code to your Apps
> Script web app. The script exchanges it for a permanent access token by
> making a server-to-server call with your API secret — which is why the secret
> must be in the script, not in the browser.

### Steps

1. On the Shopify consent page, click **Install** (or **Add app**).
2. Shopify redirects your browser to your Apps Script URL.
3. You should see: **"✅ App Installed Successfully!"**
4. Go back to the Apps Script editor.
5. Open **View → Executions**.
6. Click the **latest execution** (the one that just fired from the redirect).
7. Look for these lines in the log output:

```
================================================================================
✅ SHOPIFY ACCESS TOKEN (COPY THIS): shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
================================================================================
```

8. **Copy the token** (everything starting with `shpat_`).

> ⚠️ **Tokens are single-use codes**: The `?code=` parameter Shopify sends is
> one-time only. If you try to open the URL again, you'll get a 400 error.
> That's fine — you only need the token, which you already captured.

---

## Phase 7: Save Token and Redeploy

> **Why?** The script needs the access token to authenticate API calls.
> You also need to redeploy so the new version of the script (with the token)
> is what runs when someone visits the web app URL.

### Steps

1. In the Apps Script editor, find line:

```javascript
const SHOPIFY_ACCESS_TOKEN = "";
```

2. Replace it with:

```javascript
const SHOPIFY_ACCESS_TOKEN = "shpat_YOUR_COPIED_TOKEN_HERE";
```

3. Press **Ctrl+S** to save.
4. Click **Deploy** → **Manage deployments**.
5. Click the **pencil ✏️ edit icon** on your existing Web app deployment.
6. Under **Version**, select **New version**.
7. Click **Deploy**.

> 💡 You don't need a new URL — the same `/exec` URL now runs your updated code.

---

## Phase 8: Test Your Integration

### Option A: Run via the web app URL

Append `?run=report` to your Apps Script exec URL and open it in a browser:

```
https://script.google.com/macros/s/YOUR_ID/exec?run=report
```

You should see a success message and find a new HTML file in your Drive folder.

### Option B: Run directly in the editor

1. Select **`runOutOfStockReport`** from the function dropdown.
2. Click **Run ▶**.
3. Check **View → Executions** for the log output.
4. Open your configured Drive folder — a new `OOS_Report_YYYY-MM-DD_HH-mm-ss.html`
   file should appear.

### What a successful run looks like

```
============================================================
Starting Out-of-Stock Report
Timestamp: 2024-01-15T10:30:00.000Z
============================================================
Fetching page 1 of products...
Fetching page 2 of products...
Pagination complete. Scanned 2 page(s). Found 7 out-of-stock product(s).
Report saved to Drive: https://drive.google.com/file/d/...
Done! Found 7 product(s) with out-of-stock variants. Report saved to Drive.
```

### Troubleshooting

If the report doesn't work, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md).

---

## Quick Reference

| Item | Where to find it |
|------|-----------------|
| API key (Client ID) | Shopify Partners → App → API credentials |
| API secret | Shopify Partners → App → API credentials |
| Apps Script exec URL | Deploy → Manage deployments → Web app URL |
| Access token | Execution logs after completing OAuth flow |
| Drive folder ID | Google Drive folder URL (last path segment) |

---

*For a visual explanation of the OAuth flow, see [docs/oauth-flow-diagram.md](./docs/oauth-flow-diagram.md).*
