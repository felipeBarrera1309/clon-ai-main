# MCP Credentials Management

MCPs (Model Context Protocol servers) that use OAuth (like Linear, Sentry, Axiom, Neon) cache their credentials locally. This guide explains how to manage them when you need to switch workspaces or accounts.

## Where Credentials Are Stored

```
~/.mcp-auth/
└── mcp-remote-{version}/
    ├── {hash}_tokens.json       # OAuth access/refresh tokens
    ├── {hash}_client_info.json  # OAuth client registration
    ├── {hash}_code_verifier.txt # PKCE verifier
    └── {hash}_lock.json         # Process lock (when active)
```

The `{hash}` is an **MD5 hash of the MCP server URL**.

## Common MCP URL Hashes

| Service | URL | Hash |
|---------|-----|------|
| Linear | `https://mcp.linear.app/mcp` | `fcc436b0d1e0a1ed9a2b15bbd638eb13` |
| Neon | `https://mcp.neon.tech/mcp` | `9a7c8433f89de1a4750ab7aee5a1ac2d` |
| Sentry | `https://mcp.sentry.dev/mcp` | `305d49f5287a7c289157a704a0ed3b1e` |
| Axiom | `https://mcp.axiom.co/mcp` | `642c053ec78bc2e5b1d1307efc65aaef` |
| Context7 | `https://mcp.context7.com/mcp` | `f73b6bf16685eddd5d797e4df610ceff` |

## Switching Workspaces/Accounts

### Option 1: Use the helper script (from opencode-configs)

```bash
# List all cached credentials
~/dev/github/opencode-configs/scripts/mcp-credentials.sh list

# Clear specific service
~/dev/github/opencode-configs/scripts/mcp-credentials.sh clear linear

# Clear by URL
~/dev/github/opencode-configs/scripts/mcp-credentials.sh clear https://mcp.linear.app/mcp
```

> Note: Requires bash 4.0+. On macOS: `/opt/homebrew/bin/bash ~/dev/github/opencode-configs/scripts/mcp-credentials.sh`

### Option 2: Manual clearing

```bash
# Clear Linear credentials
rm ~/.mcp-auth/mcp-remote-*/fcc436b0d1e0a1ed9a2b15bbd638eb13_*

# Clear Sentry credentials
rm ~/.mcp-auth/mcp-remote-*/305d49f5287a7c289157a704a0ed3b1e_*

# Clear ALL MCP credentials
rm -rf ~/.mcp-auth
```

After clearing, restart OpenCode. The next time the MCP is used, it will prompt for OAuth authentication.

## Identifying Unknown Services

Calculate the hash for any MCP URL:

```bash
# macOS
echo -n "https://mcp.linear.app/mcp" | md5

# Linux
echo -n "https://mcp.linear.app/mcp" | md5sum | cut -d' ' -f1
```

Or check the `scope` field in `_tokens.json` for hints about the service.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Token expired | Clear credentials for that service and re-authenticate |
| Wrong workspace | Clear credentials and re-authenticate with correct account |
| MCP not connecting | Check if credentials exist with `ls ~/.mcp-auth/mcp-remote-*/*_tokens.json` |
