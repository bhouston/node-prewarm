import express from "express";

const port = Number.parseInt(process.env.PORT ?? "0", 10);
if (!Number.isFinite(port) || port <= 0) {
  console.error("mini-server: PORT env must be set to a positive integer");
  process.exit(1);
}

const app = express();
app.get("/", (_request, response) => {
  response.send("ok");
});

const server = app.listen(port, "127.0.0.1");

function shutdown(): void {
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
