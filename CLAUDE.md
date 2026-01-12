# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a "friendship light" IoT system that allows family members to signal each other using Govee smart outlets and bulbs. iOS Shortcuts trigger a Cloudflare Worker, which calls the Govee cloud API.

**Current Status:** Deployed and operational.

- **Worker URL:** `https://friendship-lights.nbramia.workers.dev`
- See `project_summary.md` for requirements, `secrets.md` for tokens and iOS Shortcut setup.

## Architecture

```
iOS Shortcuts → POST /signal → Cloudflare Worker → Govee OpenAPI → Smart Devices
```

**Key design decisions:**
- Single Govee account owns all 5 devices across all households
- One Worker endpoint (`POST /signal`) handles all 5 shortcuts
- Per-person auth tokens (TOKEN_NATHAN, TOKEN_PARTNER, etc.) with action-level permissions
- Govee API key stored as Worker secret, never exposed to iOS

**Devices (Govee account: nbramia@gmail.com):**

| Name | SKU | Device ID | Type |
|------|-----|-----------|------|
| nathan_outlet | H5086 | `06:5E:5C:E7:53:3D:09:2E` | Socket |
| partner_outlet | H5086 | `06:BD:5C:E7:53:42:C1:AE` | Socket |
| grandparents_outlet | H5086 | `09:1F:5C:E7:53:60:A1:5E` | Socket |
| daughter_outlet | H5086 | `08:BF:5C:E7:53:3D:45:10` | Socket |
| daughter_bulb | H6008 | `2D:B8:98:17:3C:C6:09:A8` | Light |

**Actions (compound signals):**

| Action | Effect |
|--------|--------|
| `nathan_signal` | partner_outlet ON, nathan_outlet OFF |
| `partner_signal` | nathan_outlet ON, partner_outlet OFF |
| `daughter_signal` | grandparents_outlet ON, daughter_bulb OFF |
| `grandparents_signal` | daughter_bulb ON (red/blue), grandparents_outlet OFF |
| `all_off` | All 5 devices OFF |
| `plug_off` | Specific device OFF |

## Project Structure

```
friendship_lights/
├── CLAUDE.md              # This file
├── project_summary.md     # Full requirements spec
├── secrets.md             # API keys and tokens (DO NOT COMMIT)
├── .gitignore
└── worker/                # Cloudflare Worker
    ├── src/index.ts       # Main worker code
    ├── package.json
    ├── wrangler.toml
    ├── tsconfig.json
    └── .dev.vars          # Local dev secrets (DO NOT COMMIT)
```

## Commands

All commands run from the `worker/` directory:

```bash
cd worker

# Install dependencies
npm install

# Local development (uses .dev.vars for secrets)
npm run dev

# Deploy to Cloudflare
npm run deploy

# Test locally (after npm run dev)
curl -X POST http://localhost:8787/signal \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"action": "nathan_signal"}'
```

## Govee API Reference

```bash
# List devices (one-time discovery)
GET https://openapi.api.govee.com/router/api/v1/user/devices
Header: Govee-API-Key: <key>

# Control device
POST https://openapi.api.govee.com/router/api/v1/device/control
Header: Govee-API-Key: <key>
```

**Capability patterns:**
- On/off: `type: "devices.capabilities.on_off"`, `instance: "powerSwitch"`, `value: 1|0`
- Color: `type: "devices.capabilities.color_setting"`, `instance: "colorRgb"`, `value: (R<<16)+(G<<8)+B`
- RED = 16711680, BLUE = 255

## Implementation Notes

- Device SKUs and IDs are hardcoded in Worker config after initial discovery.
- Each signal is a compound action (turns ON recipient device, turns OFF sender device).
- Mom's token only allows `grandparents_signal(red)`, Dad's only allows `grandparents_signal(blue)`.
