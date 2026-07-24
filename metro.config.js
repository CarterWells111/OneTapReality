const path = require("node:path");

const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// expo-sqlite Web 端通过 Worker 使用 wa-sqlite (WASM)，
// Metro 默认不识别 .wasm 扩展名，需手动加入 sourceExts
config.resolver.sourceExts = [...config.resolver.sourceExts, 'wasm'];

const escapedWorktreePath = path
  .join(__dirname, ".worktrees")
  .replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const worktreeBlockList = new RegExp(`^${escapedWorktreePath}[\\\\/].*`);

config.resolver.blockList = new RegExp(
  `${config.resolver.blockList.source}|${worktreeBlockList.source}`,
  config.resolver.blockList.flags,
);

module.exports = config;
