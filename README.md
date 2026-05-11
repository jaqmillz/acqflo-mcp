# acqflo-mcp

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Model Context Protocol server for AcqFlo. Lets Claude Desktop interact with your AcqFlo deal pipeline.

## Install in Claude Desktop (recommended)

A `.mcpb` is a [Claude Desktop Extension bundle](https://www.anthropic.com/engineering/desktop-extensions) — a single signed file that installs an MCP server with one click.

1. Generate an API key in AcqFlo: **Settings → AI → Claude / MCP API Keys**. Starts with `mcp_`. Copy it.
2. Download the latest **`acqflo-mcp.mcpb`** from the [Releases page](https://github.com/jaqmillz/acqflo-mcp/releases/latest).
3. Double-click the `.mcpb` file. Claude Desktop opens, shows the extension details, and prompts for your API key. Paste it.
4. Done. Tools appear in Claude Desktop's tool picker.

That's it — no terminal, no `claude_desktop_config.json` editing.

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
