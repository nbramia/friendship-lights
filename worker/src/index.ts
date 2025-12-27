/**
 * Friendship Lights Worker
 *
 * A Cloudflare Worker that bridges iOS Shortcuts to Govee smart devices.
 * All 5 shortcuts hit POST /signal with different payloads.
 */

export interface Env {
  GOVEE_API_KEY: string;
  TOKEN_NATHAN: string;
  TOKEN_GIRLFRIEND: string;
  TOKEN_DAUGHTER: string;
  TOKEN_MOM: string;
  TOKEN_DAD: string;
  TOKEN_ADMIN: string;
}

// Device mapping - discovered via Govee API on 2024-12-23
const DEVICES = {
  nathan_outlet: { sku: "H5086", device: "06:5E:5C:E7:53:3D:09:2E" },
  girlfriend_outlet: { sku: "H5086", device: "06:BD:5C:E7:53:42:C1:AE" },
  grandparents_outlet: { sku: "H5086", device: "09:1F:5C:E7:53:60:A1:5E" },
  daughter_outlet: { sku: "H5086", device: "08:BF:5C:E7:53:3D:45:10" },
  daughter_bulb: { sku: "H6008", device: "2D:B8:98:17:3C:C6:09:A8" },
} as const;

type DeviceName = keyof typeof DEVICES;
type Color = "red" | "blue";

// RGB color values (packed as integer: R<<16 + G<<8 + B)
const COLORS = {
  red: 16711680,   // 0xFF0000
  blue: 255,       // 0x0000FF
} as const;

// Token permissions: which tokens can perform which actions
interface TokenPermissions {
  plug_on?: DeviceName[];
  daughter_signal?: Color[];
  all_off?: boolean;
}

function getTokenPermissions(env: Env): Record<string, TokenPermissions> {
  return {
    [env.TOKEN_NATHAN]: { plug_on: ["girlfriend_outlet"] },
    [env.TOKEN_GIRLFRIEND]: { plug_on: ["nathan_outlet"] },
    [env.TOKEN_DAUGHTER]: { plug_on: ["grandparents_outlet"] },
    [env.TOKEN_MOM]: { daughter_signal: ["red"] },
    [env.TOKEN_DAD]: { daughter_signal: ["blue"] },
    [env.TOKEN_ADMIN]: { all_off: true },
  };
}

// Send a control command to the Govee API
async function controlDevice(
  env: Env,
  sku: string,
  device: string,
  capability: { type: string; instance: string; value: number }
): Promise<{ success: boolean; error?: string }> {
  const requestId = crypto.randomUUID();

  const response = await fetch("https://openapi.api.govee.com/router/api/v1/device/control", {
    method: "POST",
    headers: {
      "Govee-API-Key": env.GOVEE_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requestId,
      payload: {
        sku,
        device,
        capability,
      },
    }),
  });

  const data = await response.json() as { code: number; message: string };

  if (data.code !== 200) {
    return { success: false, error: data.message };
  }
  return { success: true };
}

// Turn a device on
async function turnOn(env: Env, deviceName: DeviceName): Promise<{ success: boolean; error?: string }> {
  const device = DEVICES[deviceName];
  return controlDevice(env, device.sku, device.device, {
    type: "devices.capabilities.on_off",
    instance: "powerSwitch",
    value: 1,
  });
}

// Turn a device off
async function turnOff(env: Env, deviceName: DeviceName): Promise<{ success: boolean; error?: string }> {
  const device = DEVICES[deviceName];
  return controlDevice(env, device.sku, device.device, {
    type: "devices.capabilities.on_off",
    instance: "powerSwitch",
    value: 0,
  });
}

// Set bulb color (also turns it on)
async function setBulbColor(env: Env, color: Color): Promise<{ success: boolean; error?: string }> {
  const device = DEVICES.daughter_bulb;

  // First turn on the bulb
  const onResult = await controlDevice(env, device.sku, device.device, {
    type: "devices.capabilities.on_off",
    instance: "powerSwitch",
    value: 1,
  });

  if (!onResult.success) {
    return onResult;
  }

  // Then set the color
  return controlDevice(env, device.sku, device.device, {
    type: "devices.capabilities.color_setting",
    instance: "colorRgb",
    value: COLORS[color],
  });
}

