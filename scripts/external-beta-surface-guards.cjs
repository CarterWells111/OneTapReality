const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const SOURCE_EXTENSIONS = Object.freeze([".ts", ".tsx", ".js", ".jsx"]);
const PLATFORM_SUFFIXES = Object.freeze(["", ".native", ".ios", ".android", ".web"]);
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

function routeUrlFromEntryPath(entryPath) {
  const normalized = toPosixPath(entryPath);
  const marker = "/src/app/";
  const markerIndex = normalized.lastIndexOf(marker);
  let appRelative = markerIndex >= 0
    ? normalized.slice(markerIndex + marker.length)
    : normalized.startsWith("src/app/")
      ? normalized.slice("src/app/".length)
      : normalized;

  appRelative = appRelative.replace(/\.(?:ts|tsx|js|jsx)$/u, "");
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
  return walkSourceFiles(appRoot)
    .filter((filePath) => !/\+api(?:\.(?:native|ios|android|web))?\.(?:ts|tsx|js|jsx)$/u.test(path.basename(filePath)))
    .map((absolutePath) => {
      const file = projectRelativePath(projectRoot, absolutePath);
      return { absolutePath, file, routeUrl: routeUrlFromEntryPath(file) };
    });
}

function scriptKindForFile(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".js":
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

function sourceCandidates(basePath) {
  const extension = path.extname(basePath).toLowerCase();
  const candidates = [];
  if (SOURCE_EXTENSIONS.includes(extension)) candidates.push(basePath);
  for (const platformSuffix of PLATFORM_SUFFIXES) {
    for (const sourceExtension of SOURCE_EXTENSIONS) {
      candidates.push(`${basePath}${platformSuffix}${sourceExtension}`);
      candidates.push(path.join(basePath, `index${platformSuffix}${sourceExtension}`));
    }
  }
  return [...new Set(candidates)];
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
  return sourceCandidates(basePath)
    .filter((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
    .sort((left, right) => toPosixPath(left).localeCompare(toPosixPath(right), "en"));
}

function forbiddenModuleReasons(file, source) {
  const reasons = [];
  if (/(?:^|\/)src\/features\/commerce\//u.test(file)) reasons.push("commerce module");
  if (/(?:^|\/)src\/features\/gifts\/developer-nfc-console(?:\.(?:native|ios|android|web))?\.(?:ts|tsx|js|jsx)$/u.test(file)) {
    reasons.push("developer NFC console module");
  }
  if (/(?:^|\/)src\/services\/nfc\/nfc-url-writer(?:\.(?:native|ios|android|web))?\.(?:ts|tsx|js|jsx)$/u.test(file)) {
    reasons.push("NFC writer module");
  }
  if (/DeveloperNfcConsole|developer-nfc-console|nfc-url-writer/u.test(source)) {
    reasons.push("forbidden external surface token");
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
        queue.push(...resolved);
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
  routeUrlFromEntryPath,
  scanExternalBetaSurface,
};
