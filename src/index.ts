#!/usr/bin/env node
// @ts-nocheck — The @modelcontextprotocol/sdk's registerTool generics cause
// excessively deep type instantiation that crashes tsc when 10+ tools are
// registered in one file. Runtime is unaffected; this file only crashes the
// type checker, not the JS emit. Revisit when SDK 2.x improves type ergonomics.
/**
 * acqflo-mcp — Model Context Protocol server for AcqFlo.
 *
 * Exposes tools that let Claude Desktop read and write your AcqFlo deal
 * pipeline. Authenticated via a per-user MCP API key (mcp_ prefix) generated
 * in AcqFlo Settings → AI. Set the key as `ACQFLO_API_KEY` in Claude
 * Desktop's claude_desktop_config.json.
 *
 * Tools:
 *   READ
 *     • list_deals          — list non-dead deals
 *     • get_deal            — full detail for one deal by id
 *     • find_deal_by_name   — fuzzy-match a deal by project name
 *     • list_brokers        — list brokers in the org (CRM)
 *
 *   WRITE
 *     • create_deal         — create a new deal (Claude can extract from a PDF
 *                              and call this with structured fields)
 *     • update_deal         — partial update of any deal fields/attributes
 *     • add_note_to_deal    — append a timestamped note
 *     • change_stage        — move a deal to a new pipeline stage (kill reason
 *                              optional when moving to "dead")
 *     • link_broker_to_deal — associate a broker with a deal
 *
 *   DESTRUCTIVE (require explicit confirm flag)
 *     • delete_deal         — permanently delete a deal; requires confirm:true
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = process.env.ACQFLO_API_BASE ?? "https://acqflo.com/api";
const API_KEY = process.env.ACQFLO_API_KEY;

if (!API_KEY) {
  console.error(
    "[acqflo-mcp] Missing ACQFLO_API_KEY env var. Set it in claude_desktop_config.json."
  );
  process.exit(1);
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

interface ApiOk<T> { data: T }
interface ApiErr { error: string }

async function apiRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const parsed = JSON.parse(text) as ApiErr;
      if (parsed.error) msg = parsed.error;
    } catch {}
    throw new Error(`AcqFlo API: ${msg}`);
  }
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

const apiGet = <T>(path: string) => apiRequest<T>(path, { method: "GET" });
const apiPost = <T>(path: string, body: unknown) =>
  apiRequest<T>(path, { method: "POST", body: JSON.stringify(body) });
const apiPatch = <T>(path: string, body: unknown) =>
  apiRequest<T>(path, { method: "PATCH", body: JSON.stringify(body) });
const apiDelete = <T>(path: string) => apiRequest<T>(path, { method: "DELETE" });

// ─── Types ───────────────────────────────────────────────────────────────────

interface DealSummary {
  id: string;
  project_name: string;
  project_address?: string | null;
  stage: string;
  asking_price?: number | null;
  net_rentable_sf?: number | null;
  priority?: string | null;
  attributes?: Record<string, unknown> | null;
}

interface BrokerSummary {
  id: string;
  first_name: string;
  last_name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  relationship_strength: string | null;
  brokerage_name: string | null;
}

// ─── Server setup ────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "acqflo",
  version: "1.0.0",
});

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });
const json = (label: string, obj: unknown) =>
  text(`${label}\n\n${JSON.stringify(obj, null, 2)}`);

// ─── READ tools ──────────────────────────────────────────────────────────────

server.registerTool(
  "list_deals",
  {
    description:
      "List all active deals in the AcqFlo organization. Returns project name, stage, address, asking price, and priority for each.",
    inputSchema: {},
  },
  async () => {
    const { deals } = await apiGet<{ deals: DealSummary[] }>("/mcp/deals");
    const active = deals.filter((d) => d.stage !== "dead");
    if (active.length === 0) return text("No active deals.");
    const lines = active.map((d) => {
      const price = d.asking_price ? ` · $${(d.asking_price / 1_000_000).toFixed(2)}M` : "";
      return `• ${d.project_name} — ${d.stage}${price}`;
    });
    return text(`${active.length} active deal(s):\n\n${lines.join("\n")}`);
  }
);

server.registerTool(
  "get_deal",
  {
    description:
      "Fetch the full record for one deal by id. Returns project, address, stage, asking price, all custom attributes, and notes.",
    inputSchema: { id: z.string() },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async ({ id }: { id: string }) => {
    const deal = await apiGet<DealSummary>(`/mcp/deals/${id}`);
    return json(`Deal ${id}:`, deal);
  }) as any
);

server.registerTool(
  "find_deal_by_name",
  {
    description:
      "Find a deal by project name (case-insensitive substring match). Returns matching deals' id, name, stage.",
    inputSchema: { name: z.string() },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async ({ name }: { name: string }) => {
    const { deals } = await apiGet<{ deals: DealSummary[] }>("/mcp/deals");
    const needle = name.toLowerCase();
    const matches = deals.filter((d) => d.project_name.toLowerCase().includes(needle));
    if (matches.length === 0) return text(`No deal matching "${name}".`);
    const lines = matches.map((d) => `• ${d.project_name} — ${d.stage} (id: ${d.id})`);
    return text(`${matches.length} match(es) for "${name}":\n\n${lines.join("\n")}`);
  }) as any
);

server.registerTool(
  "list_brokers",
  {
    description:
      "List brokers in the AcqFlo CRM. Returns name, brokerage, email, phone, and relationship strength.",
    inputSchema: {},
  },
  async () => {
    const { brokers } = await apiGet<{ brokers: BrokerSummary[] }>("/mcp/brokers");
    if (brokers.length === 0) return text("No brokers in CRM.");
    const lines = brokers.map((b) => {
      const firm = b.brokerage_name ? ` @ ${b.brokerage_name}` : "";
      const contact = b.email ?? b.phone ?? "(no contact)";
      return `• ${b.first_name} ${b.last_name}${firm} — ${contact} (id: ${b.id})`;
    });
    return text(`${brokers.length} broker(s):\n\n${lines.join("\n")}`);
  }
);

// ─── WRITE tools ─────────────────────────────────────────────────────────────

server.registerTool(
  "create_deal",
  {
    description:
      "Create a new deal in AcqFlo. Provide project_name (required); other fields optional. Address triggers automatic geocoding. Use attributes (an object) for any custom fields like cap_rate, occupancy_physical, broker_name, etc.",
    inputSchema: {
      project_name: z.string(),
      project_address: z.string().optional(),
      asking_price: z.number().optional(),
      net_rentable_sf: z.number().optional(),
      asset_class_id: z.string().optional(),
      priority: z.enum(["none", "medium", "high"]).optional(),
      stage: z.enum([
        "received",
        "quick_underwriting",
        "full_underwriting",
        "loi_submitted",
        "closed",
        "dead",
      ]).optional(),
      attributes: z.record(z.string(), z.unknown()).optional(),
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (input: Record<string, unknown>) => {
    const deal = await apiPost<DealSummary>("/mcp/deals", input);
    return json(`Created deal ${deal.id}:`, deal);
  }) as any
);

server.registerTool(
  "update_deal",
  {
    description:
      "Partial update of an existing deal. Pass id plus any fields to change. To update custom attributes, pass an attributes object (it merges, doesn't replace existing keys not specified — but be aware nested updates fully overwrite the attributes object).",
    inputSchema: {
      id: z.string(),
      project_name: z.string().optional(),
      project_address: z.string().optional(),
      asking_price: z.number().nullable().optional(),
      net_rentable_sf: z.number().nullable().optional(),
      priority: z.enum(["none", "medium", "high"]).optional(),
      attributes: z.record(z.string(), z.unknown()).optional(),
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (input: Record<string, unknown>) => {
    const { id, ...patch } = input;
    const deal = await apiPatch<DealSummary>(`/mcp/deals/${id}`, patch);
    return json(`Updated deal ${id}:`, deal);
  }) as any
);

server.registerTool(
  "add_note_to_deal",
  {
    description:
      "Append a timestamped note to a deal's notes field. Use for logging conversations, observations, or any free-form context.",
    inputSchema: {
      id: z.string(),
      note: z.string(),
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async ({ id, note }: { id: string; note: string }) => {
    await apiPost(`/mcp/deals/${id}/note`, { note });
    return text(`Note added to deal ${id}.`);
  }) as any
);

server.registerTool(
  "change_stage",
  {
    description:
      "Move a deal to a different pipeline stage. When moving to 'dead', optionally provide killReasonCategory and killReasonComment to record why.",
    inputSchema: {
      id: z.string(),
      stage: z.enum([
        "received",
        "quick_underwriting",
        "full_underwriting",
        "loi_submitted",
        "closed",
        "dead",
      ]),
      killReasonCategory: z.string().optional(),
      killReasonComment: z.string().optional(),
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (input: Record<string, unknown>) => {
    const { id, ...rest } = input;
    await apiPost(`/mcp/deals/${id}/stage`, rest);
    return text(`Deal ${id} moved to ${rest.stage}.`);
  }) as any
);

server.registerTool(
  "link_broker_to_deal",
  {
    description:
      "Associate a broker with a deal. Use list_brokers to find broker_id values. Role defaults to 'listing_agent'.",
    inputSchema: {
      deal_id: z.string(),
      broker_id: z.string(),
      role: z.enum(["listing_agent", "buyer_agent", "referral", "other"]).optional(),
      is_primary: z.boolean().optional(),
      notes: z.string().optional(),
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (input: Record<string, unknown>) => {
    const { deal_id, ...body } = input;
    const result = await apiPost(`/mcp/deals/${deal_id}/broker`, body);
    return json(`Broker linked to deal ${deal_id}:`, result);
  }) as any
);

// ─── DESTRUCTIVE tools (require confirm) ─────────────────────────────────────

server.registerTool(
  "delete_deal",
  {
    description:
      "PERMANENTLY DELETE a deal. This is irreversible. Requires confirm:true to actually delete — if confirm is omitted or false, returns a dry-run preview without deleting. Always show the user what will be deleted and ask explicit consent before passing confirm:true.",
    inputSchema: {
      id: z.string(),
      confirm: z.boolean().optional(),
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async ({ id, confirm }: { id: string; confirm?: boolean }) => {
    if (!confirm) {
      const deal = await apiGet<DealSummary>(`/mcp/deals/${id}`);
      return text(
        `DRY RUN — would delete:\n\n${JSON.stringify(deal, null, 2)}\n\n` +
          `Call again with confirm:true to actually delete.`
      );
    }
    await apiDelete(`/mcp/deals/${id}?confirm=true`);
    return text(`Deal ${id} deleted permanently.`);
  }) as any
);

// ─── Connect ─────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[acqflo-mcp] Connected with 10 tools");
