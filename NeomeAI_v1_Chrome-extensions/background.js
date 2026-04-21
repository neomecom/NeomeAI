// background.js
// Router only - shared WebSocket + popup + platform dispatch
// MV3-safe WebSocket keepalive + reconnect

import { handleCommand as handleXCommand } from "./CustomScripts/x.js";
import { handleCommand as handleRedditCommand } from "./CustomScripts/reddit.js";
import { handleCommand as handleTikTokCommand } from "./CustomScripts/tiktok.js";
import { handleCommand as handleGmailCommand } from "./CustomScripts/gmail.js";
import { handleCommand as handleTelegramCommand } from "./CustomScripts/telegram.js";

const platformHandlers = {
	x: handleXCommand,
	reddit: handleRedditCommand,
	tiktok: handleTikTokCommand,
	gmail: handleGmailCommand,
	telegram: handleTelegramCommand
};

console.log("Neome Poster Background Router loaded");

const WS_URL = "wss://social.neome.com";

const KEEPALIVE_MS = 20 * 1000;
const RECONNECT_MS = 5000;
const SOCKET_CHECK_ALARM = "socket-health-check";

let ws = null;
let clientId = null;
let keepAliveTimer = null;
let reconnectTimer = null;
let isConnecting = false;

function notifyPopup() {
	chrome.runtime.sendMessage({
		type: "clientId",
		clientId: clientId || "Not received yet"
	}).catch(() => { });
}

function clearKeepAlive() {
	if (keepAliveTimer) {
		clearInterval(keepAliveTimer);
		keepAliveTimer = null;
	}
}

function startKeepAlive() {
	clearKeepAlive();

	keepAliveTimer = setInterval(() => {
		try {
			if (ws && ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({
					type: "keepalive",
					ts: Date.now()
				}));
				console.log("keepalive sent");
			} else {
				clearKeepAlive();
			}
		} catch (err) {
			console.warn("keepalive failed:", err);
		}
	}, KEEPALIVE_MS);
}

function scheduleReconnect(delay = RECONNECT_MS) {
	if (reconnectTimer) return;

	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		connectWebSocket();
	}, delay);
}

function cleanupSocket() {
	clearKeepAlive();

	if (ws) {
		try {
			ws.onopen = null;
			ws.onmessage = null;
			ws.onclose = null;
			ws.onerror = null;
			ws.close();
		} catch (_) { }
	}

	ws = null;
	isConnecting = false;
}

function connectWebSocket() {
	if (isConnecting) return;
	if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

	isConnecting = true;

	console.log("Connecting to " + WS_URL + " as CLIENT...");

	try {
		ws = new WebSocket(WS_URL);
	} catch (err) {
		console.error("WebSocket constructor failed:", err);
		isConnecting = false;
		scheduleReconnect();
		return;
	}

	ws.onopen = () => {
		console.log("WebSocket connected");
		isConnecting = false;

		try {
			ws.send(JSON.stringify({
				role: "client",
				id: chrome.runtime.id
			}));
		} catch (err) {
			console.error("Failed sending hello:", err);
		}

		startKeepAlive();
	};

	ws.onmessage = async (event) => {
		try {
			const data = JSON.parse(event.data);
			console.log("Server message:", data);

			if (data.type === "hello" && data.id) {
				clientId = data.id;
				notifyPopup();
				return;
			}

			if (data.type === "cmd") {
				await routeCommand(data);
				return;
			}

			if (data.type === "keepalive_ack" || data.type === "pong") {
				return;
			}
		} catch (e) {
			console.error("Parse error:", e);
		}
	};

	ws.onclose = (event) => {
		console.warn("WebSocket closed", event.code, event.reason || "");
		cleanupSocket();
		scheduleReconnect();
	};

	ws.onerror = (err) => {
		console.error("WebSocket error", err);
	};
}

async function routeCommand(data) {
	const platform = String(data.platform || "x").trim().toLowerCase();
	const handler = platformHandlers[platform];

	if (!handler) {
		console.error("No handler for platform:", platform);
		return;
	}

	try {
		await handler(data);
	} catch (err) {
		console.error("Platform handler failed:", platform, err);
	}
}

function sendWsPayload(payload, sendResponse) {
	if (!ws || ws.readyState !== WebSocket.OPEN) {
		console.warn("WS not connected");
		sendResponse?.({
			ok: false,
			error: "ws not connected"
		});
		return true;
	}

	try {
		ws.send(JSON.stringify(payload));
		console.log("payload sent to WS:", payload);
		sendResponse?.({ ok: true });
	} catch (e) {
		console.error("Failed sending payload:", e);
		sendResponse?.({
			ok: false,
			error: "ws send failed"
		});
	}

	return true;
}

chrome.runtime.onStartup.addListener(() => {
	console.log("onStartup");
	connectWebSocket();
});

chrome.runtime.onInstalled.addListener(() => {
	console.log("onInstalled");
	connectWebSocket();

	try {
		chrome.alarms.create(SOCKET_CHECK_ALARM, {
			periodInMinutes: 0.5
		});
	} catch (err) {
		console.warn("alarms create failed:", err);
	}
});

chrome.alarms?.onAlarm.addListener((alarm) => {
	if (alarm.name !== SOCKET_CHECK_ALARM) return;

	if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
		console.log("alarm reconnect check");
		connectWebSocket();
	}
});

chrome.runtime.onSuspend?.addListener(() => {
	console.log("service worker suspending");
	clearKeepAlive();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === "getStatus") {
		sendResponse({
			clientId: clientId || "Connecting to server...",
			wsState: ws ? ws.readyState : "none"
		});
		return true;
	}

	if (message.action === "refreshClientId") {
		console.log("Refresh client ID requested from popup");

		if (!ws || ws.readyState !== WebSocket.OPEN) {
			connectWebSocket();
			sendResponse({
				ok: false,
				error: "WebSocket not connected"
			});
			return true;
		}

		try {
			ws.send(JSON.stringify({
				type: "refresh_id"
			}));

			sendResponse({ ok: true });
		} catch (e) {
			console.error("Failed to request new client ID:", e);
			sendResponse({
				ok: false,
				error: "Failed to send refresh request"
			});
		}

		return true;
	}

	if (message.action === "testPost") {
		routeCommand({
			type: "cmd",
			platform: "x",
			action: "post",
			text: message.text || ""
		}).then(() => {
			sendResponse({ ok: true });
		}).catch((err) => {
			console.error("Test post failed:", err);
			sendResponse({
				ok: false,
				error: "Test post failed"
			});
		});

		return true;
	}

	if (message.action === "forwardWs" && message.payload) {
		return sendWsPayload(message.payload, sendResponse);
	}
});

try {
	chrome.alarms.create(SOCKET_CHECK_ALARM, {
		periodInMinutes: 0.5
	});
} catch (err) {
	console.warn("init failed:", err);
}

connectWebSocket();