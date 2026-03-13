// ==============================================================================
// Code.gs — Shopify OAuth + Out-of-Stock Report for Google Apps Script
// ==============================================================================
//
// OVERVIEW
// --------
// This script does two things:
//   1. Handles the Shopify OAuth callback so you can obtain an access token
//      (no backend server required — Apps Script acts as the redirect handler).
//   2. Queries the Shopify Admin GraphQL API for out-of-stock products and
//      generates a report as both a Google Sheet and an HTML file in Drive.
//
// QUICK SETUP (see SETUP.md for full details)
// -------------------------------------------
//   1. Fill in the placeholders in the CONFIG section below.
//   2. Deploy this script as a Web App (Deploy → New deployment → Web app).
//   3. Copy the Web App URL and paste it into:
//        a. The SHOPIFY_REDIRECT_URI constant below.
//        b. Your Shopify Dev Dashboard → App version → Redirect URLs.
//   4. Run buildOAuthInstallUrl() and open the generated URL in a browser.
//   5. Complete the Shopify install flow — Apps Script will log your token.
//   6. Copy the token from View → Executions and paste it into
//      SHOPIFY_ACCESS_TOKEN below.
//   7. Redeploy (new version) and run the report.
//
// ==============================================================================


// ==============================================================================
// ██████  CONFIG — FILL THESE IN
// ==============================================================================

/** Shopify API key (Client ID) — Dev Dashboard → API credentials */
const SHOPIFY_API_KEY = "YOUR_CLIENT_ID_HERE";

/** Shopify API secret (Client Secret) — Dev Dashboard → API credentials */
const SHOPIFY_API_SECRET = "YOUR_CLIENT_SECRET_HERE";

/** Your store's .myshopify.com domain, e.g. "my-store.myshopify.com" */
const SHOPIFY_STORE_URL = "YOUR_STORE.myshopify.com";

/**
 * Paste your Apps Script Web App exec URL here.
 * Format: https://script.google.com/macros/s/AKfycb.../exec
 * Must EXACTLY match what you entered in the Dev Dashboard Redirect URLs.
 */
const SHOPIFY_REDIRECT_URI = "YOUR_APPS_SCRIPT_EXEC_URL_HERE";

/**
 * Leave empty until you complete the OAuth flow.
 * After completing OAuth, paste the token you copy from the execution logs here.
 * Format: shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 */
const SHOPIFY_ACCESS_TOKEN = "";

// ------------------------------------------------------------------------------
// Shopify API scopes requested during OAuth
// Add or remove scopes based on what your app needs.
// Full list: https://shopify.dev/docs/api/usage/access-scopes
// ------------------------------------------------------------------------------
const SHOPIFY_SCOPES = "read_inventory,read_products,read_reports";

// ------------------------------------------------------------------------------
// Report / Drive configuration
// ------------------------------------------------------------------------------

/** Name of the log sheet tab inside the Google Spreadsheet */
const LOG_SHEET_NAME = "Log";

/**
 * Google Drive folder ID where reports will be saved.
 * Open the folder in Drive, then copy the ID from the URL:
 *   https://drive.google.com/drive/folders/THIS_IS_THE_ID
 */
const DRIVE_FOLDER_ID = "YOUR_DRIVE_FOLDER_ID_HERE";

/**
 * How many old HTML report files to keep in Drive before cleaning up.
 * Oldest files beyond this limit are deleted automatically.
 */
const MAX_REPORTS_TO_KEEP = 5;

/**
 * Optional: set a secret run token to restrict who can trigger the report.
 * When set, requests must include ?token=YOUR_SECRET in the URL.
 * Leave empty ("") to allow anyone with the URL to run the report.
 */
const RUN_TOKEN = "";

/**
 * Set to true to share generated report files with anyone who has the link.
 * When false (default) the file is private to the account that runs the script.
 * Only enable if you intentionally want inventory data to be publicly readable.
 */
const REPORT_SHARE_WITH_LINK = false;


// ==============================================================================
// ██████  OAUTH HELPERS
// ==============================================================================

/**
 * buildOAuthInstallUrl()
 * ----------------------
 * Generates the Shopify OAuth install URL and logs it to the execution console.
 *
 * HOW TO USE:
 *   1. Select "buildOAuthInstallUrl" from the function dropdown in the editor.
 *   2. Click Run.
 *   3. Open View → Executions and click the latest run to see the logged URL.
 *   4. Copy the URL and open it in a browser to start the OAuth flow.
 */
