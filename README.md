# Friendship Lights

A "friendship light" IoT system that lets family members signal each other across different households using Govee smart outlets and bulbs, controlled via iOS Shortcuts.

## Overview

```
┌─────────────────┐      ┌─────────────────────────┐      ┌─────────────────┐
│  iOS Shortcut   │ ──── │   Cloudflare Worker     │ ──── │  Govee Cloud    │
│  (one tap)      │ POST │   (auth + routing)      │  API │  (device ctrl)  │
└─────────────────┘      └─────────────────────────┘      └─────────────────┘
                                                                   │
                                                                   ▼
                                                          ┌─────────────────┐
                                                          │  Smart Devices  │
                                                          │  (outlets/bulb) │
                                                          └─────────────────┘
```

**The problem:** You want family members to be able to "ping" each other with a physical light signal, but you don't want to expose API keys on their phones or set up complex home automation.

**The solution:** A single Cloudflare Worker acts as a secure gateway. Each person gets an iOS Shortcut with their own auth token that can only trigger their specific allowed action.

## Features

- **One-tap signaling** via iOS Shortcuts
- **Per-person auth tokens** with action-level permissions (Mom can only trigger red, Dad can only trigger blue, etc.)
- **No API keys on devices** - Govee credentials stay server-side
- **Works from anywhere** - No same-network requirement, no port forwarding
- **No subscriptions** - Cloudflare Workers free tier is sufficient
- **No always-on hardware** - No Raspberry Pi, no home server

## Devices

| Device | Location | SKU | Purpose |
|--------|----------|-----|---------|
| nathan_outlet | Nathan's place | H5086 | Receives signal from girlfriend |
| girlfriend_outlet | Girlfriend's place | H5086 | Receives signal from Nathan |
| grandparents_outlet | Grandparents' place | H5086 | Receives signal from daughter |
| daughter_outlet | Daughter's place | H5086 | Receives signal from grandparents (immediate) |
| daughter_bulb | Daughter's place | H6008 | Shows color after 10s delay (red=Mom, blue=Dad) |

