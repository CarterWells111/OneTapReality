const path = require("node:path");

const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const isActiveLinkedWorktree = path.basename(path.dirname(__dirname)) === ".worktrees";
const escapedActiveWorktreeName = path.basename(__dirname).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const worktreeBlockList = isActiveLinkedWorktree
  ? new RegExp(`(?:^|[\\\\/])\\.worktrees[\\\\/](?!${escapedActiveWorktreeName}(?:[\\\\/]|$)).*$`, "u")
  : /(?:^|[\\/])\.worktrees(?:[\\/].*)?$/u;

config.resolver.blockList = new RegExp(
  `${config.resolver.blockList.source}|${worktreeBlockList.source}`,
  config.resolver.blockList.flags,
);

module.exports = config;
