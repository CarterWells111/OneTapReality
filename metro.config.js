const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const config = getDefaultConfig(__dirname);
const worktreeBlockList = /(?:^|[\\/])\.worktrees(?:[\\/].*)?$/u;

// The primary checkout must ignore linked worktrees, but a linked worktree must
// remain resolvable when it is the active project root (as in isolated CI work).
if (!__dirname.split(path.sep).includes(".worktrees")) {
  config.resolver.blockList = new RegExp(
    `${config.resolver.blockList.source}|${worktreeBlockList.source}`,
    config.resolver.blockList.flags,
  );
} else if (!(config.resolver.blockList instanceof RegExp)) {
  config.resolver.blockList = /$^/u;
}

module.exports = config;