All devices are registered to a single Govee account and controlled via the [Govee OpenAPI](https://developer.govee.com/).

## Actions

### `plug_on`
Turns on a single outlet. Used for simple bidirectional signaling.

```json
{"action": "plug_on", "target": "girlfriend_outlet"}
```

### `daughter_signal`
A sequenced action for grandparent → daughter signaling:
1. Turn ON `daughter_outlet` (immediate visual signal)
2. Wait 10 seconds
3. Turn ON `daughter_bulb` and set color (red or blue)

This allows the daughter to see who signaled (Mom=red, Dad=blue) and acknowledge by turning off the outlet.

```json
{"action": "daughter_signal", "color": "red"}
```

### `all_off`
Admin action to turn off all 5 devices at once.

```json
{"action": "all_off"}
```

## Token Permissions

Each person has a unique token that restricts what actions they can perform:

| Person | Allowed Action |
|--------|----------------|
| Nathan | `plug_on` → girlfriend_outlet |
| Girlfriend | `plug_on` → nathan_outlet |
| Daughter | `plug_on` → grandparents_outlet |
| Mom | `daughter_signal` → red |
| Dad | `daughter_signal` → blue |
| Admin | `all_off` |

Attempting an unauthorized action returns `403 Forbidden`.

## API

### Endpoint

```
POST https://friendship-lights.nbramia.workers.dev/signal
```

### Headers

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer <token>` |
| `Content-Type` | `application/json` |

### Request Body

```json
{
  "action": "plug_on" | "daughter_signal" | "all_off",
  "target": "<device_name>",  // for plug_on
  "color": "red" | "blue"     // for daughter_signal
}
```

### Response

```json
{"ok": true}
```

Or on error:

```json
{"ok": false, "error": "Error message"}
```

### Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request (missing fields, invalid action) |
| 401 | Unauthorized (missing or invalid token) |
| 403 | Forbidden (action not permitted for token) |
| 404 | Not found (wrong endpoint) |
| 405 | Method not allowed (not POST) |
| 500 | Server error (Govee API failure) |

## Project Structure

```
friendship_lights/
├── README.md                 # This file
├── CLAUDE.md                 # AI assistant context
├── project_summary.md        # Original requirements spec
├── ios-shortcuts-setup.md    # Step-by-step shortcut creation guide
├── secrets.md                # API keys and tokens (git-ignored)
├── .gitignore
└── worker/                   # Cloudflare Worker
    ├── src/
    │   └── index.ts          # Main worker code
    ├── package.json
    ├── package-lock.json
    ├── wrangler.toml         # Cloudflare config
    ├── tsconfig.json
    ├── .dev.vars             # Local dev secrets (git-ignored)
    └── .gitignore
```

## Development

### Prerequisites

- Node.js 18+
- Cloudflare account
- Govee account with API key

### Local Development

```bash
cd worker
npm install

# Create .dev.vars with your secrets (see Configuration below)
npm run dev
```

The worker runs at `http://localhost:8787`.

### Testing Locally

```bash
curl -X POST http://localhost:8787/signal \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"action": "plug_on", "target": "girlfriend_outlet"}'
```

### Deployment

```bash
cd worker

# Set your Cloudflare API token
export CLOUDFLARE_API_TOKEN=<your-token>

# Deploy
npm run deploy
```

## Configuration

### Environment Variables

The worker requires these secrets (set via `wrangler secret put <NAME>`):

| Variable | Description |
|----------|-------------|
| `GOVEE_API_KEY` | Your Govee Developer API key |
| `TOKEN_NATHAN` | Auth token for Nathan |
| `TOKEN_GIRLFRIEND` | Auth token for Girlfriend |
| `TOKEN_DAUGHTER` | Auth token for Daughter |
| `TOKEN_MOM` | Auth token for Mom |
| `TOKEN_DAD` | Auth token for Dad |
| `TOKEN_ADMIN` | Auth token for admin (all_off) |

### Local Development Secrets

Create `worker/.dev.vars`:

```
GOVEE_API_KEY=your-govee-api-key
TOKEN_NATHAN=generated-token-1
TOKEN_GIRLFRIEND=generated-token-2
TOKEN_DAUGHTER=generated-token-3
TOKEN_MOM=generated-token-4
TOKEN_DAD=generated-token-5
TOKEN_ADMIN=generated-token-6
```

Generate secure tokens with:

```bash
openssl rand -hex 32
```

### Setting Production Secrets

```bash
echo "your-secret-value" | npx wrangler secret put SECRET_NAME
```

## iOS Shortcut Setup

Each shortcut uses the **"Get Contents of URL"** action:

1. Open Shortcuts app → tap **+**
2. Add action: **Get Contents of URL**
3. Set URL: `https://friendship-lights.nbramia.workers.dev/signal`
4. Set Method: **POST**
5. Add Headers:
   - `Authorization`: `Bearer <person's-token>`
   - `Content-Type`: `application/json`
6. Set Request Body: **JSON** with the action fields
7. Name it and add to Home Screen

See `ios-shortcuts-setup.md` for detailed per-person instructions.

### Sharing Shortcuts

- **AirDrop**: Long-press shortcut → Share → AirDrop to recipient
- **iCloud Link**: Long-press → Share → Copy iCloud Link → send via text/email

Recipients may need to enable **Settings → Shortcuts → Allow Untrusted Shortcuts**.

## Govee API Reference

### List Devices (discovery)

```bash
curl -X GET "https://openapi.api.govee.com/router/api/v1/user/devices" \
  -H "Govee-API-Key: <your-key>"
```

Returns device `sku` and `device` IDs needed for the worker config.

### Control Device

```bash
curl -X POST "https://openapi.api.govee.com/router/api/v1/device/control" \
  -H "Govee-API-Key: <your-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "uuid",
    "payload": {
      "sku": "H5086",
      "device": "AA:BB:CC:DD:EE:FF:00:11",
      "capability": {
        "type": "devices.capabilities.on_off",
        "instance": "powerSwitch",
        "value": 1
      }
    }
  }'
```

### Capability Types

| Capability | Instance | Value |
|------------|----------|-------|
| `devices.capabilities.on_off` | `powerSwitch` | `1` (on) or `0` (off) |
| `devices.capabilities.color_setting` | `colorRgb` | Integer: `(R<<16) + (G<<8) + B` |
| `devices.capabilities.range` | `brightness` | `1-100` |

**Color values:**
- Red: `16711680` (0xFF0000)
- Blue: `255` (0x0000FF)

## Hardware Requirements

- **Outlets**: Govee Wi-Fi Smart Plug (H5086 or similar with on/off capability)
- **Bulb**: Govee Wi-Fi Smart Bulb (H6008 or similar with RGB capability)
- All devices must be on **2.4GHz Wi-Fi** (Govee doesn't support 5GHz)

## Troubleshooting

### "Invalid token" error
- Verify the token matches exactly (no extra spaces)
- Check that the secret was set in Cloudflare: `npx wrangler secret list`

### "Action not permitted" error
- Each token can only perform its designated action
- Check the token permissions table above

### Device not responding
- Verify device is online in Govee Home app
- Check device ID matches the worker config
- Ensure Govee API key is valid

### 10-second delay not working
- Cloudflare Workers support up to 30 seconds CPU time
- If issues persist, the delay could be implemented via KV + scheduled triggers

## Security Considerations

- **Tokens are secrets** - treat them like passwords
- **HTTPS only** - all traffic is encrypted
- **Minimal permissions** - each token can only do one thing
- **No device IDs exposed** - clients only know action names, not device identifiers
- **Rate limiting** - can be added via Cloudflare KV if needed

## License

Private project. Not licensed for redistribution.
