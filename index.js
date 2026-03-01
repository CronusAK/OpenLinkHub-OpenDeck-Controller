const WebSocket = require("ws");
const openlinkhub = require("./openlinkhub");

// --- CLI arg parsing ---
// OpenDeck launches plugins with: -port <port> -pluginUUID <uuid> -registerEvent <event> -info <json>
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace(/^-/, "")] = process.argv[i + 1];
}

const { port, pluginUUID, registerEvent } = args;

if (!port || !pluginUUID || !registerEvent) {
  console.error("Missing required args: -port, -pluginUUID, -registerEvent");
  process.exit(1);
}

// --- Action UUID prefix ---
const PREFIX = "com.sfgrimes.fanprofile.";

// --- Context tracking ---
// Map of context string -> { action, short, context, settings, lastKnownProfile }
const contexts = new Map();

// Per-context caches to avoid redundant sends
const lastImageCache = new Map();
const lastTitleCache = new Map();

// --- WebSocket helpers ---
function send(obj) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function setTitle(context, title) {
  if (lastTitleCache.get(context) === title) return;
  lastTitleCache.set(context, title);
  send({ event: "setTitle", context, payload: { title, target: 0 } });
}

function sendToPropertyInspector(context, payload) {
  send({ event: "sendToPropertyInspector", context, payload });
}

// --- SVG rendering ---
function profileColor(profile) {
  if (!profile) return "#555";
  switch (profile.toLowerCase()) {
    case "quiet":       return "#4fc3f7"; // cool blue
    case "normal":      return "#f7821b"; // orange (matches audio plugin)
    case "performance": return "#ef5350"; // red
    default:            return "#aaa";
  }
}

// Fan icon as a background watermark (3 blades + hub)
const FAN_BG = `<g transform="translate(72,60)" opacity="0.12">
  <ellipse rx="30" ry="10" fill="#fff" transform="rotate(0) translate(0,-20)"/>
  <ellipse rx="30" ry="10" fill="#fff" transform="rotate(120) translate(0,-20)"/>
  <ellipse rx="30" ry="10" fill="#fff" transform="rotate(240) translate(0,-20)"/>
  <circle r="8" fill="#fff"/>
</g>`;

function renderSVG(label, profile) {
  const color = profileColor(profile);
  const name = profile || "\u2014"; // em dash for unknown

  return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">
<rect width="144" height="144" fill="#000"/>
${FAN_BG}
<text x="72" y="28" text-anchor="middle" fill="${color}" font-size="13" font-family="sans-serif" font-weight="500" opacity="0.9">${label}</text>
<text x="72" y="84" text-anchor="middle" fill="#fff" font-size="26" font-family="sans-serif" font-weight="bold" textLength="120" lengthAdjust="spacingAndGlyphs">${name}</text>
<rect x="12" y="114" width="120" height="8" rx="4" fill="#222"/>
<rect x="12" y="114" width="120" height="8" rx="4" fill="${color}"/>
</svg>`;
}

function setImage(context, svg) {
  if (lastImageCache.get(context) === svg) return;
  lastImageCache.set(context, svg);
  const b64 = Buffer.from(svg).toString("base64");
  setTitle(context, "");
  send({
    event: "setImage",
    context,
    payload: { image: `data:image/svg+xml;base64,${b64}`, target: 0 },
  });
}

// --- Display update ---
function updateContext(ctx) {
  if (ctx.short === "currentprofile") {
    openlinkhub.getProfileInfo((info) => {
      const apiProfile = info && info.activeProfile;
      // Prefer API-reported active profile; fall back to last-known
      if (apiProfile) ctx.lastKnownProfile = apiProfile;
      const profile = ctx.lastKnownProfile || null;
      setImage(ctx.context, renderSVG("Active", profile));
    });
  } else if (ctx.short === "setprofile") {
    const profile = (ctx.settings && ctx.settings.profile) || null;
    setImage(ctx.context, renderSVG("\u2192 Set", profile));
  }
}

function refreshAllCurrentProfiles() {
  for (const ctx of contexts.values()) {
    if (ctx.short === "currentprofile") updateContext(ctx);
  }
}

// --- Polling ---
// Re-query the API periodically to keep "current profile" displays fresh.
let pollTimer = null;

function startPolling() {
  pollTimer = setInterval(refreshAllCurrentProfiles, 10000);
}

// --- WebSocket connection ---
const ws = new WebSocket(`ws://localhost:${port}`);

ws.on("open", () => {
  send({ event: registerEvent, uuid: pluginUUID });
  console.log(`Plugin registered: ${pluginUUID}`);
  startPolling();
});

ws.on("message", (raw) => {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }

  const { event, action, context, payload } = msg;

  switch (event) {
    case "willAppear": {
      const settings = (payload && payload.settings) || {};
      const short = action.replace(PREFIX, "");
      contexts.set(context, { action, short, context, settings, lastKnownProfile: null });
      updateContext(contexts.get(context));
      break;
    }

    case "willDisappear":
      contexts.delete(context);
      lastImageCache.delete(context);
      lastTitleCache.delete(context);
      break;

    case "keyDown": {
      const ctx = contexts.get(context);
      if (!ctx) break;

      if (ctx.short === "currentprofile") {
        // Refresh display on press
        updateContext(ctx);
      } else if (ctx.short === "setprofile") {
        const profile = ctx.settings && ctx.settings.profile;
        if (!profile) {
          send({ event: "showAlert", context });
          break;
        }
        openlinkhub.setProfile(profile, (err) => {
          if (err) {
            console.error("Failed to set profile:", err.message);
            send({ event: "showAlert", context });
            return;
          }
          send({ event: "showOk", context });
          // Propagate to all currentprofile displays immediately
          for (const c of contexts.values()) {
            if (c.short === "currentprofile") {
              c.lastKnownProfile = profile;
              setImage(c.context, renderSVG("Active", profile));
            }
          }
        });
      }
      break;
    }

    case "didReceiveSettings": {
      const settings = (payload && payload.settings) || {};
      if (contexts.has(context)) {
        contexts.get(context).settings = settings;
        updateContext(contexts.get(context));
      }
      break;
    }

    case "sendToPlugin": {
      if (payload && payload.request === "getProfileList") {
        openlinkhub.getProfileInfo((info) => {
          const profiles = (info && info.profiles) || ["Quiet", "Normal", "Performance"];
          sendToPropertyInspector(context, { event: "profileList", profiles });
        });
      }
      break;
    }
  }
});

ws.on("close", () => {
  console.log("WebSocket closed");
  clearInterval(pollTimer);
  process.exit(0);
});

ws.on("error", (err) => {
  console.error("WebSocket error:", err.message);
  clearInterval(pollTimer);
  process.exit(1);
});

// --- Graceful shutdown ---
process.on("SIGTERM", () => { clearInterval(pollTimer); ws.close(); });
process.on("SIGINT",  () => { clearInterval(pollTimer); ws.close(); });
