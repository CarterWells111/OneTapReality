const path = require("node:path");

const RELEASE_AUDIENCES = Object.freeze([
  "internal",
  "external-beta",
  "public",
]);

function normalizeReleaseAudience(value) {
  const normalized = typeof value === "string" && value.trim()
    ? value.trim()
    : "public";
  if (!RELEASE_AUDIENCES.includes(normalized)) {
    throw new Error(`Unsupported release audience: ${normalized}`);
  }
  return normalized;
}

function resolveLocalModuleRequest(context, moduleName, projectRoot) {
  if (path.isAbsolute(moduleName)) return path.resolve(moduleName);
  if (moduleName.startsWith("@/")) {
    return path.resolve(projectRoot, "src", moduleName.slice(2));
  }
  if (moduleName.startsWith("./") || moduleName.startsWith("../")) {
    return path.resolve(path.dirname(context.originModulePath), moduleName);
  }
  return null;
}

function createActivateEntryResolver({ projectRoot, releaseAudience, developmentEntryEnabled = false }) {
  const audience = normalizeReleaseAudience(releaseAudience);
  const publicEntryBase = path.resolve(
    projectRoot,
    "src",
    "features",
    "gifts",
    "activate-entry",
  );
  const publicEntry = `${publicEntryBase}.tsx`;
  const internalEntry = `${publicEntryBase}.internal.tsx`;
  const selectedEntry = audience === "internal" ? internalEntry : publicEntry;
  const developmentLinkBase = path.resolve(
    projectRoot,
    "src",
    "features",
    "gifts",
    "development-gift-link-entry",
  );
  const developmentLinkPublicEntry = `${developmentLinkBase}.tsx`;
  const developmentLinkInternalEntry = `${developmentLinkBase}.development.tsx`;
  const selectedDevelopmentLinkEntry = developmentEntryEnabled
    ? developmentLinkInternalEntry
    : developmentLinkPublicEntry;

  return (context, moduleName, platform) => {
    if (typeof context?.resolveRequest !== "function") {
      throw new Error("Metro resolver context is missing resolveRequest");
    }
    const localRequest = resolveLocalModuleRequest(
      context,
      moduleName,
      projectRoot,
    );
    const target = localRequest === publicEntryBase || localRequest === publicEntry
      ? selectedEntry
      : localRequest === developmentLinkBase || localRequest === developmentLinkPublicEntry
        ? selectedDevelopmentLinkEntry
        : moduleName;
    return context.resolveRequest(context, target, platform);
  };
}

module.exports = {
  createActivateEntryResolver,
  normalizeReleaseAudience,
  RELEASE_AUDIENCES,
};
