const path = require("node:path");

const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const escapedWorktreePath = path
  .join(__dirname, ".worktrees")
  .replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const worktreeBlockList = new RegExp(`^${escapedWorktreePath}[\\\\/].*`);

config.resolver.blockList = new RegExp(
  `${config.resolver.blockList.source}|${worktreeBlockList.source}`,
  config.resolver.blockList.flags,
);

module.exports = config;
