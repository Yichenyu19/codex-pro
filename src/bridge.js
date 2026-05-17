import http from "node:http";

import {
  getProductManagementStatus,
  getLatestHistorySnapshotInfo,
  runCheckUpdate,
  runGuardStatus,
  runInstallUpdate,
  runDeleteSession,
  runExportHandoff,
  runExportSessionMarkdown,
  runMoveSession,
  runOpenLogDir,
  runOpenQuickStart,
  runOpenStartMenuDir,
  runOpenToolDir,
  runHistoryDoctor,
  runRebuildIndex,
  runRepairSidebar,
  runRestoreLatest,
  runStartGuard,
  runStopGuard,
  runUndoDeleteSession,
  runResumeFallback,
  runSnapshot
} from "./service.js";

const BRIDGE_TOKEN_HEADER = "x-codex-pro-token";

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Codex-Pro-Token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Private-Network": "true"
  });
  res.end(JSON.stringify(payload));
}

function hasBridgeAccess(req, authToken) {
  if (!authToken) {
    return true;
  }
  const headerValue = req.headers[BRIDGE_TOKEN_HEADER];
  return typeof headerValue === "string" && headerValue === authToken;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

export async function startBridgeServer(options = {}) {
  const port = Number.isInteger(options.port) ? options.port : 8765;
  const codexHome = options.codexHome;
  const authToken = typeof options.authToken === "string" ? options.authToken.trim() : "";
  const updateFetch = options.updateFetch;
  const updateRegistryBase = options.updateRegistryBase;
  const updateExecFile = options.updateExecFile;
  const updateRepoRoot = options.updateRepoRoot;

  const server = http.createServer(async (req, res) => {
    const parsed = new URL(req.url ?? "/", "http://127.0.0.1");

    try {
      if (req.method === "OPTIONS") {
        return json(res, 200, { ok: true });
      }

      if (!hasBridgeAccess(req, authToken)) {
        return json(res, 403, {
          ok: false,
          error: "Bridge access denied."
        });
      }

      if (req.method === "GET" && parsed.pathname === "/status") {
        const [doctor, guard, latestSnapshot] = await Promise.all([
          runHistoryDoctor({ codexHome }),
          runGuardStatus(),
          getLatestHistorySnapshotInfo({ codexHome })
        ]);
        const management = await getProductManagementStatus({ codexHome });
        return json(res, 200, {
          product: "Codex Pro",
          doctor,
          guard,
          latestSnapshot,
          management,
          takeover: management.takeover,
          historyVisibility: doctor.historyVisibility,
          productState: doctor.productState,
          recentActions: guard.state?.actions ?? [],
          injectionDiagnosis: guard.diagnosis ?? null,
          recoveryPlan: {
            state: doctor.productState?.kind ?? "healthy",
            productState: doctor.productState,
            uiMode: doctor.uiIntegrationMode,
            summary: doctor.recoverySummary,
            recommendedAction: doctor.recommendedAction,
            steps: doctor.recoverySteps
          }
        });
      }

      if (req.method === "POST" && parsed.pathname === "/snapshot") {
        const result = await runSnapshot({ codexHome });
        return json(res, 200, result);
      }

      if (req.method === "POST" && parsed.pathname === "/repair-sidebar") {
        const result = await runRepairSidebar({ codexHome });
        return json(res, 200, result);
      }

      if (req.method === "POST" && parsed.pathname === "/rebuild-index") {
        const result = await runRebuildIndex({ codexHome });
        return json(res, 200, result);
      }

      if (req.method === "GET" && parsed.pathname === "/sessions") {
        const query = parsed.searchParams.get("query") ?? "";
        const limitText = parsed.searchParams.get("limit");
        const result = await runResumeFallback({
          codexHome,
          query,
          limit: typeof limitText === "string" ? Number.parseInt(limitText, 10) : undefined
        });
        return json(res, 200, result);
      }

      if (req.method === "GET" && parsed.pathname === "/update/check") {
        const result = await runCheckUpdate({
          fetchImpl: updateFetch,
          registryBase: updateRegistryBase
        });
        return json(res, 200, result);
      }

      if (req.method === "POST" && parsed.pathname === "/update/install") {
        const body = await readBody(req);
        const result = await runInstallUpdate({
          version: typeof body.version === "string" ? body.version : undefined,
          fetchImpl: updateFetch,
          registryBase: updateRegistryBase,
          execFileImpl: updateExecFile,
          repoRoot: updateRepoRoot
        });
        return json(res, 200, result);
      }

      if (req.method === "POST" && parsed.pathname === "/restore-latest") {
        const result = await runRestoreLatest({ codexHome });
        return json(res, 200, result);
      }

      if (req.method === "POST" && parsed.pathname === "/start-guard") {
        const result = await runStartGuard({ codexHome });
        return json(res, 200, result);
      }

      if (req.method === "POST" && parsed.pathname === "/stop-guard") {
        const result = await runStopGuard();
        return json(res, 200, result);
      }

      if (req.method === "POST" && parsed.pathname === "/open-log-dir") {
        const result = await runOpenLogDir();
        return json(res, 200, result);
      }

      if (req.method === "POST" && parsed.pathname === "/open-tool-dir") {
        const result = await runOpenToolDir();
        return json(res, 200, result);
      }

      if (req.method === "POST" && parsed.pathname === "/open-start-menu-dir") {
        const result = await runOpenStartMenuDir();
        return json(res, 200, result);
      }

      if (req.method === "POST" && parsed.pathname === "/open-quick-start") {
        const result = await runOpenQuickStart({ codexHome });
        return json(res, 200, result);
      }

      if (req.method === "POST" && parsed.pathname === "/delete-session") {
        const body = await readBody(req);
        const result = await runDeleteSession({
          codexHome,
          threadId: typeof body.thread_id === "string" ? body.thread_id : "",
          title: typeof body.title === "string" ? body.title : ""
        });
        return json(res, 200, result);
      }

      if (req.method === "POST" && parsed.pathname === "/export-session-markdown") {
        const body = await readBody(req);
        const result = await runExportSessionMarkdown({
          codexHome,
          threadId: typeof body.thread_id === "string" ? body.thread_id : "",
          title: typeof body.title === "string" ? body.title : ""
        });
        return json(res, 200, result);
      }

      if (req.method === "POST" && parsed.pathname === "/move-session") {
        const body = await readBody(req);
        const result = await runMoveSession({
          codexHome,
          threadId: typeof body.thread_id === "string" ? body.thread_id : "",
          targetCwd: typeof body.target_cwd === "string" ? body.target_cwd : "",
          dryRun: Boolean(body.dry_run)
        });
        return json(res, 200, result);
      }

      if (req.method === "POST" && parsed.pathname === "/handoff/export") {
        const body = await readBody(req);
        const result = await runExportHandoff({
          codexHome,
          threadId: typeof body.thread_id === "string" ? body.thread_id : "",
          title: typeof body.title === "string" ? body.title : ""
        });
        return json(res, 200, result);
      }

      if (req.method === "POST" && parsed.pathname === "/undo-delete-session") {
        const body = await readBody(req);
        const result = await runUndoDeleteSession({
          codexHome,
          undoToken: typeof body.undo_token === "string" ? body.undo_token : ""
        });
        return json(res, 200, result);
      }

      return json(res, 404, { error: "Not found" });
    } catch (error) {
      return json(res, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  return server;
}
