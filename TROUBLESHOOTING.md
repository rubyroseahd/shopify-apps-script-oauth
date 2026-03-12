# 🔧 TROUBLESHOOTING.md — Common Errors and Solutions

This guide covers errors you may encounter while setting up or running the
Shopify OAuth integration with Google Apps Script.

---

## Table of Contents

1. [invalid_request: The redirect_uri is not whitelisted](#1-invalid_request-the-redirect_uri-is-not-whitelisted)
2. [400 - OAuth error invalid_request](#2-400---oauth-error-invalid_request)
3. [App not found when opening OAuth URL](#3-app-not-found-when-opening-oauth-url)
4. [401 Unauthorized from Shopify API](#4-401-unauthorized-from-shopify-api)
5. [Access denied for scope errors](#5-access-denied-for-scope-errors)
6. [Can't find token in execution logs](#6-cant-find-token-in-execution-logs)
7. [Token in logs but script still returns 401](#7-token-in-logs-but-script-still-returns-401)
8. [No data appears in report](#8-no-data-appears-in-report)
9. [Drive file not created](#9-drive-file-not-created)
10. [Can't save Redirect URL in Dev Dashboard](#10-cant-save-redirect-url-in-dev-dashboard)
11. [Version saved but not Active](#11-version-saved-but-not-active)
12. [Script runs but no executions appear in logs](#12-script-runs-but-no-executions-appear-in-logs)
13. [OAuth URL opens but shows a blank page](#13-oauth-url-opens-but-shows-a-blank-page)

---

## 1. `invalid_request: The redirect_uri is not whitelisted`

**Symptom**: After clicking Install on the Shopify consent page, you see an
error like:

```
invalid_request: The redirect_uri is not whitelisted
```

**Cause**: The `redirect_uri` in the OAuth URL doesn't exactly match any URL
listed in your Shopify Dev Dashboard app configuration.

**Solutions**:

1. **Check for exact match** — Copy the value of `SHOPIFY_REDIRECT_URI` from
   `Code.gs` and compare it character-by-character to what's in Dev Dashboard.
   Common differences:
   - Trailing slash (`/exec` vs `/exec/`)
   - `http` vs `https`
   - Typos in the long Apps Script deployment ID

2. **Verify it ends in `/exec`** — The URL must be the production exec URL,
   not the `/dev` URL.

3. **Re-save in Dev Dashboard** — Sometimes the URL doesn't save properly.
   Delete the existing entry and re-add it.

4. **Check the app version is Active** — Only Redirect URLs in the active
   version are validated. See [issue 11](#11-version-saved-but-not-active).

---

## 2. `400 - OAuth error invalid_request`

**Symptom**: You see a 400 error page after being redirected from Shopify.

**Cause**: Usually one of these:
- Scopes in the OAuth URL don't match what's configured in Dev Dashboard
- The `client_id` is incorrect
- The authorization code was already used (codes are single-use)

**Solutions**:

1. **Re-run `buildOAuthInstallUrl()`** to generate a fresh code — never
   reuse the same OAuth URL twice.

2. **Check scopes** — The scopes in `SHOPIFY_SCOPES` must be a subset of the
   scopes you configured in your Dev Dashboard app. Log into Dev Dashboard and
   confirm the scopes are saved.

3. **Verify `SHOPIFY_API_KEY`** — Make sure you copied the API **key** (not the
   secret) into `SHOPIFY_API_KEY`.

---

## 3. `App not found` when opening OAuth URL

**Symptom**: Opening the OAuth install URL shows an "App not found" page.

**Cause**: The `client_id` in the URL doesn't match any app in the store.

**Solutions**:

1. **Check the store URL** — Confirm `SHOPIFY_STORE_URL` is the correct
   `.myshopify.com` domain (e.g., `my-store.myshopify.com`).

2. **Check `SHOPIFY_API_KEY`** — This must be the **API key** from the API
   credentials tab, not the secret.

3. **Check app status** — The app must be installed on or associated with that
   store. In Partners Dashboard, confirm the store is listed under **Test stores**
   or that you're the store owner.

---

## 4. `401 Unauthorized` from Shopify API

**Symptom**: Running `runOutOfStockReport()` fails with:

```
Shopify API returned HTTP 401
```

Or:

```
[{"message":"[API] Invalid API key or access token..."}]
```

**Solutions**:

1. **Token not saved** — Confirm `SHOPIFY_ACCESS_TOKEN` is set and not an empty
   string:
   ```javascript
   const SHOPIFY_ACCESS_TOKEN = "shpat_YOUR_TOKEN"; // must not be ""
   ```

2. **Script not redeployed** — After changing `SHOPIFY_ACCESS_TOKEN`, you must
   create a **new version** in Deploy → Manage deployments. The old deployed
   version still has the old (empty) token.

3. **Wrong token** — Make sure you copied the full token starting with `shpat_`.
   Partial tokens will fail.

4. **Token revoked** — If the app was uninstalled from the store, or you
   regenerated the API secret, the token is invalidated. Run the OAuth flow
   again to get a new token.

---

## 5. `Access denied for scope` errors

**Symptom**: API calls succeed but return permission errors like:

```
Access denied for scope read_inventory on shop
```

**Solutions**:

1. **Scopes not configured in Dev Dashboard** — Log into Partners Dashboard,
   edit your app configuration, and add the required scopes (e.g.,
   `read_inventory`, `read_products`).

2. **OAuth flow used old scopes** — If you added new scopes after completing
   OAuth, you must redo the OAuth flow to get a new token with the new scopes.
   New scopes are not added to existing tokens automatically.

3. **Re-run OAuth** — Update `SHOPIFY_SCOPES` in the script, redeploy, run
   `buildOAuthInstallUrl()`, complete the flow again, and save the new token.

---

## 6. Can't find token in execution logs

**Symptom**: The OAuth flow seemed to complete (you saw the success page), but
you can't find `shpat_...` in the execution logs.

**Solutions**:

1. **Check the correct execution** — Go to **View → Executions** (not just the
   bottom log panel in the editor). Click the execution that happened when you
   clicked Install — it will have been triggered by a `doGet` call.

2. **Execution timed out** — If the token exchange took too long, the execution
   may have been truncated. Try the flow again.

3. **Wrong script** — Make sure you're looking at the right Apps Script project.
   The callback URL points to a specific script — verify the exec URL matches.

4. **Using `/dev` URL** — If `SHOPIFY_REDIRECT_URI` pointed to the `/dev` URL,
   executions only appear when you're logged in as the script owner. Switch to
   the `/exec` URL.

---

## 7. Token in logs but script still returns 401

**Symptom**: You copied the token from the logs and pasted it into the script,
but API calls still return 401.

**Solutions**:

1. **Did not redeploy** — The most common cause. After pasting the token,
   you must:
   - **Deploy → Manage deployments → Edit → New version → Deploy**
   - Simply saving the script is not enough for the `/exec` URL.

2. **Copied extra whitespace** — Paste the token into a plain-text editor first
   and verify there are no leading/trailing spaces.

3. **Quotes around token** — Make sure it looks like:
   ```javascript
   const SHOPIFY_ACCESS_TOKEN = "shpat_abc123...";
   ```
   Not:
   ```javascript
   const SHOPIFY_ACCESS_TOKEN = ""shpat_abc123...""; // wrong — double quotes
   ```

---

## 8. No data appears in report

**Symptom**: The script runs without errors but the report is empty or shows
"No out-of-stock products found".

**Solutions**:

1. **Products are actually in stock** — Check your store inventory manually.

2. **Inventory tracking disabled** — The script only reports variants where
   `inventoryItem.tracked = true`. Variants with tracking disabled are skipped.
   Enable inventory tracking in Shopify admin for those variants.

3. **Wrong scopes** — `read_inventory` and `read_products` are both required.
   Verify the token's scopes in the execution log (printed during the OAuth callback).

4. **Store URL wrong** — `SHOPIFY_STORE_URL` must be the raw `.myshopify.com`
   domain without `https://` prefix.

---

## 9. Drive file not created

**Symptom**: The script runs but no HTML file appears in Google Drive.

**Solutions**:

1. **Invalid `DRIVE_FOLDER_ID`** — Check the folder ID. Get it from the folder's
   URL: `https://drive.google.com/drive/folders/`**THIS_PART**

2. **Folder not shared with script** — The script runs as your Google account
   (because you chose "Execute as: Me"), so it can access any folder you own.
   If it's a shared folder owned by someone else, you may not have edit access.

3. **Script falling back to root Drive** — If the folder ID is wrong, the script
   logs a warning and saves to root Drive instead. Check the execution logs for:
   ```
   Could not access DRIVE_FOLDER_ID '...' Saving to root Drive instead.
   ```

---

## 10. Can't save Redirect URL in Dev Dashboard

**Symptom**: The Dev Dashboard form won't save or shows a validation error on
the Redirect URLs field.

**Solutions**:

1. **URL must start with `https://`** — The Apps Script exec URL always starts
   with `https://script.google.com/...` which is valid.

2. **Creating a version is required** — In some versions of the Partners
   Dashboard, you can't edit app configuration directly. You must click
   **Create version**, fill in all fields in the version form, then save.

3. **All required fields must be filled** — The version form typically requires
   App name, App URL, and at least one Redirect URL. Fill in placeholder values
   for fields you don't need (e.g., `https://example.com` for App URL).

---

## 11. Version saved but not Active

**Symptom**: You saved a version in Dev Dashboard, but Shopify still uses the
old redirect URLs.

**Solutions**:

1. After saving a version, it is in **"Draft"** state by default.
2. Click **Release** (or **Publish**) to make it the active version.
3. Confirm the version card shows a green **Active** badge.

> ⚠️ Only the **Active** version's Redirect URLs are validated by Shopify.

---

## 12. Script runs but no executions appear in logs

**Symptom**: You triggered the script but nothing appears under View → Executions.

**Solutions**:

1. **Wait and refresh** — Executions can take 30–60 seconds to appear.
2. **Wrong project** — Make sure you're in the correct Apps Script project.
3. **Using editor Run button** — Executions from the editor's Run button appear
   in the same Executions list. They should show up immediately.

---

## 13. OAuth URL opens but shows a blank page

**Symptom**: After clicking Install, the browser redirects to the Apps Script
URL but shows a blank or error page.

**Solutions**:

1. **Script error in `doGet`** — Check View → Executions for the execution that
   fired and look at the error message.

2. **Deployment not using latest code** — Create a new deployment version after
   every code change.

3. **`Who has access` set to "Only myself"** — The web app must be set to
   **Anyone** so that Shopify's redirect can reach it without Google login.

---

## 🐛 Debugging Tips

- **Add `console.log()` everywhere** — Apps Script logs appear in View → Executions.
- **Test `doGet` manually** — Open your exec URL in the browser to see if the
  web app is reachable before running OAuth.
- **Use `muteHttpExceptions: true`** — Already set in `Code.gs`. This ensures
  error responses from Shopify are captured in logs rather than throwing.
- **Check API version** — The script uses `2024-01`. If this is outdated,
  update the endpoint URL in `fetchActiveOutOfStockProductsGraphQL()`.

---

## ✅ Quick Checklist

Before reporting a problem, verify each item:

- [ ] `SHOPIFY_API_KEY` = Client ID from Dev Dashboard (not the secret)
- [ ] `SHOPIFY_API_SECRET` = Client Secret from Dev Dashboard
- [ ] `SHOPIFY_STORE_URL` = your store's `.myshopify.com` domain (no `https://`)
- [ ] `SHOPIFY_REDIRECT_URI` = your Apps Script `/exec` URL (not `/dev`)
- [ ] Redirect URL in Dev Dashboard matches `SHOPIFY_REDIRECT_URI` exactly
- [ ] Dev Dashboard app version is marked **Active**
- [ ] `SHOPIFY_ACCESS_TOKEN` is filled with `shpat_...` token
- [ ] Script was **redeployed** (new version) after pasting the token
- [ ] Web app is set to **"Anyone"** can access
- [ ] `DRIVE_FOLDER_ID` is a valid folder ID from your Google Drive

---

*Still stuck? Open an issue at
[github.com/rubyroseahd/shopify-apps-script-oauth](https://github.com/rubyroseahd/shopify-apps-script-oauth/issues)
with the error message and the step you're on.*
