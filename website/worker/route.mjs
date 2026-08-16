const giftPathPattern = /^\/gift\/[^/]+\/?$/;

export function resolveSitePage(path, pages, appLinkFallback) {
  if (path === "/activate" || path === "/activate/" || giftPathPattern.test(path)) {
    return appLinkFallback;
  }

  return pages[path] ?? null;
}
