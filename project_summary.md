Project summary

Build a “friendship light” system using Govee Wi-Fi smart outlets and a Govee Wi-Fi smart bulb, controlled remotely via iOS Shortcuts from multiple people. There are two independent “sets” of interactions:

Set A: Nathan ↔ Girlfriend (outlet ↔ outlet)
	•	Nathan’s iOS shortcut turns ON Girlfriend’s outlet.
	•	Girlfriend’s iOS shortcut turns ON Nathan’s outlet.

Set B: Daughter ↔ Grandparents (daughter has outlet + bulb; grandparents have outlet)

Daughter’s location has two devices:
	•	A Govee outlet (“daughter_outlet”) and
	•	A Govee Wi-Fi bulb (“daughter_bulb”)

Grandparents’ location has:
	•	A Govee outlet (“grandparents_outlet”)

Shortcuts in this set:
	•	Daughter’s shortcut turns ON grandparents_outlet (one-way signal to grandparents).
	•	Mom’s shortcut triggers daughter’s “signal”: turn ON daughter_outlet, wait 10 seconds, then turn ON daughter_bulb to RED.
	•	Dad’s shortcut triggers daughter’s “signal”: turn ON daughter_outlet, wait 10 seconds, then turn ON daughter_bulb to BLUE.

Special behavior (important)

For Mom/Dad → Daughter triggers, do this sequence:
	1.	Turn ON daughter_outlet
	2.	Wait 10 seconds
	3.	Turn ON daughter_bulb and set it to the required color (red/blue)

Rationale: Daughter can “acknowledge” by turning OFF daughter_outlet after she sees it. Next time a grandparent triggers, turning the outlet ON again serves as a fresh “new signal,” then the bulb color comes on after 10s.

Latency is not critical. No subscriptions. No Raspberry Pi. No home-assistant stack.

⸻

High-level architecture

Use a single public HTTP API (recommended: Cloudflare Worker) as a gateway between iOS Shortcuts and the Govee cloud API:

iOS Shortcut (phone) → POST to Worker endpoint → Worker calls Govee OpenAPI → device changes state

Why:
	•	iOS Shortcuts shouldn’t contain the Govee API key.
	•	Worker can enforce auth, rate limits, sequencing (including delay), logging.
	•	One simple endpoint can support all 5 shortcuts and future expansion.

⸻

Critical account / keying model

To keep this simple and robust:
	•	Use ONE Govee account that “owns” (has paired) all devices across all households:
	•	nathan_outlet
	•	girlfriend_outlet
	•	grandparents_outlet
	•	daughter_outlet
	•	daughter_bulb

Then request ONE Govee Developer API key for that account.

All iOS shortcuts (across all phones) will call the Worker using one or more Worker-level tokens (recommended: per-person token), but never the Govee key.

⸻

Govee API approach

Use Govee OpenAPI endpoints (cloud):
	1.	List devices (one-time discovery; then hardcode mapping in Worker config):

	•	GET https://openapi.api.govee.com/router/api/v1/user/devices
	•	Header: Govee-API-Key: <GOVEE_API_KEY>

This returns device records containing at least:
	•	sku (product SKU/model)
	•	device (device identifier)
	•	capabilities

	2.	Control device:

	•	POST https://openapi.api.govee.com/router/api/v1/device/control
	•	Header: Govee-API-Key: <GOVEE_API_KEY>
	•	JSON body includes:
	•	requestId (uuid)
	•	payload with sku, device, and a single capability command

Common command patterns:
	•	Outlet on/off:
	•	type: "devices.capabilities.on_off"
	•	instance: "powerSwitch"
	•	value: 1 (on) or 0 (off)
	•	Bulb brightness:
	•	type: "devices.capabilities.range"
	•	instance: "brightness"
	•	value: 1..100
	•	Bulb color:
	•	type: "devices.capabilities.color_setting"
	•	instance: "colorRgb"
	•	value: <packed RGB int> where packed = (R<<16) + (G<<8) + B

RED = [255,0,0] ⇒ 0xFF0000 ⇒ 16711680
BLUE = [0,0,255] ⇒ 0x0000FF ⇒ 255

⸻

Worker API design

One public endpoint for all triggers

Expose:
	•	POST /signal
	•	Auth required via header:
	•	Authorization: Bearer <TOKEN>

Request body schema (simple + explicit)

Example JSON:

{
  "action": "plug_on",
  "target": "girlfriend_outlet"
}

For bulb sequences:

{
  "action": "daughter_signal",
  "color": "red"
}

Keep the phone payloads tiny. Do mapping logic in Worker.

Server-side mapping table

In Worker code, maintain a static mapping:

const TARGETS = {
  nathan_outlet:      { sku: "...", device: "..." },
  girlfriend_outlet:  { sku: "...", device: "..." },
  grandparents_outlet:{ sku: "...", device: "..." },
  daughter_outlet:    { sku: "...", device: "..." },
  daughter_bulb:      { sku: "...", device: "..." }
};

Worker logic (required behaviors)

Common helper: control(sku, device, capability)
Send a single control command to Govee.

Action handlers
	1.	plug_on(target)

	•	Send on/off capability with value = 1

	2.	daughter_signal(color)
