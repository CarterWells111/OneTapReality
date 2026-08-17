/**
 * The Sites runtime invokes this worker for every request.  Keep the small
 * public site in the worker bundle instead of depending on an external asset
 * manifest, so the three App Store URLs are always served by the same deploy.
 */
import { resolveSitePage } from "./route.mjs";

const sitePages = __STATIC_SITE_PAGES__;
const siteStyles = __STATIC_SITE_STYLES__;
const siteAssets = __STATIC_SITE_ASSETS__;
const appleAppSiteAssociation = __APPLE_APP_SITE_ASSOCIATION__;
const appLinkFallback = __APP_LINK_FALLBACK__;

const headers = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "public, max-age=300",
  "x-content-type-options": "nosniff",
};

function response(body, contentType) {
  return new Response(body, {
    headers: { ...headers, "content-type": contentType },
  });
}

function staticAssetResponse(asset) {
  const binary = Uint8Array.from(atob(asset.body), (character) => character.charCodeAt(0));
  return new Response(binary, {
    headers: {
      ...headers,
      "cache-control": "public, max-age=86400",
      "content-type": asset.contentType,
    },
  });
}

export default {
  fetch(request) {
    const path = new URL(request.url).pathname;

    if (path === "/styles.css") {
      return response(siteStyles, "text/css; charset=utf-8");
    }

    const asset = siteAssets[path];
    if (asset) {
      return staticAssetResponse(asset);
    }

    if (path === "/.well-known/apple-app-site-association") {
      return response(appleAppSiteAssociation, "application/json; charset=utf-8");
    }

    const page = resolveSitePage(path, sitePages, appLinkFallback);
    return page
      ? response(page, "text/html; charset=utf-8")
      : new Response("Not found", { status: 404, headers });
  },
};