function buildOAuthInstallUrl() {
  // Generate a random nonce to guard against CSRF attacks.
  // It is stored in PropertiesService so the callback can verify it.
  const state = Math.random().toString(36).substring(2, 15);
  PropertiesService.getScriptProperties().setProperty("oauth_state", state);

  const params = new URLSearchParams({
    client_id: SHOPIFY_API_KEY,
    scope:     SHOPIFY_SCOPES,
    redirect_uri: SHOPIFY_REDIRECT_URI,
    state:     state,
  });

  const installUrl = `https://${SHOPIFY_STORE_URL}/admin/oauth/authorize?${params.toString()}`;

  console.log("=".repeat(80));
  console.log("OAUTH INSTALL URL — Open this in your browser:");
  console.log(installUrl);
  console.log("=".repeat(80));
  console.log("State (nonce) used:", state);
  console.log("Redirect URI:", SHOPIFY_REDIRECT_URI);
  console.log("");
  console.log("After opening the URL:");
  console.log("  1. You will see the Shopify install consent screen.");
  console.log("  2. Click Install.");
  console.log("  3. You will be redirected to your Apps Script web app.");
  console.log("  4. Check View → Executions for the SHOPIFY ACCESS TOKEN log.");
}


// ==============================================================================
// ██████  WEB APP ENTRY POINT
// ==============================================================================

/**
 * doGet(e)
 * --------
 * This is the Apps Script Web App entry point. It is called automatically
 * whenever someone (or Shopify's OAuth redirect) hits your /exec URL.
 *
 * Routing logic:
 *   • If the request contains ?code= → OAuth callback from Shopify
 *   • If the request contains ?run=report (+ optional ?token=) → run report
 *   • Otherwise → show a welcome / status page
 *
 * @param {Object} e  The Apps Script event object containing query parameters.
 * @returns {HtmlOutput} An HTML page to display in the browser.
 */
