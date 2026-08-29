const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const METRO_SOURCE_EXTENSIONS = Object.freeze([
  ".ts",
  ".tsx",
  ".mjs",
  ".js",
  ".jsx",
  ".json",
  ".cjs",
  ".scss",
  ".sass",
  ".css",
]);
const SOURCE_EXTENSIONS = Object.freeze([
  ".ts",
  ".tsx",
  ".mjs",
  ".js",
  ".jsx",
  ".cjs",
]);
const IOS_PLATFORM_PRECEDENCE = Object.freeze(["ios", "native", "generic"]);
const PLATFORM_NAMES = new Set(["ios", "native", "android", "web"]);
const NON_SOURCE_EXTENSIONS = new Set([
  ".avif",
  ".css",
  ".gif",
  ".heic",
  ".jpeg",
  ".jpg",
  ".json",
  ".mp3",
  ".mp4",
  ".otf",
  ".pdf",
  ".png",
  ".sass",
  ".scss",
  ".svg",
  ".ttf",
  ".wav",
  ".webp",
]);
const FORBIDDEN_ROUTE_SEGMENTS = new Set(["shop", "backend", "nfc-demo"]);

function toPosixPath(value) {
  return value.replaceAll("\\", "/");
}

function projectRelativePath(projectRoot, absolutePath) {
  return toPosixPath(path.relative(projectRoot, absolutePath));
}

function isSourceFile(filePath) {
  return SOURCE_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

function sourceImplementation(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const withoutExtension = extension
    ? filePath.slice(0, -extension.length)
    : filePath;
  const platformMatch = withoutExtension.match(/\.(ios|native|android|web)$/u);
  const platform = platformMatch?.[1] ?? "generic";
  return {
    extension,
    logicalPath: platformMatch
      ? withoutExtension.slice(0, -platformMatch[0].length)
      : withoutExtension,
    platform,
  };
}

function routeUrlFromEntryPath(entryPath) {
  const normalized = toPosixPath(entryPath);
  const marker = "/src/app/";
  const markerIndex = normalized.lastIndexOf(marker);
  let appRelative = markerIndex >= 0
    ? normalized.slice(markerIndex + marker.length)
    : normalized.startsWith("src/app/")
      ? normalized.slice("src/app/".length)
      : normalized;

  appRelative = appRelative.replace(/\.(?:ts|tsx|mjs|js|jsx|cjs)$/u, "");
  appRelative = appRelative.replace(/\.(?:native|ios|android|web)$/u, "");
  const segments = appRelative
    .split("/")
    .filter(Boolean)
    .filter((segment) => !/^\([^/]+\)$/u.test(segment))
    .filter((segment) => segment !== "_layout");
  if (segments.at(-1) === "index") segments.pop();
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

function routeUrlIsForbidden(routeUrl) {
  return routeUrl
    .split("/")
    .filter(Boolean)
    .some((segment) => FORBIDDEN_ROUTE_SEGMENTS.has(segment));
}

function walkSourceFiles(rootDirectory) {
  if (!fs.existsSync(rootDirectory)) return [];
  const results = [];
  const visit = (directory) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile() && isSourceFile(entryPath)) {
        results.push(entryPath);
      }
    }
  };
  visit(rootDirectory);
  return results.sort((left, right) => toPosixPath(left).localeCompare(toPosixPath(right), "en"));
}

function discoverClientRouteEntries(projectRoot) {
  const appRoot = path.join(projectRoot, "src", "app");
  const routeCandidates = walkSourceFiles(appRoot)
    .filter((filePath) => !/\+api(?:\.(?:native|ios|android|web))?\.(?:ts|tsx|mjs|js|jsx|cjs)$/u.test(path.basename(filePath)))
    .map((absolutePath) => ({ absolutePath, ...sourceImplementation(absolutePath) }))
    .filter(({ platform }) => platform !== "android" && platform !== "web");
  const groupedCandidates = new Map();
  for (const candidate of routeCandidates) {
    const candidates = groupedCandidates.get(candidate.logicalPath) ?? [];
    candidates.push(candidate);
    groupedCandidates.set(candidate.logicalPath, candidates);
  }
  return [...groupedCandidates.values()]
    .map((candidates) => candidates.sort((left, right) => {
      const extensionDifference = METRO_SOURCE_EXTENSIONS.indexOf(left.extension)
        - METRO_SOURCE_EXTENSIONS.indexOf(right.extension);
      if (extensionDifference !== 0) return extensionDifference;
      const platformDifference = IOS_PLATFORM_PRECEDENCE.indexOf(left.platform)
        - IOS_PLATFORM_PRECEDENCE.indexOf(right.platform);
      if (platformDifference !== 0) return platformDifference;
      return toPosixPath(left.absolutePath).localeCompare(toPosixPath(right.absolutePath), "en");
    })[0])
    .sort((left, right) =>
      toPosixPath(left.absolutePath).localeCompare(toPosixPath(right.absolutePath), "en"))
    .map((candidate) => {
      const file = projectRelativePath(projectRoot, candidate.absolutePath);
      return {
        absolutePath: candidate.absolutePath,
        file,
        routeUrl: routeUrlFromEntryPath(file),
      };
    });
}

