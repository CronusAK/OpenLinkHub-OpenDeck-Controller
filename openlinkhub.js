// OpenLinkHub API interface
// Default API endpoint matches the fanprofile script
const http = require("http");

const API_HOST = "127.0.0.1";
const API_PORT = 27003;

function apiGet(path, callback) {
  const options = { host: API_HOST, port: API_PORT, path };
  http.get(options, (res) => {
    let data = "";
    res.on("data", (chunk) => { data += chunk; });
    res.on("end", () => {
      try { callback(null, JSON.parse(data)); }
      catch (e) { callback(e, null); }
    });
  }).on("error", (err) => callback(err, null));
}

function apiPost(path, body, callback) {
  const bodyStr = JSON.stringify(body);
  const options = {
    host: API_HOST,
    port: API_PORT,
    path,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(bodyStr),
    },
  };
  const req = http.request(options, (res) => {
    let data = "";
    res.on("data", (chunk) => { data += chunk; });
    res.on("end", () => {
      try { callback(null, JSON.parse(data)); }
      catch (e) { callback(e, null); }
    });
  });
  req.on("error", (err) => callback(err, null));
  req.write(bodyStr);
  req.end();
}

// Get device serial and available profiles from /api/speedProfiles.
// Returns { serial, profiles: string[], activeProfile: string|null } or null on error.
function getProfileInfo(callback) {
  apiGet("/api/speedProfiles", (err, data) => {
    if (err || !data) return callback(null);

    const device = data.device || {};

    // Find the fan hub: the first device that has fan channels under GetDevice.devices
    let serial = null;
    let dev = null;
    for (const [key, val] of Object.entries(device)) {
      const channels = val.GetDevice && val.GetDevice.devices;
      if (channels && Object.keys(channels).length > 0) {
        serial = key;
        dev = val;
        break;
      }
    }
    if (!serial) return callback(null);

    // Current speed profile lives on each channel — all channels share the same
    // value after a -1 (all-channels) set, so reading the first one is sufficient.
    const channels = dev.GetDevice.devices;
    const firstChannel = Object.values(channels)[0];
    const activeProfile = (firstChannel && firstChannel.profile) || null;

    // OpenLinkHub's built-in speed preset names
    const profiles = ["Quiet", "Normal", "Performance"];

    callback({ serial, profiles, activeProfile });
  });
}

// Set fan speed profile for all channels on the first detected device.
function setProfile(profile, callback) {
  getProfileInfo((info) => {
    if (!info || !info.serial) {
      return callback(new Error("OpenLinkHub not reachable or no device found"), null);
    }
    apiPost(
      "/api/speed",
      { deviceId: info.serial, channelId: -1, profile },
      callback
    );
  });
}

module.exports = { getProfileInfo, setProfile };