Must do:

	•	Turn ON daughter_outlet
	•	Wait 10 seconds
	•	Turn ON daughter_bulb (on/off = 1)
	•	Set bulb color to red or blue
	•	Optionally set brightness to a fixed value (pick something like 60) for consistency

Implementation detail in Cloudflare Worker
Workers support async. Use:
	•	await control(...)
	•	await new Promise(r => setTimeout(r, 10000))
	•	await control(...) …

(If there are runtime limits, keep it simple: 10 seconds is typically fine. If concerned, alternative is to store a pending action in KV with a timestamp and have the bulb-side poll; but the current requirement explicitly wants a 10-second delay and is tolerant of latency, so inline delay is acceptable unless Worker time limits interfere.)

Security / ops requirements
	•	Store secrets using Worker environment secrets:
	•	GOVEE_API_KEY
	•	tokens (either one shared token or per-person tokens)
	•	Validate auth token for every request.
	•	Basic abuse protection:
	•	rate limit per token/IP (even a crude “1 request per second” in KV is fine)
	•	Logging:
	•	log requests (action, target, timestamp, outcome)
	•	Return clear JSON response:
	•	{ "ok": true } or error codes.

Token model (recommended)

Create distinct tokens per person so you can revoke one without breaking others:
	•	TOKEN_NATHAN
	•	TOKEN_GIRLFRIEND
	•	TOKEN_DAUGHTER
	•	TOKEN_MOM
	•	TOKEN_DAD

Worker checks which token called and optionally restricts allowed actions. Example:
	•	Mom token can only trigger daughter_signal(red)
	•	Dad token can only trigger daughter_signal(blue)

⸻

The 5 iOS Shortcuts (final list)

All shortcuts use iOS “Get Contents of URL” action:
	•	Method: POST
	•	URL: https://<worker-domain>/signal
	•	Headers:
	•	Authorization: Bearer <PERSON_TOKEN>
	•	Content-Type: application/json
	•	Body: JSON

Shortcut 1 — Nathan → Girlfriend outlet ON

Body:

{ "action": "plug_on", "target": "girlfriend_outlet" }

Shortcut 2 — Girlfriend → Nathan outlet ON

Body:

{ "action": "plug_on", "target": "nathan_outlet" }

Shortcut 3 — Daughter → Grandparents outlet ON

Body:

{ "action": "plug_on", "target": "grandparents_outlet" }

Shortcut 4 — Mom → Daughter signal (Outlet ON, wait 10s, Bulb RED)

Body:

{ "action": "daughter_signal", "color": "red" }

Shortcut 5 — Dad → Daughter signal (Outlet ON, wait 10s, Bulb BLUE)

Body:

{ "action": "daughter_signal", "color": "blue" }

Deployment UX:
	•	Add each shortcut as a Lock Screen widget / Home Screen icon (optional).
	•	Keep them one-tap.

⸻

Step-by-step build plan from scratch

Phase 1: Hardware setup
	1.	Buy / plug in:
	•	3 outlets (nathan_outlet, girlfriend_outlet, grandparents_outlet)
	•	1 outlet at daughter’s location (daughter_outlet)
	•	1 bulb at daughter’s location (daughter_bulb)
	2.	Using the chosen single Govee account on a phone:
	•	Add each device in the Govee Home app at each location.
	•	Confirm each device is on 2.4GHz Wi-Fi and controllable from the app.

Phase 2: Developer access & device discovery
	3.	Request Govee API key for that account.
	4.	Call “List devices” endpoint.
	5.	Extract sku and device IDs for all 5 devices.
	6.	Fill in Worker mapping table.

Phase 3: Implement and deploy Worker
	7.	Create Cloudflare Worker project.
	8.	Add secrets:
	•	GOVEE_API_KEY
	•	per-person tokens
	9.	Implement /signal handler:
	•	auth validation
	•	parse JSON
	•	route to action handler
	10.	Implement plug_on and daughter_signal (with 10s delay).
	11.	Deploy Worker, test with curl:

	•	test each plug_on target
	•	test daughter_signal red/blue; confirm outlet turns on first, then bulb changes after ~10 seconds.

Phase 4: iOS Shortcuts
	12.	Create 5 shortcuts (one per person/action).
	13.	Paste endpoint + token + body.
	14.	Validate each shortcut triggers correct physical effect.

Phase 5: Reliability / polish
	15.	Add basic rate limiting.
	16.	Add logging and clear error responses.
	17.	Optional: add an “off” endpoint or shortcuts later if desired, but not required by current spec.

⸻

Acceptance criteria
	•	Each of the five shortcuts reliably triggers the intended device(s).
	•	Mom/Dad shortcut sequence is correct:
	•	daughter_outlet ON immediately
	•	~10 seconds later, daughter_bulb ON and set to target color
	•	No device IDs or Govee API key appear in iOS shortcuts.
	•	System works from anywhere with internet (no same-network requirement).
	•	No subscriptions, no always-on local computer, no port forwarding.

⸻

Potential pitfalls to avoid
	•	Devices must be Wi-Fi capable and actually added to the controlling Govee account.
	•	Ensure the bulb supports required capabilities (on/off + color). If a bulb model doesn’t expose color setting, you must replace it.
	•	If Cloudflare Worker runtime limits don’t tolerate 10-second waits in production, implement the delay via KV + scheduled follow-up mechanism; but attempt the straightforward delay first since latency is not critical and the sequence is simple.

