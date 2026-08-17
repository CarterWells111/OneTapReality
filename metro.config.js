const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const config = getDefaultConfig(__dirname);

// expo-sqlite Web 端通过 Worker 使用 wa-sqlite (WASM)，
// Metro 默认不识别 .wasm 扩展名，需手动加入 sourceExts
config.resolver.sourceExts = [...config.resolver.sourceExts, 'wasm'];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const ignoredDirectoryNames = [
  ".pnpm-store",
  ".runtime",
  ".tmp",
  ".tmp-mapdata",
  "app-store-previews",
  "dist",
  "output",
];
const ignoredDirectoryBlockList = new RegExp(
  `^(?:${ignoredDirectoryNames
    .map((directory) => escapeRegExp(path.join(__dirname, directory)))
    .join("|")})[\\\\/].*`,
);
const escapedWorktreePath = escapeRegExp(path.join(__dirname, ".worktrees"));
const worktreeBlockList = new RegExp(`^${escapedWorktreePath}[\\\\/].*`);
const blockListSources = [
  config.resolver.blockList instanceof RegExp
    ? config.resolver.blockList.source
    : /$^/u.source,
  ignoredDirectoryBlockList.source,
];

// The primary checkout must ignore linked worktrees, but a linked worktree must
// remain resolvable when it is the active project root (as in isolated CI work).
if (!__dirname.split(path.sep).includes(".worktrees")) {
  blockListSources.push(worktreeBlockList.source);
}
config.resolver.blockList = new RegExp(blockListSources.join("|"), "u");

module.exports = config;
