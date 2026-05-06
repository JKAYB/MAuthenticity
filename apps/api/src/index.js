require("dotenv").config({
  path: require("path").resolve(__dirname, "../../../.env")
});

const { describeObjectStorageReadiness } = require("@media-auth/scan-storage");

const os = describeObjectStorageReadiness();
if (!os.ok) {
  console.error(`[api] object storage configuration invalid: ${os.issues.join("; ")}`);
  process.exit(1);
}
console.info(`[api] object_storage=${JSON.stringify({ provider: os.provider, ok: true })}`);

const { getScanExecutionMode } = require("./config/scanExecution");
const scanExecMode = getScanExecutionMode();
console.info(`[api] SCAN_EXECUTION_MODE=${scanExecMode}`);
if (scanExecMode === "queue") {
  console.info(
    "[api] Scan jobs use BullMQ (Redis) + worker. Without a worker, rows stay pending. Set SCAN_EXECUTION_MODE=direct to process in the API."
  );
}

const { createApp } = require("./app");

const port = Number(process.env.PORT || 4000);
const app = createApp();

app.listen(port, () => {
  console.info(`API listening on http://localhost:${port}`);
});
