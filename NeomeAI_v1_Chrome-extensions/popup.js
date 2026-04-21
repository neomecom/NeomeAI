// popup.js

const clientIdEl = document.getElementById('clientId');
const refreshBtn = document.getElementById('refreshBtn');
const testPostBtn = document.getElementById('testPostBtn');
const statusEl = document.getElementById('status');
const copyBtn = document.getElementById('copyBtn');

function showStatus(text, isError = false) {
	statusEl.textContent = text;
	statusEl.style.color = isError ? '#f87171' : '#4ade80';
}

function requestClientId() {
	chrome.runtime.sendMessage({ action: "getStatus" }, (response) => {
		if (chrome.runtime.lastError) {
			clientIdEl.textContent = "Extension error";
			showStatus(chrome.runtime.lastError.message || "Runtime error", true);
			return;
		}

		if (response && response.clientId) {
			clientIdEl.textContent = response.clientId;
		} else {
			clientIdEl.textContent = "Connecting to server...";
		}
	});
}

refreshBtn.addEventListener('click', () => {
	showStatus("Requesting new client ID...");

	chrome.runtime.sendMessage({ action: "refreshClientId" }, (response) => {
		if (chrome.runtime.lastError) {
			showStatus(chrome.runtime.lastError.message || "Runtime error", true);
			return;
		}

		if (!response || !response.ok) {
			showStatus((response && response.error) || "Failed to request new client ID", true);
			return;
		}
	});
});

testPostBtn.addEventListener('click', () => {
	const testText = "Test post from popup " + new Date().toLocaleTimeString();

	chrome.runtime.sendMessage({
		action: "testPost",
		text: testText
	}, () => {
		if (chrome.runtime.lastError) {
			showStatus(chrome.runtime.lastError.message || "Runtime error", true);
			return;
		}

		showStatus("Test post sent");
	});
});

copyBtn.addEventListener('click', async () => {
	const text = (clientIdEl.textContent || '').trim();

	if (!text || text === "Loading..." || text === "Connecting to server..." || text === "Extension error") {
		showStatus("No valid Client ID to copy", true);
		return;
	}

	try {
		await navigator.clipboard.writeText(text);
		showStatus("Client ID copied");
	} catch (err) {
		showStatus("Failed to copy Client ID", true);
	}
});

window.onload = requestClientId;

chrome.runtime.onMessage.addListener((message) => {
	if (message.type === "clientId") {
		clientIdEl.textContent = message.clientId || "Not available";
		showStatus("");
	}
});