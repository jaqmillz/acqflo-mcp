# acqflo-mcp

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Model Context Protocol server for AcqFlo. Connects Claude — Claude.ai (web), Claude Desktop, and Claude Code — to your AcqFlo deal pipeline.

## Connect (recommended)

AcqFlo hosts the MCP server with OAuth, so you add it as a **custom connector by URL** — no download, no API key, and the same URL works in every Claude client.

Connector URL:

```
https://acqflo.com/api/mcp-rpc
```

- **Claude.ai (web):** Settings → Connectors → **Add custom connector** → paste the URL (leave the OAuth Client ID/Secret fields blank) → sign in.
- **Claude Desktop:** Settings → Connectors → **Add custom connector** → paste the URL → sign in.
- **Claude Code (CLI):** `claude mcp add --transport http acqflo https://acqflo.com/api/mcp-rpc --scope user`

Sign in through AcqFlo's OAuth (Microsoft OAuth if your tenant uses Azure AD) and click **Approve**. The connector binds to the AcqFlo organization selected at approval time. You can also start this from **AcqFlo → Claude → Connect Claude**.

> The old `.mcpb` desktop bundle is retired — the hosted connector above replaces it and works in the browser too. The stdio server in this repo remains only for local development (see below).

## Tools exposed

**Read**
- `list_deals` — list active (non-dead) deals
- `get_deal` — full record for one deal by id
- `find_deal_by_name` — fuzzy-match by project name
- `list_brokers` — list brokers in the CRM

**Write**
- `create_deal` — create a new deal with structured fields
- `update_deal` — partial update of any deal fields/attributes
- `add_note_to_deal` — append a timestamped note
- `change_stage` — move a deal between pipeline stages (kill reason optional)
- `link_broker_to_deal` — associate a broker with a deal

**Destructive (requires explicit confirm)**
- `delete_deal` — permanently delete; dry-runs unless `confirm:true`

## Building from source (developers only)

```bash
npm install
npm run build
npm run pack:mcpb   # produces acqflo-mcp.mcpb
```

## Env vars (advanced)

| Variable | Default | Purpose |
|---|---|---|
| `ACQFLO_API_KEY` | _(required)_ | Bearer token (`mcp_…`) sent to AcqFlo API |
| `ACQFLO_API_BASE` | `https://acqflo.com/api` | Override for local dev (e.g. `http://localhost:4545/api`) |

## Local dev

```bash
ACQFLO_API_KEY=mcp_test_xxx \
ACQFLO_API_BASE=http://localhost:4545/api \
npm run start
```

The server speaks JSON-RPC over stdio, so it isn't terminal-testable — point Claude Desktop at the local `build/index.js` to exercise it end-to-end.

## Security

Report vulnerabilities via [SECURITY.md](SECURITY.md) — please don't file public GitHub issues for security reports.

## License

MIT — see [LICENSE](LICENSE).