function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};

  try {
    // ── OAuth callback ──────────────────────────────────────────────────────
    if (params.code) {
      return handleShopifyOAuthCallback(params);
    }

    // ── Manual report trigger ───────────────────────────────────────────────
    if (params.run === "report") {
      // Optional token guard
      if (RUN_TOKEN && params.token !== RUN_TOKEN) {
        return HtmlService.createHtmlOutput(
          "<h2>🔒 Unauthorized</h2><p>Invalid or missing run token.</p>"
        ).setTitle("Unauthorized");
      }
      const result = runOutOfStockReport();
      return HtmlService.createHtmlOutput(
        `<h2>✅ Report Complete</h2><pre>${result}</pre>`
      ).setTitle("Report Complete");
    }

    // ── Welcome page ────────────────────────────────────────────────────────
    return HtmlService.createHtmlOutput(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Shopify Apps Script OAuth</title>
          <style>
            body { font-family: sans-serif; max-width: 600px; margin: 60px auto; padding: 0 20px; }
            h1   { color: #333; }
            code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; }
            .status { background: #e8f5e9; border-left: 4px solid #4caf50; padding: 12px 16px; margin: 16px 0; }
          </style>
        </head>
        <body>
          <h1>🛍️ Shopify Apps Script OAuth</h1>
          <div class="status">
            <strong>Web app is running!</strong> This URL is registered as the
            OAuth redirect handler for your Shopify app.
          </div>
          <p>To trigger the out-of-stock report, append <code>?run=report</code> to this URL.</p>
          <p>To begin the OAuth flow, run <code>buildOAuthInstallUrl()</code> in the script editor.</p>
        </body>
      </html>
    `).setTitle("Shopify Apps Script OAuth");

  } catch (err) {
    console.error("doGet error:", err);
    return HtmlService.createHtmlOutput(
      `<h2>❌ Error</h2><p>${escapeHtml(String(err.message))}</p>`
    ).setTitle("Error");
  }
}


// ==============================================================================
// ██████  OAUTH CALLBACK HANDLER
// ==============================================================================

/**
 * handleShopifyOAuthCallback(params)
 * -----------------------------------
 * Called by doGet() when Shopify redirects back with ?code=... after the
 * merchant clicks Install.
 *
 * What it does:
 *   1. Reads the one-time authorization code from the URL.
 *   2. POSTs to Shopify's token endpoint to exchange the code for an
 *      access token (this is the only step that needs your API secret).
 *   3. Logs the token to the execution console so you can copy it.
 *   4. Returns a success HTML page.
 *
 * @param {Object} params  Query parameters from the Shopify redirect URL.
 * @returns {HtmlOutput}
 */
function handleShopifyOAuthCallback(params) {
  const code  = params.code;
  const shop  = params.shop;   // e.g. "your-store.myshopify.com"
  const state = params.state;

  console.log("OAuth callback received.");
  console.log("  Shop:", shop);
  console.log("  State:", state);
  console.log("  Code (first 8 chars):", code ? code.substring(0, 8) + "..." : "MISSING");

  // ── Validate state (CSRF protection) ─────────────────────────────────────
  const props       = PropertiesService.getScriptProperties();
  const storedState = props.getProperty("oauth_state");
  // Consume the stored state immediately so it cannot be reused
  props.deleteProperty("oauth_state");

  if (!storedState || storedState !== state) {
    console.error("State mismatch — possible CSRF attempt. Expected:", storedState, "Got:", state);
    return HtmlService.createHtmlOutput(
      "<h2>❌ OAuth Error</h2><p>Invalid state parameter. Please start the OAuth flow again.</p>"
    ).setTitle("OAuth Error");
  }

  // ── Validate shop against configured store (prevent SSRF) ─────────────────
  // Only allow the token exchange to target the store this script is configured
  // for.  Using the incoming `shop` param directly would let an attacker craft
  // a callback that sends your API secret to an arbitrary host.
  if (!shop || shop !== SHOPIFY_STORE_URL) {
    console.error("Shop mismatch — rejecting callback. Expected:", SHOPIFY_STORE_URL, "Got:", shop);
    return HtmlService.createHtmlOutput(
      "<h2>❌ OAuth Error</h2><p>Shop parameter does not match the configured store.</p>"
    ).setTitle("OAuth Error");
  }

  if (!code) {
    return HtmlService.createHtmlOutput(
      "<h2>❌ OAuth Error</h2><p>No authorization code received from Shopify.</p>"
    ).setTitle("OAuth Error");
  }

  // ── Exchange the code for a permanent access token ────────────────────────
  // Always use SHOPIFY_STORE_URL (not the incoming `shop` param) to build the
  // URL so that the target host is always the configured store.
  const tokenUrl = `https://${SHOPIFY_STORE_URL}/admin/oauth/access_token`;

  const payload = {
    client_id:     SHOPIFY_API_KEY,
    client_secret: SHOPIFY_API_SECRET,
    code:          code,
  };

  let response;
  try {
    response = UrlFetchApp.fetch(tokenUrl, {
      method:  "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
  } catch (fetchErr) {
    console.error("Token exchange fetch failed:", fetchErr);
    return HtmlService.createHtmlOutput(
      `<h2>❌ Token Exchange Failed</h2><p>${escapeHtml(String(fetchErr.message))}</p>`
    ).setTitle("OAuth Error");
  }

  const statusCode = response.getResponseCode();
  const body       = response.getContentText();

  console.log("Token endpoint response code:", statusCode);

  if (statusCode !== 200) {
    // Log the raw body for debugging but do NOT render it in HTML — the body
    // may contain attacker-influenced content that could cause reflected XSS.
    console.error("Token exchange error body:", body);
    return HtmlService.createHtmlOutput(
      `<h2>❌ Token Exchange Failed (HTTP ${statusCode})</h2>
       <p>Shopify returned an error. Check the execution logs for details.</p>`
    ).setTitle("OAuth Error");
  }

  let tokenData;
  try {
    tokenData = JSON.parse(body);
  } catch (parseErr) {
    console.error("Failed to parse token response:", body);
    return HtmlService.createHtmlOutput(
      "<h2>❌ Parse Error</h2><p>Could not parse Shopify token response.</p>"
    ).setTitle("OAuth Error");
  }

  const accessToken = tokenData.access_token;
  const scope       = tokenData.scope;

  // ── Log the token prominently ─────────────────────────────────────────────
  // Go to View → Executions → click this run → look for this block in the logs
  console.log("=".repeat(80));
  console.log("✅ SHOPIFY ACCESS TOKEN (COPY THIS):", accessToken);
  console.log("=".repeat(80));
  console.log("Granted scopes:", scope);
  console.log("");
  console.log("NEXT STEPS:");
  console.log("  1. Copy the token above (starting with 'shpat_').");
  console.log("  2. Open the Apps Script editor.");
  console.log("  3. Paste it into: const SHOPIFY_ACCESS_TOKEN = \"paste_here\";");
  console.log("  4. Save and redeploy (Deploy → Manage deployments → New version).");

  // ── Success page ──────────────────────────────────────────────────────────
  return HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>App Installed Successfully</title>
        <style>
          body { font-family: sans-serif; max-width: 600px; margin: 60px auto; padding: 0 20px; }
          .success { background: #e8f5e9; border-left: 4px solid #4caf50; padding: 16px 20px; }
          ol { line-height: 2; }
          code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
        </style>
      </head>
      <body>
        <h1>✅ App Installed Successfully!</h1>
        <div class="success">
          <p>Shopify has granted access. Your access token has been logged.</p>
        </div>
        <h2>Next steps:</h2>
        <ol>
          <li>Go back to the <strong>Apps Script editor</strong>.</li>
          <li>Click <strong>View → Executions</strong>.</li>
          <li>Click the <strong>latest execution</strong> (this one).</li>
          <li>Find the line: <code>✅ SHOPIFY ACCESS TOKEN (COPY THIS): shpat_...</code></li>
          <li>Copy the token and paste it into <code>SHOPIFY_ACCESS_TOKEN</code> in <code>Code.gs</code>.</li>
          <li>Save and <strong>redeploy</strong> (Deploy → Manage deployments → New version).</li>
        </ol>
      </body>
    </html>
  `).setTitle("App Installed Successfully");
}


// ==============================================================================
// ██████  SHOPIFY GRAPHQL API — OUT-OF-STOCK PRODUCTS
// ==============================================================================

/**
 * fetchActiveOutOfStockProductsGraphQL()
 * ---------------------------------------
 * Queries the Shopify Admin GraphQL API for all active products that have
 * at least one variant with zero inventory.
 *
 * Uses cursor-based pagination to handle stores with large product catalogs.
 *
 * @returns {Array<Object>} Array of product objects with vendor and variant info.
 */
function fetchActiveOutOfStockProductsGraphQL() {
  if (!SHOPIFY_ACCESS_TOKEN) {
    throw new Error(
      "SHOPIFY_ACCESS_TOKEN is empty. Complete the OAuth flow first (see SETUP.md)."
    );
  }

  const endpoint = `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/graphql.json`;

  const headers = {
    "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json",
  };

  // GraphQL query — fetches products with their variants and inventory levels.
  // Filters: status = ACTIVE (published products only).
  const query = `
    query GetOutOfStockProducts($cursor: String) {
      products(first: 50, after: $cursor, query: "status:active") {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            title
            vendor
            handle
            status
            variants(first: 250) {
              edges {
                node {
                  id
                  title
                  sku
                  inventoryQuantity
                  inventoryItem {
                    id
                    tracked
                  }
                }
              }
              pageInfo {
                hasNextPage
              }
            }
          }
        }
      }
    }
  `;

  const outOfStockProducts = [];
  let cursor = null;
  let pageNum = 0;

  // ── Paginate through all products ─────────────────────────────────────────
  while (true) {
    pageNum++;
    console.log(`Fetching page ${pageNum} of products...`);

    const requestBody = {
      query:     query,
      variables: { cursor: cursor },
    };

    const response = UrlFetchApp.fetch(endpoint, {
      method:  "post",
      headers: headers,
      payload: JSON.stringify(requestBody),
      muteHttpExceptions: true,
    });

    const statusCode = response.getResponseCode();
    if (statusCode !== 200) {
      throw new Error(
        `Shopify API returned HTTP ${statusCode}: ${response.getContentText()}`
      );
    }

    const data = JSON.parse(response.getContentText());

    if (data.errors) {
      throw new Error("GraphQL errors: " + JSON.stringify(data.errors));
    }

    const productsPage = data.data.products;
    const edges        = productsPage.edges;

    // ── Check each product for out-of-stock variants ───────────────────────
    edges.forEach(({ node: product }) => {
      // Warn if a product has more variants than the page limit (250).
      // Shopify supports up to ~2000 variants per product in some plans.
      // Full variant pagination within a product query is not implemented here;
      // products with >250 variants may have some out-of-stock variants missed.
      if (product.variants.pageInfo.hasNextPage) {
        console.warn(
          `Product "${product.title}" has more than 250 variants. ` +
          "Only the first 250 were checked for out-of-stock status."
        );
      }

      const oosVariants = product.variants.edges
        .map(({ node: v }) => v)
        .filter(v => {
          // Only consider tracked variants with zero or negative inventory
          if (!v.inventoryItem || !v.inventoryItem.tracked) return false;
          return v.inventoryQuantity !== null && v.inventoryQuantity <= 0;
        });

      if (oosVariants.length > 0) {
        outOfStockProducts.push({
          id:          product.id,
          title:       product.title,
          vendor:      product.vendor || "Unknown Vendor",
          handle:      product.handle,
          oosVariants: oosVariants,
        });
      }
    });

    // ── Check if more pages exist ──────────────────────────────────────────
    if (!productsPage.pageInfo.hasNextPage) break;
    cursor = productsPage.pageInfo.endCursor;

    // Polite delay to avoid rate limiting (Shopify allows ~2 req/s on GraphQL)
    Utilities.sleep(500);
  }

  console.log(
    `Pagination complete. Scanned ${pageNum} page(s). ` +
    `Found ${outOfStockProducts.length} out-of-stock product(s).`
  );

  return outOfStockProducts;
}


// ==============================================================================
// ██████  REPORT GENERATION
// ==============================================================================

/**
 * runOutOfStockReport()
 * ----------------------
 * Main orchestration function. Fetches out-of-stock products, then:
 *   • Writes a summary to a Google Sheet (creates it if it doesn't exist).
 *   • Saves a formatted HTML report to Google Drive.
 *   • Cleans up old report files beyond MAX_REPORTS_TO_KEEP.
 *
 * @returns {string} A human-readable summary of the run.
 */
function runOutOfStockReport() {
  console.log("=".repeat(60));
  console.log("Starting Out-of-Stock Report");
  console.log("Timestamp:", new Date().toISOString());
  console.log("=".repeat(60));

  // ── Fetch data ─────────────────────────────────────────────────────────────
  const products = fetchActiveOutOfStockProductsGraphQL();

  if (products.length === 0) {
    const msg = "✅ No out-of-stock products found! All inventory is stocked.";
    console.log(msg);
    logToSheet("No out-of-stock products found.", 0);
    return msg;
  }

  console.log(`Found ${products.length} product(s) with out-of-stock variants.`);

  // ── Group products by vendor ───────────────────────────────────────────────
  const byVendor = groupByVendor(products);

  // ── Generate HTML report and save to Drive ─────────────────────────────────
  const htmlContent = buildHtmlReport(byVendor, products.length);
  const driveFileUrl = saveToDrive(htmlContent);

  // ── Log summary to Google Sheet ────────────────────────────────────────────
  logToSheet(`Report saved: ${driveFileUrl}`, products.length);

  // ── Clean up old report files ──────────────────────────────────────────────
  cleanUpOldReports();

  const summary = `Done! Found ${products.length} product(s) with out-of-stock variants. Report saved to Drive.`;
  console.log(summary);
  return summary;
}


/**
 * groupByVendor(products)
 * -------------------------
 * Groups an array of product objects by their vendor name.
 *
 * @param {Array<Object>} products
 * @returns {Object} Keys are vendor names, values are arrays of products.
 */
function groupByVendor(products) {
  return products.reduce((acc, product) => {
    const vendor = product.vendor || "Unknown Vendor";
    if (!acc[vendor]) acc[vendor] = [];
    acc[vendor].push(product);
    return acc;
  }, {});
}


/**
 * buildHtmlReport(byVendor, totalCount)
 * ---------------------------------------
 * Builds a styled HTML string representing the out-of-stock report,
 * grouped by vendor.
 *
 * @param {Object} byVendor    Products grouped by vendor name.
 * @param {number} totalCount  Total number of out-of-stock products.
 * @returns {string} Complete HTML document.
 */
function buildHtmlReport(byVendor, totalCount) {
  const timestamp  = new Date().toLocaleString();
  const vendorList = Object.keys(byVendor).sort();

  // ── Build vendor sections ──────────────────────────────────────────────────
  const vendorSections = vendorList.map(vendor => {
    const products = byVendor[vendor];

    const productRows = products.map(product => {
      const variantRows = product.oosVariants.map(v => `
        <tr class="variant-row">
          <td class="variant-title">${escapeHtml(v.title)}</td>
          <td>${escapeHtml(v.sku || "—")}</td>
          <td class="qty-zero">${v.inventoryQuantity}</td>
        </tr>
      `).join("");

      return `
        <tr class="product-row">
          <td colspan="3">
            <strong>${escapeHtml(product.title)}</strong>
            <a href="https://${SHOPIFY_STORE_URL}/admin/products/${product.id.split("/").pop()}"
               target="_blank" class="admin-link">View in Admin ↗</a>
          </td>
        </tr>
        <tr class="header-sub">
          <th>Variant</th>
          <th>SKU</th>
          <th>Qty</th>
        </tr>
        ${variantRows}
      `;
    }).join("");

    return `
      <section class="vendor-section">
        <h2>🏷️ ${escapeHtml(vendor)}
          <span class="badge">${products.length} product${products.length !== 1 ? "s" : ""}</span>
        </h2>
        <table>
          ${productRows}
        </table>
      </section>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Out-of-Stock Report — ${timestamp}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 960px;
      margin: 0 auto;
      padding: 24px;
      color: #333;
      background: #fafafa;
    }
    header {
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 24px;
    }
    header h1 { margin: 0 0 8px; color: #e53e3e; }
    header p  { margin: 0; color: #666; font-size: 0.95em; }
    .summary-pill {
      display: inline-block;
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 20px;
      padding: 4px 14px;
      font-size: 0.85em;
      font-weight: 600;
      margin-top: 12px;
    }
    .vendor-section {
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px 24px;
      margin-bottom: 20px;
    }
    .vendor-section h2 {
      margin: 0 0 16px;
      font-size: 1.2em;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .badge {
      background: #e53e3e;
      color: #fff;
      font-size: 0.7em;
      padding: 2px 10px;
      border-radius: 12px;
      font-weight: normal;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9em;
    }
    .product-row td {
      padding: 10px 8px 4px;
      font-size: 1em;
      border-top: 1px solid #e0e0e0;
    }
    .header-sub th {
      background: #f5f5f5;
      padding: 6px 8px;
      text-align: left;
      font-size: 0.8em;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .variant-row td { padding: 5px 8px; }
    .variant-title { color: #555; }
    .qty-zero { color: #e53e3e; font-weight: 700; }
    .admin-link {
      font-size: 0.75em;
      color: #2196f3;
      text-decoration: none;
      margin-left: 10px;
    }
    .admin-link:hover { text-decoration: underline; }
    footer { text-align: center; color: #999; font-size: 0.8em; margin-top: 32px; }
  </style>
</head>
<body>
  <header>
    <h1>📦 Out-of-Stock Report</h1>
    <p>Store: <strong>${SHOPIFY_STORE_URL}</strong></p>
    <p>Generated: <strong>${timestamp}</strong></p>
    <div class="summary-pill">⚠️ ${totalCount} product${totalCount !== 1 ? "s" : ""} out of stock</div>
  </header>

  ${vendorSections}

  <footer>
    Generated by Shopify Apps Script OAuth Integration
    · <a href="https://github.com/rubyroseahd/shopify-apps-script-oauth">GitHub</a>
  </footer>
</body>
</html>`;
}


// ==============================================================================
// ██████  GOOGLE DRIVE — SAVE REPORT
// ==============================================================================

/**
 * saveToDrive(htmlContent)
 * -------------------------
 * Saves the HTML report string to the configured Google Drive folder.
 *
 * @param {string} htmlContent  The HTML report to save.
 * @returns {string} The URL of the created Drive file.
 */
function saveToDrive(htmlContent) {
  const timestamp = Utilities.formatDate(
    new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HH-mm-ss"
  );
  const fileName = `OOS_Report_${timestamp}.html`;

  let folder;
  try {
    folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  } catch (e) {
    // Fallback to root Drive if folder ID is invalid / not set
    console.warn(
      "Could not access DRIVE_FOLDER_ID '" + DRIVE_FOLDER_ID + "'. " +
      "Saving to root Drive instead. Error: " + e.message
    );
    folder = DriveApp.getRootFolder();
  }

  const file = folder.createFile(fileName, htmlContent, MimeType.HTML);

  // Only share the file publicly if explicitly opted in via REPORT_SHARE_WITH_LINK.
  // Leaving this off (default) keeps inventory data private to the script owner.
  if (REPORT_SHARE_WITH_LINK) {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }

  const url = file.getUrl();
  console.log("Report saved to Drive:", url);
  return url;
}


// ==============================================================================
// ██████  GOOGLE SHEETS — LOGGING
// ==============================================================================

/**
 * logToSheet(message, productCount)
 * -----------------------------------
 * Appends a log row to the Google Sheet identified by LOG_SHEET_NAME.
 * Creates the spreadsheet and sheet if they don't exist yet.
 *
 * @param {string} message       Log message or report URL.
 * @param {number} productCount  Number of out-of-stock products found.
 */
function logToSheet(message, productCount) {
  try {
    // ── Locate or create the log spreadsheet ──────────────────────────────
    // Store the spreadsheet ID in PropertiesService after the first creation
    // so that future runs can open it directly (by ID) rather than relying on
    // a name search, which could accidentally open a non-spreadsheet file.
    let ss;
    const props   = PropertiesService.getScriptProperties();
    const savedId = props.getProperty("log_spreadsheet_id");

    if (savedId) {
      try {
        ss = SpreadsheetApp.openById(savedId);
      } catch (e) {
        // Saved ID is stale (e.g., file was deleted) — fall through to create.
        console.warn("Saved log spreadsheet ID is invalid:", e.message);
        ss = null;
      }
    }

    if (!ss) {
      // Search among *spreadsheet* files only to avoid opening a same-named
      // file of a different type (e.g., a plain Google Doc named "OOS Report Log").
      const files = DriveApp.getFilesByType(MimeType.GOOGLE_SHEETS);
      while (files.hasNext()) {
        const f = files.next();
        if (f.getName() === "OOS Report Log") {
          ss = SpreadsheetApp.open(f);
          break;
        }
      }
    }

    if (!ss) {
      ss = SpreadsheetApp.create("OOS Report Log");
      console.log("Created new log spreadsheet:", ss.getUrl());
    }

    // Cache the ID so future runs avoid the Drive search.
    props.setProperty("log_spreadsheet_id", ss.getId());

    // Find or create the log sheet tab
    let sheet = ss.getSheetByName(LOG_SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(LOG_SHEET_NAME);
      // Add header row
      sheet.appendRow(["Timestamp", "OOS Products", "Message"]);
      sheet.getRange(1, 1, 1, 3).setFontWeight("bold");
    }

    const timestamp = new Date().toISOString();
    sheet.appendRow([timestamp, productCount, message]);

  } catch (err) {
    // Non-fatal — log the error but don't stop the report
    console.error("Failed to write to log sheet:", err.message);
  }
}


// ==============================================================================
// ██████  CLEANUP
// ==============================================================================

/**
 * cleanUpOldReports()
 * --------------------
 * Deletes old HTML report files from Drive, keeping only the most recent
 * MAX_REPORTS_TO_KEEP files. Runs after each report generation.
 */
function cleanUpOldReports() {
  try {
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const files  = folder.getFilesByType(MimeType.HTML);

    const reportFiles = [];
    while (files.hasNext()) {
      const file = files.next();
      if (file.getName().startsWith("OOS_Report_")) {
        reportFiles.push(file);
      }
    }

    // Sort oldest first
    reportFiles.sort((a, b) => a.getDateCreated() - b.getDateCreated());

    const toDelete = reportFiles.length - MAX_REPORTS_TO_KEEP;
    if (toDelete > 0) {
      console.log(`Cleaning up ${toDelete} old report file(s)...`);
      for (let i = 0; i < toDelete; i++) {
        const f = reportFiles[i];
        console.log("  Deleting:", f.getName());
        f.setTrashed(true);
      }
    }
  } catch (err) {
    console.warn("cleanUpOldReports error (non-fatal):", err.message);
  }
}


// ==============================================================================
// ██████  UTILITIES
// ==============================================================================

/**
 * escapeHtml(str)
 * ----------------
 * Escapes HTML special characters to prevent XSS in generated reports.
 *
 * @param {string} str  Raw string that may contain HTML characters.
 * @returns {string}    Safely escaped string.
 */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
