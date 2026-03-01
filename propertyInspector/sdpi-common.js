// Shared Property Inspector boilerplate for OpenDeck plugin
var websocket = null;
var uuid = "";
var actionInfo = {};
var settings = {};

// Initialize the PI WebSocket connection.
// onReady(websocket, actionInfo) is called after registration completes.
// onMessage(msg) is called for each parsed incoming message.
function initPI(onReady, onMessage) {
  // Stream Deck / OpenDeck calls this global to bootstrap the PI
  window.connectElgatoStreamDeckSocket = function (inPort, inPropertyInspectorUUID, inRegisterEvent, inInfo, inActionInfo) {
    uuid = inPropertyInspectorUUID;

    try {
      actionInfo = JSON.parse(inActionInfo);
      settings = actionInfo.payload.settings || {};
    } catch (e) {
      actionInfo = {};
      settings = {};
    }

    websocket = new WebSocket("ws://localhost:" + inPort);

    websocket.onopen = function () {
      websocket.send(JSON.stringify({
        event: inRegisterEvent,
        uuid: uuid
      }));
      if (onReady) onReady(websocket, actionInfo);
    };

    websocket.onmessage = function (evt) {
      var msg;
      try { msg = JSON.parse(evt.data); } catch (e) { return; }

      if (msg.event === "didReceiveSettings") {
        settings = (msg.payload && msg.payload.settings) || {};
      }

      if (onMessage) onMessage(msg);
    };
  };
}

function sendSettings() {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify({
      event: "setSettings",
      context: uuid,
      payload: settings
    }));
  }
}
