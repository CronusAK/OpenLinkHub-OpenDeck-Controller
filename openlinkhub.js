// OpenLinkHub API interface
const http = require("http");
const fs = require("fs");
const path = require("path");

const TEMPERATURES_DIR = "/var/lib/openlinkhub/database/temperatures";
const BUILTIN_PROFILES = ["Quiet", "Normal", "Performance"];

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

// --- Device discovery ---

// Returns true if any channel in the device has fan speed control.
function hasSpeed(channels) {
  return Object.values(channels).some((c) => c && c.HasSpeed);
}

// Returns true if any channel in the device has RGB.
function hasRGB(channels) {
  return Object.values(channels).some((c) => c && c.rgb !== undefined);
}

// Return the first device matching filter, or null.
function findHub(data, filter) {
  for (const [key, val] of Object.entries((data && data.device) || {})) {
    const getDevice = val.GetDevice;
    if (!getDevice) continue;
    const channels = getDevice.devices || {};
    if (filter(channels)) return { serial: key, getDevice };
  }
  return null;
}

// Return ALL devices matching filter.
function findAllHubs(data, filter) {
  const result = [];
  for (const [key, val] of Object.entries((data && data.device) || {})) {
    const getDevice = val.GetDevice;
    if (!getDevice) continue;
    const channels = getDevice.devices || {};
    if (filter(channels)) result.push({ serial: key, getDevice });
  }
  return result;
}

// Apply an API POST to every matching device; calls callback(err, lastResult) when all finish.
function applyToAll(hubs, endpoint, body, callback) {
  if (hubs.length === 0) {
    return callback(new Error("No matching devices found"), null);
  }
  let remaining = hubs.length;
  let lastErr = null;
  let lastResult = null;
  for (const { serial } of hubs) {
    apiPost(endpoint, { ...body, deviceId: serial }, (err, result) => {
      if (err) lastErr = err;
      lastResult = result;
      if (--remaining === 0) callback(lastErr, lastResult);
    });
  }
}

// --- Custom speed profiles ---

function getCustomProfiles(callback) {
  fs.readdir(TEMPERATURES_DIR, (err, files) => {
    if (err) return callback([]);
    callback(
      files
        .filter((f) => f.endsWith(".json"))
        .map((f) => path.basename(f, ".json"))
    );
  });
}

// --- Public API ---

// Get device serial, available speed profiles, and current active speed profile.
// Returns { serial, profiles: string[], activeProfile: string|null } or null on error.
function getProfileInfo(callback) {
  getCustomProfiles((custom) => {
    apiGet("/api/speedProfiles", (err, data) => {
      if (err || !data) return callback(null);
      const hub = findHub(data, hasSpeed);
      if (!hub) return callback(null);
      const firstChannel = Object.values(hub.getDevice.devices)[0];
      const activeProfile = (firstChannel && firstChannel.profile) || null;
      const profiles = [...BUILTIN_PROFILES, ...custom];
      callback({ serial: hub.serial, profiles, activeProfile });
    });
  });
}

// Get device serial, available RGB profiles, and current active RGB profile.
// Returns { serial, profiles: string[], activeProfile: string|null } or null on error.
function getRGBInfo(callback) {
  apiGet("/api/speedProfiles", (err, data) => {
    if (err || !data) return callback(null);
    const hub = findHub(data, hasRGB);
    if (!hub) return callback(null);
    const firstChannel = Object.values(hub.getDevice.devices)[0];
    const activeProfile = (firstChannel && firstChannel.rgb) || null;
    const profiles = Object.keys((hub.getDevice.Rgb || {}).profiles || {}).sort();
    callback({ serial: hub.serial, profiles, activeProfile });
  });
}

// Set fan speed profile on all speed-capable devices.
function setProfile(profile, callback) {
  apiGet("/api/speedProfiles", (err, data) => {
    if (err || !data) return callback(new Error("OpenLinkHub not reachable"), null);
    applyToAll(findAllHubs(data, hasSpeed), "/api/speed", { channelId: -1, profile }, callback);
  });
}

// Set RGB profile on all RGB-capable devices.
function setRGBProfile(profile, callback) {
  apiGet("/api/speedProfiles", (err, data) => {
    if (err || !data) return callback(new Error("OpenLinkHub not reachable"), null);
    applyToAll(findAllHubs(data, hasRGB), "/api/color", { channelId: -1, profile }, callback);
  });
}

module.exports = { getProfileInfo, getRGBInfo, setProfile, setRGBProfile };