// Action: plug_on - Turn on a specific outlet
async function handlePlugOn(
  env: Env,
  target: string
): Promise<{ ok: boolean; error?: string }> {
  if (!(target in DEVICES)) {
    return { ok: false, error: `Unknown target: ${target}` };
  }

  const result = await turnOn(env, target as DeviceName);
  return { ok: result.success, error: result.error };
}

// Action: daughter_signal - Outlet ON, wait 10s, then bulb with color
async function handleDaughterSignal(
  env: Env,
  color: string
): Promise<{ ok: boolean; error?: string }> {
  if (color !== "red" && color !== "blue") {
    return { ok: false, error: `Invalid color: ${color}. Must be 'red' or 'blue'.` };
  }

  // Step 1: Turn on daughter's outlet
  const outletResult = await turnOn(env, "daughter_outlet");
  if (!outletResult.success) {
    return { ok: false, error: `Failed to turn on outlet: ${outletResult.error}` };
  }

  // Step 2: Wait 10 seconds
  await new Promise((resolve) => setTimeout(resolve, 10000));

  // Step 3: Turn on bulb and set color
  const bulbResult = await setBulbColor(env, color);
  if (!bulbResult.success) {
    return { ok: false, error: `Failed to set bulb: ${bulbResult.error}` };
  }

  return { ok: true };
}

// Action: all_off - Turn off all devices
async function handleAllOff(env: Env): Promise<{ ok: boolean; error?: string }> {
  const devices: DeviceName[] = [
    "nathan_outlet",
    "girlfriend_outlet",
    "grandparents_outlet",
    "daughter_outlet",
    "daughter_bulb",
  ];

  const errors: string[] = [];

  for (const deviceName of devices) {
    const result = await turnOff(env, deviceName);
    if (!result.success) {
      errors.push(`${deviceName}: ${result.error}`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, error: errors.join("; ") };
  }

  return { ok: true };
}

// Main request handler
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Only accept POST to /signal
    const url = new URL(request.url);

    if (url.pathname !== "/signal") {
      return Response.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    if (request.method !== "POST") {
      return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
    }

    // Validate auth token
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ ok: false, error: "Missing or invalid authorization" }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const permissions = getTokenPermissions(env);

    if (!(token in permissions)) {
      return Response.json({ ok: false, error: "Invalid token" }, { status: 401 });
    }

    const tokenPerms = permissions[token];

    // Parse request body
    let body: { action?: string; target?: string; color?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const { action, target, color } = body;

    if (!action) {
      return Response.json({ ok: false, error: "Missing action field" }, { status: 400 });
    }

    // Route to action handler with permission check
    if (action === "plug_on") {
      if (!target) {
        return Response.json({ ok: false, error: "Missing target field for plug_on" }, { status: 400 });
      }

      if (!tokenPerms.plug_on?.includes(target as DeviceName)) {
        return Response.json({ ok: false, error: "Action not permitted for this token" }, { status: 403 });
      }

      const result = await handlePlugOn(env, target);
      return Response.json(result, { status: result.ok ? 200 : 500 });
    }

    if (action === "daughter_signal") {
      if (!color) {
        return Response.json({ ok: false, error: "Missing color field for daughter_signal" }, { status: 400 });
      }

      if (!tokenPerms.daughter_signal?.includes(color as Color)) {
        return Response.json({ ok: false, error: "Action not permitted for this token" }, { status: 403 });
      }

      const result = await handleDaughterSignal(env, color);
      return Response.json(result, { status: result.ok ? 200 : 500 });
    }

    if (action === "all_off") {
      if (!tokenPerms.all_off) {
        return Response.json({ ok: false, error: "Action not permitted for this token" }, { status: 403 });
      }

      const result = await handleAllOff(env);
      return Response.json(result, { status: result.ok ? 200 : 500 });
    }

    return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  },
};
