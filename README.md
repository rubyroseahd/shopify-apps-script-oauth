# 🛍️ shopify-apps-script-oauth

> **Shopify OAuth authentication using Google Apps Script as the callback handler — no backend server required.**

Get a Shopify Admin API access token using only a Google account and a free
Apps Script project. No hosting, no custom domain, no framework.

---

## 🎯 What This Does

This project shows you how to complete the full Shopify OAuth flow and obtain
a permanent `shpat_...` access token, using Google Apps Script as the OAuth
redirect handler. Once you have the token, the included script queries the
Shopify Admin GraphQL API and generates an out-of-stock inventory report saved
to Google Drive.

---

## ✨ Key Benefits

- **No backend server** — Apps Script acts as the redirect handler for free
- **No hosting costs** — runs entirely on Google's infrastructure
- **No custom domain** — uses a `script.google.com` URL
- **Simple setup** — copy one file, fill in 4 values, follow 8 steps
- **Working example included** — out-of-stock inventory report with Drive output

---

## 🚀 Quick Start (7 steps)

1. **Create a Shopify app** in [Partners Dashboard](https://partners.shopify.com) and note your API key and secret.
2. **Copy `Code.gs`** into a new [Google Apps Script](https://script.google.com) project.
3. **Fill in the config** at the top of `Code.gs` (API key, secret, store URL, Drive folder ID).
4. **Deploy as Web App** (Deploy → New deployment → Web app → Anyone).
5. **Add the exec URL** to your Shopify app's Allowed Redirect URLs.
6. **Run `buildOAuthInstallUrl()`**, open the generated URL, click Install, and copy the token from the execution logs.
7. **Paste the token** into `SHOPIFY_ACCESS_TOKEN`, redeploy, and run the report.

📖 See **[SETUP.md](./SETUP.md)** for the complete step-by-step guide.

---

## 📋 Prerequisites

- A [Shopify Partner account](https://partners.shopify.com) (free)
- A Shopify development store or a store where you are the owner
- A Google account (for Apps Script and Drive)
- Basic familiarity with copy-pasting code

---

## 📁 Repository Structure

```
shopify-apps-script-oauth/
├── README.md                  # This file — overview and quick start
├── SETUP.md                   # Complete 8-phase setup guide
├── Code.gs                    # Full Google Apps Script code
├── TROUBLESHOOTING.md         # Solutions to 13+ common errors
├── CONFIG_TEMPLATE.md         # Checklist to track your configuration
├── .gitignore                 # Protects credentials from being committed
└── docs/
    └── oauth-flow-diagram.md  # Visual ASCII diagram of the OAuth flow
```

---

## 🔧 Features

- **OAuth 2.0 flow** — proper authorization code exchange (no static tokens)
- **GraphQL API** — uses the modern Shopify Admin GraphQL API (2024-01)
- **Cursor-based pagination** — handles stores with large product catalogs
- **Vendor grouping** — out-of-stock report organized by vendor
- **HTML report** — styled report saved to Google Drive with shareable link
- **Google Sheets logging** — run history tracked in a log spreadsheet
- **Automatic cleanup** — keeps only the most recent N report files
- **Rate limit protection** — polite delays between paginated API calls

---

## 💡 Why This Exists

Shopify is deprecating simple static Admin API tokens for public-facing apps.
The proper way to get API access is through OAuth — but OAuth traditionally
requires a backend server to receive the redirect callback.

This project solves that by using **Google Apps Script as a zero-cost,
zero-setup backend**. Apps Script can serve HTTP requests publicly via its
Web App deployment feature, making it a perfect OAuth redirect handler for
personal tools and internal scripts.

---

## 🔒 Security Notes

- **Never commit real tokens or secrets** — use `.gitignore` (already included)
- The `SHOPIFY_ACCESS_TOKEN` and `SHOPIFY_API_SECRET` fields must stay out of version control
- Use `CONFIG_TEMPLATE.md` to track values locally (keep your filled-in copy private)
- If a token is ever exposed, revoke it immediately in Shopify Partners Dashboard
- This approach is best for **single-store, personal, or internal tools** — not for public apps distributed to multiple merchants

---

## 📚 Documentation

| File | Description |
|------|-------------|
| [SETUP.md](./SETUP.md) | Complete 8-phase setup walkthrough |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Solutions for common errors |
| [CONFIG_TEMPLATE.md](./CONFIG_TEMPLATE.md) | Configuration checklist template |
| [docs/oauth-flow-diagram.md](./docs/oauth-flow-diagram.md) | Visual OAuth flow explanation |
| [Code.gs](./Code.gs) | Fully commented Apps Script source |

---

## 🤝 Contributing

Found a bug or have an improvement? Pull requests are welcome!

1. Fork the repository
2. Create a feature branch: `git checkout -b fix/description`
3. Make your changes
4. Open a Pull Request with a clear description

For major changes, please open an issue first to discuss what you'd like to change.

---

## 📄 License

[MIT](./LICENSE) — free to use, modify, and distribute.
