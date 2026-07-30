# OneTapReality App Store website

This directory is a dependency-free static site. Configure the host to publish this directory as its document root so these paths resolve exactly:

- `/` — Marketing URL
- `/support/` — Support URL
- `/privacy/` — Privacy Policy URL

## Required publishing setup

Before publishing, the rights holder must:

1. Register and control a domain name (the intended domain is `onetapreality.com`, subject to availability).
2. Create and actively monitor `support@onetapreality.com`, or replace every occurrence of that address with an active mailbox on the final domain.
3. Use `Ziao Huang` as the personal rights holder in the three page footers and in App Store Connect's Copyright field without a © symbol. If a company becomes the rights holder, replace it with that company's legal name everywhere.
4. Add a legal street address or telephone number to `support/index.html` if it is required for the regions in which the app is distributed.
5. Deploy with HTTPS and verify all three URLs in a private browser window before entering them in App Store Connect.

The site intentionally has no analytics, cookies, remote fonts, forms, login, payment, or third-party scripts.

## Product-introduction assets

The supplied product-introduction HTML is kept outside this repository. To regenerate its local image assets and manifest, pass its path explicitly:

```powershell
node website/scripts/import-product-introduction.mjs "C:\path\to\OneTapReality_2.html"
```

The command writes only to `website/assets/product-introduction/`; it makes no network requests.