function scriptKindForFile(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".js":
    case ".mjs":
    case ".cjs":
      return ts.ScriptKind.JS;
    case ".jsx":
      return ts.ScriptKind.JSX;
    case ".tsx":
      return ts.ScriptKind.TSX;
    default:
      return ts.ScriptKind.TS;
  }
}

function extractModuleSpecifiers(source, filePath = "module.ts") {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForFile(filePath),
  );
  const specifiers = new Set();
  const routeReferences = new Set();
  const addLiteral = (node) => {
    if (node && ts.isStringLiteralLike(node)) specifiers.add(node.text);
  };
  const inspectRouteLiteral = (node) => {
    if (!ts.isStringLiteralLike(node)) return;
    const reference = node.text.trim();
    const pathWithoutQuery = reference.split(/[?#]/u, 1)[0];
    const isAbsoluteRoute = pathWithoutQuery.startsWith("/")
      && routeUrlIsForbidden(pathWithoutQuery);
    const parent = node.parent;
    const isNamedRoute = ts.isJsxAttribute(parent)
      && ts.isIdentifier(parent.name)
      && ["href", "name"].includes(parent.name.text)
      && routeUrlIsForbidden(`/${pathWithoutQuery}`);
    if (isAbsoluteRoute || isNamedRoute) routeReferences.add(reference);
  };
  const visit = (node) => {
    inspectRouteLiteral(node);
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addLiteral(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
    ) {
      addLiteral(node.moduleReference.expression);
    } else if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (isDynamicImport || isRequire) addLiteral(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return {
    diagnostics: sourceFile.parseDiagnostics.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")),
    routeReferences: [...routeReferences].sort((left, right) => left.localeCompare(right, "en")),
    specifiers: [...specifiers].sort((left, right) => left.localeCompare(right, "en")),
  };
}

function isLocalSourceSpecifier(specifier) {
  return specifier.startsWith("./")
    || specifier.startsWith("../")
    || specifier.startsWith("@/");
}

function isExplicitNonSourceSpecifier(specifier) {
  return NON_SOURCE_EXTENSIONS.has(path.posix.extname(specifier).toLowerCase());
}

function existingFile(candidate) {
  return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
}

function metroSourceCandidates(filePathPrefix) {
  const candidates = [`${filePathPrefix}.ios`, filePathPrefix];
  for (const sourceExtension of METRO_SOURCE_EXTENSIONS) {
    candidates.push(`${filePathPrefix}.ios${sourceExtension}`);
    candidates.push(`${filePathPrefix}.native${sourceExtension}`);
    candidates.push(`${filePathPrefix}${sourceExtension}`);
  }
  return candidates;
}

function resolveIosModuleSource(basePath) {
  const implementation = sourceImplementation(basePath);
  if (METRO_SOURCE_EXTENSIONS.includes(implementation.extension)) {
    if (["android", "web"].includes(implementation.platform)) return null;
    return existingFile(basePath) ? basePath : null;
  }
  const explicitPlatform = path.extname(basePath).slice(1).toLowerCase();
  if (PLATFORM_NAMES.has(explicitPlatform)) {
    if (["android", "web"].includes(explicitPlatform)) return null;
  }

  const fileResolution = metroSourceCandidates(basePath).find(existingFile);
  if (fileResolution) return fileResolution;

  if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
    const indexResolution = metroSourceCandidates(path.join(basePath, "index"))
      .find(existingFile);
    if (indexResolution) return indexResolution;
  }
  return null;
}

function resolveLocalSourceSpecifiers(projectRoot, importerPath, specifier) {
  if (!isLocalSourceSpecifier(specifier) || isExplicitNonSourceSpecifier(specifier)) return [];
  let basePath;
  if (specifier.startsWith("@/assets/")) {
    basePath = path.resolve(projectRoot, "assets", specifier.slice("@/assets/".length));
  } else if (specifier.startsWith("@/")) {
    basePath = path.resolve(projectRoot, "src", specifier.slice(2));
  } else {
    basePath = path.resolve(path.dirname(importerPath), specifier);
  }
  const resolved = resolveIosModuleSource(basePath);
  return resolved ? [resolved] : [];
}

function forbiddenModuleReasons(file, source) {
  const reasons = [];
  if (/(?:^|\/)src\/features\/commerce\//u.test(file)) reasons.push("commerce module");
  if (/(?:^|\/)src\/services\/backend\/admin-gift-card-api-client(?:\.(?:native|ios|android|web))?\.(?:ts|tsx|mjs|js|jsx|cjs)$/u.test(file)) {
    reasons.push("admin gift-card client module");
  }
  if (/(?:^|\/)src\/features\/gifts\/developer-nfc-console(?:\.(?:native|ios|android|web))?\.(?:ts|tsx|js|jsx)$/u.test(file)) {
    reasons.push("developer NFC console module");
  }
  if (/(?:^|\/)src\/services\/nfc\/nfc-url-writer(?:\.(?:native|ios|android|web))?\.(?:ts|tsx|js|jsx)$/u.test(file)) {
    reasons.push("NFC writer module");
  }
  if (/DeveloperNfcConsole|developer-nfc-console|nfc-url-writer/u.test(source)) {
    reasons.push("forbidden external surface token");
  }
  if (/AdminGiftCardApiClient|admin-gift-card-api-client/u.test(source)) {
    reasons.push("admin gift-card client content");
  }
  if (/\/api\/admin\/gift-cards/u.test(source)) {
    reasons.push("admin gift-card endpoint");
  }
  return [...new Set(reasons)];
}

function scanExternalBetaSurface(projectRoot) {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const routeEntriesWithPaths = discoverClientRouteEntries(resolvedProjectRoot);
  const routeEntries = routeEntriesWithPaths.map(({ file, routeUrl }) => ({ file, routeUrl }));
  const forbiddenRoutes = routeEntries
    .filter(({ routeUrl }) => routeUrlIsForbidden(routeUrl));
  const queue = routeEntriesWithPaths.map(({ absolutePath }) => absolutePath);
  const visited = new Set();
  const forbiddenModules = [];
  const forbiddenReferences = [];
  const unresolvedLocalSpecifiers = [];
  const parseFailures = [];

  while (queue.length > 0) {
    const absolutePath = path.resolve(queue.shift());
    if (visited.has(absolutePath)) continue;
    visited.add(absolutePath);
    const file = projectRelativePath(resolvedProjectRoot, absolutePath);
    let source;
    try {
      source = fs.readFileSync(absolutePath, "utf8");
    } catch {
      parseFailures.push({ file, reason: "source could not be read" });
      continue;
    }

    for (const reason of forbiddenModuleReasons(file, source)) {
      forbiddenModules.push({ file, reason });
    }
    const extracted = extractModuleSpecifiers(source, absolutePath);
    for (const reference of extracted.routeReferences) {
      forbiddenReferences.push({ file, reference });
    }
    for (const diagnostic of extracted.diagnostics) {
      parseFailures.push({ file, reason: diagnostic });
    }
    for (const specifier of extracted.specifiers) {
      if (!isLocalSourceSpecifier(specifier) || isExplicitNonSourceSpecifier(specifier)) continue;
      const resolved = resolveLocalSourceSpecifiers(
        resolvedProjectRoot,
        absolutePath,
        specifier,
      );
      if (resolved.length === 0) {
        unresolvedLocalSpecifiers.push({ importer: file, specifier });
      } else {
        queue.push(...resolved.filter(isSourceFile));
      }
    }
  }

  const compareFiles = (left, right) =>
    `${left.file ?? left.importer}\u0000${left.reason ?? left.reference ?? left.specifier}`.localeCompare(
      `${right.file ?? right.importer}\u0000${right.reason ?? right.reference ?? right.specifier}`,
      "en",
    );
  forbiddenModules.sort(compareFiles);
  forbiddenReferences.sort(compareFiles);
  unresolvedLocalSpecifiers.sort(compareFiles);
  parseFailures.sort(compareFiles);
  const reachableModules = [...visited]
    .map((absolutePath) => projectRelativePath(resolvedProjectRoot, absolutePath))
    .sort((left, right) => left.localeCompare(right, "en"));

  return {
    forbiddenModules,
    forbiddenReferences,
    forbiddenRoutes,
    ok: forbiddenModules.length === 0
      && forbiddenReferences.length === 0
      && forbiddenRoutes.length === 0
      && parseFailures.length === 0
      && unresolvedLocalSpecifiers.length === 0,
    parseFailures,
    reachableModules,
    routeEntries,
    unresolvedLocalSpecifiers,
  };
}

module.exports = {
  discoverClientRouteEntries,
  extractModuleSpecifiers,
  METRO_SOURCE_EXTENSIONS,
  resolveIosModuleSource,
  routeUrlFromEntryPath,
  scanExternalBetaSurface,
};
