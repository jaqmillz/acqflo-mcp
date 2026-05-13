#!/usr/bin/env node
/**
 * acqflo-mcp v2.0.0 stdio→HTTP proxy.
 *
 * Forwards every JSON-RPC line from stdin to `${ACQFLO_URL}/api/mcp-rpc` and
 * writes the response (if any) to stdout. ~50 lines, no MCP SDK, no Zod, no
 * @ts-nocheck — the entire server lives in the acqflo Next.js app now.
 *
 * Env:
 *   ACQFLO_API_KEY  required — Bearer token (mcp_* or oat_*)
 *   ACQFLO_URL      optional — base URL, default https://acqflo.com
 */

import * as readline from "node:readline";

const API_KEY = process.env.ACQFLO_API_KEY;
const BASE_URL = (process.env.ACQFLO_URL ?? "https://acqflo.com").replace(/\/$/, "");
const ENDPOINT = `${BASE_URL}/api/mcp-rpc`;

if (!API_KEY) {
  console.error("[acqflo-mcp] Missing ACQFLO_API_KEY");
  process.exit(1);
}

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
}

async function forward(raw: string): Promise<void> {
  let msg: JsonRpcMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    return; // ignore malformed input
  }
  const isNotification = msg.id === undefined || msg.id === null;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${API_KEY}` },
      body: raw,
    });
    if (isNotification || res.status === 204) return;
    const text = await res.text();
    const payload = text
      ? text
      : JSON.stringify({
          jsonrpc: "2.0",
          id: msg.id ?? null,
          error: { code: -32603, message: `Empty response (status ${res.status})` },
        });
    process.stdout.write(payload + "\n");
  } catch (err) {
    if (isNotification) return;
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: msg.id ?? null,
        error: {
          code: -32603,
          message: `Proxy error: ${err instanceof Error ? err.message : String(err)}`,
        },
      }) + "\n"
    );
  }
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (line.trim()) void forward(line);
});
rl.on("close", () => process.exit(0));

console.error(`[acqflo-mcp] v2 proxy → ${ENDPOINT}`);
