#!/usr/bin/env node

const path = require("node:path");
const compression = require("compression");
const express = require("express");
const morgan = require("morgan");
const { createRequestHandler } = require("expo-server/adapter/express");
const { productionRequestLog } = require("./src/server/http/request-log.cjs");

const clientBuildDirectory = path.join(process.cwd(), "dist/client");
const serverBuildDirectory = path.join(process.cwd(), "dist/server");
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

process.env.NODE_ENV ??= "production";

const app = express();
app.disable("x-powered-by");
app.use(compression());
app.use(morgan(process.env.NODE_ENV === "production" ? productionRequestLog : "dev"));
app.use(express.static(clientBuildDirectory, {
  extensions: ["html"],
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
}));
app.all("/{*all}", createRequestHandler({
  build: serverBuildDirectory,
  environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV,
}));

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`AdventureX server listening on port ${port}`);
});

process.on("SIGTERM", () => {
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
});
