// telegram.js
// OPEN OR CREATE CHANNEL "neome", SEND BOOTSTRAP MESSAGE ONCE, THEN WATCH NEW POSTS
// Send new posts as:
// {
//   "type": "event",
//   "platform": "telegram",
//   "event": "mention",
//   "mention": {
//     "author": "user",
//     "text": "yo check this"
//   }
// }

let telegramTabId = null;
let telegramWatcherStarting = false;

let telegramPostLock = false;
let telegramLastPostKey = "";
let telegramLastPostAt = 0;


export async function handleCommand(data) {
	const action = String(data.action || "").toLowerCase();

	if (action !== "post") {
		return;
	}

	const text = String(data.text || "");
	const to = String(data.to || "user");
	const media = Array.isArray(data.media) ? data.media : [];
	const mediaBase64 = String(data.mediaBase64 || "");
	const mediaType = String(data.mediaType || "");

	const postKey = JSON.stringify({
		text,
		to,
		mediaCount: media.length,
		mediaBase64: mediaBase64 ? mediaBase64.slice(0, 120) : "",
		mediaType
	});

	const now = Date.now();

	console.log("Telegram post command received:", {
		now,
		postKey
	});

	if (telegramPostLock) {
		console.log("Telegram post skipped: lock active");
		return;
	}

	if (telegramLastPostKey === postKey && (now - telegramLastPostAt) < 8000) {
		console.log("Telegram post skipped: duplicate command");
		return;
	}

	telegramPostLock = true;
	telegramLastPostKey = postKey;
	telegramLastPostAt = now;

	try {
		await sendTelegramMessageFromBackground(
			text,
			to,
			media,
			mediaBase64,
			mediaType
		);
	} finally {
		setTimeout(() => {
			telegramPostLock = false;
		}, 4000);
	}
}

async function sendTelegramMessageFromBackground(text, to, media, mediaBase64, mediaType) {
	try {
		const tabs = await chrome.tabs.query({
			url: ["https://web.telegram.org/*"]
		});

		let tabId = null;
		let winId = null;
		let shouldCloseWindow = false;

		if (tabs && tabs.length) {
			tabId = tabs[0].id;
			console.log("Telegram existing tab found:", tabId);
		} else {
			const win = await chrome.windows.create({
				url: "https://web.telegram.org/k/",
				type: "popup",
				width: 600,
				height: 600,
				focused: true
			});

			tabId = win?.tabs?.[0]?.id || null;
			winId = win?.id || null;
			shouldCloseWindow = true;

			if (!tabId) {
				console.error("Telegram popup tab not found");
				return;
			}

			console.log("Telegram popup created:", tabId);
		}

		if (!shouldCloseWindow) {
			await new Promise(resolve => setTimeout(resolve, 300));
		} else {
			await new Promise(resolve => setTimeout(resolve, 2500));
		}

		const results = await chrome.scripting.executeScript({
			target: { tabId },
			func: sendTelegramMessageInPage,
			args: [text, to, media, mediaBase64, mediaType]
		});

		console.log("Telegram executeScript result:", results);

		const ok = !!(results && results[0] && results[0].result);

		if (ok && shouldCloseWindow && winId) {
			await chrome.windows.remove(winId).catch(() => { });
			console.log("Telegram window closed");
		}

		if (shouldCloseWindow && winId) {
			setTimeout(() => {
				chrome.windows.remove(winId).catch(() => { });
			}, 120000);
		}

	} catch (err) {
		if (shouldIgnoreScriptError(err)) return;
		console.error("Telegram send error:", err);
	}
}
function sendTelegramMessageInPage(text, to, media, mediaBase64, mediaType) {
	function sleep(ms) {
		return new Promise(r => setTimeout(r, ms));
	}
	function click(el) {
		if (!el) return false;

		try { el.scrollIntoView({ block: "center" }); } catch (_) { }
		try { el.focus(); } catch (_) { }

		try {
			el.click();
			return true;
		} catch (_) { }

		return false;
	}

	function setEditable(el, value) {
		el.focus();
		el.innerHTML = "";
		el.textContent = value;

		el.dispatchEvent(new InputEvent("input", {
			bubbles: true,
			inputType: "insertText",
			data: value
		}));
	}

	function findInput() {
		const els = Array.from(document.querySelectorAll('[contenteditable="true"]'));
		return els.find(el =>
			(el.className || "").includes("input-message-input") &&
			!(el.className || "").includes("fake")
		);
	}

	function findSend() {
		return Array.from(document.querySelectorAll("button"))
			.find(el => (el.className || "").includes("btn-send"));
	}

	function findConfirmSendButton() {
		return Array.from(document.querySelectorAll("button"))
			.find(el => {
				const txt = String(el.textContent || "").trim().toLowerCase();
				const cls = el.className || "";
				return (
					cls.includes("btn-primary") &&
					(txt === "send" || txt === "done" || txt === "next")
				);
			}) || null;
	}

	function dataUrlToFile(dataUrl, filename) {
		const match = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/i);
		if (!match) return null;

		const mime = match[1] || "application/octet-stream";
		const b64 = match[3] || "";
		const binary = atob(b64);
		const bytes = new Uint8Array(binary.length);

		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}

		return new File([bytes], filename, { type: mime });
	}

	function extFromMime(mime) {
		mime = String(mime || "").toLowerCase();
		if (mime.includes("png")) return ".png";
		if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
		if (mime.includes("gif")) return ".gif";
		if (mime.includes("webp")) return ".webp";
		if (mime.includes("mp4")) return ".mp4";
		return "";
	}

	function clearInput(input) {
		if (!input) return;

		input.innerHTML = "";
		input.textContent = "";

		input.dispatchEvent(new InputEvent("input", {
			bubbles: true,
			inputType: "deleteContentBackward"
		}));
	}

	const CHANNEL_NAME = "neome";

	function normalizeText(value) {
		return String(value || "").replace(/\s+/g, " ").trim();
	}

	function findExistingChannel(name) {
		const titles = Array.from(document.querySelectorAll(".peer-title"));

		for (const el of titles) {
			const txt = normalizeText(el.textContent || "").toLowerCase();
			if (txt !== name.toLowerCase()) continue;

			const row =
				el.closest(".dialog") ||
				el.closest('[data-peer-id]') ||
				el.closest(".ListItem") ||
				el.closest('[role="listitem"]');

			if (row) return row;
		}

		return null;
	}

	function getCurrentChatTitle() {
		const selectors = [
			".chat-info .title",
			"header .title",
			".peer-title"
		];

		for (const selector of selectors) {
			const els = Array.from(document.querySelectorAll(selector));
			for (const el of els) {
				const txt = normalizeText(el.textContent || "");
				if (txt) return txt;
			}
		}

		return "";
	}

	async function openExistingOrCreateChannel() {
		let existing = findExistingChannel(CHANNEL_NAME);

		if (existing) {
			console.log("Telegram channel already exists, opening...");

			const row =
				existing.closest(".dialog") ||
				existing.closest(".ListItem") ||
				existing.closest(".row") ||
				existing.parentElement;

			if (row) click(row);
			else click(existing);

			return "existing";
		}

		let menuBtn = document.querySelector("#new-menu");

		for (let i = 0; i < 10 && !menuBtn; i++) {
			await sleep(500);
			menuBtn = document.querySelector("#new-menu");
		}

		if (!menuBtn) {
			console.error("Telegram menu button not found");
			return "";
		}

		click(menuBtn);
		await sleep(500);

		const items = Array.from(document.querySelectorAll(".btn-menu-item"));

		const newChannelBtn = items.find(el =>
			(el.textContent || "").toLowerCase().includes("new channel")
		);

		if (!newChannelBtn) {
			console.error("Telegram New Channel button not found");
			return "";
		}

		click(newChannelBtn);
		await sleep(1000);

		let input = null;

		for (let i = 0; i < 12; i++) {
			const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));

			input = editables.find(el => {
				const cls = el.className || "";
				return cls.includes("input-field-input");
			}) || null;

			if (input) break;
			await sleep(300);
		}

		if (!input) {
			console.error("Telegram channel name input not found");
			return "";
		}

		input.innerHTML = "";
		input.textContent = "";
		await sleep(100);

		setEditable(input, CHANNEL_NAME);

		input.dispatchEvent(new Event("keyup", { bubbles: true }));
		input.dispatchEvent(new Event("change", { bubbles: true }));

		await sleep(800);

		let createBtn = null;

		for (let i = 0; i < 12; i++) {
			const buttons = Array.from(document.querySelectorAll("button.btn-circle.btn-corner"));

			createBtn = buttons.find(el => {
				const icon = el.querySelector(".button-icon");
				const iconText = normalizeText(icon?.textContent || "");
				const classes = el.className || "";
				return classes.includes("is-visible") && iconText === "";
			}) || null;

			if (createBtn) break;
			await sleep(300);
		}

		if (!createBtn) {
			console.error("Telegram create channel button not found");
			return "";
		}

		click(createBtn);
		console.log("Telegram channel creation triggered");
		return "created";
	}

	async function waitForChannelOpen() {
		for (let i = 0; i < 20; i++) {
			const title = normalizeText(getCurrentChatTitle() || "").toLowerCase();
			if (title === CHANNEL_NAME.toLowerCase()) {
				return true;
			}
			await sleep(500);
		}
		return false;
	}

	async function uploadMediaFileFromDataUrl(dataUrl, filename) {
		try {
			const file = dataUrlToFile(dataUrl, filename);
			if (!file) {
				console.error("Telegram media file build failed");
				return false;
			}

			function findAttachMenuButton() {
				return document.querySelector("attach-menu-button.btn-menu-toggle.attach-file");
			}

			function findPhotoOrVideoMenuItem() {
				return Array.from(document.querySelectorAll(".btn-menu-item")).find(el => {
					const txt = String(el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
					return txt.includes("photo or video");
				}) || null;
			}

			function findPhotoVideoInput() {
				return Array.from(document.querySelectorAll('input[type="file"]')).find(el => {
					const accept = String(el.getAttribute("accept") || "").toLowerCase();
					return accept.includes("video/mp4") || accept.includes("video/webm") || accept.includes("image/png");
				}) || null;
			}

			const attachBtn = findAttachMenuButton();
			if (!attachBtn) {
				console.error("Telegram attach button not found");
				return false;
			}

			click(attachBtn);
			await sleep(500);

			let photoVideoItem = null;
			for (let i = 0; i < 20; i++) {
				photoVideoItem = findPhotoOrVideoMenuItem();
				if (photoVideoItem) break;
				await sleep(200);
			}

			if (!photoVideoItem) {
				console.error("Telegram 'Photo or Video' menu item not found");
				return false;
			}

			click(photoVideoItem);
			await sleep(500);

			let fileInput = null;
			for (let i = 0; i < 20; i++) {
				fileInput = findPhotoVideoInput();
				if (fileInput) break;
				await sleep(200);
			}

			if (!fileInput) {
				console.error("Telegram photo/video input not found");
				return false;
			}

			const dt = new DataTransfer();
			dt.items.add(file);

			fileInput.files = dt.files;
			fileInput.dispatchEvent(new Event("input", { bubbles: true }));
			fileInput.dispatchEvent(new Event("change", { bubbles: true }));

			console.log("Telegram media selected:", filename);
			return true;

		} catch (err) {
			if (shouldIgnoreScriptError(err)) return;
			console.error("Telegram media upload failed:", err);
			return false;
		}
	}

	async function uploadVideoFromDataUrl(dataUrl, index) {
		return await uploadMediaFileFromDataUrl(dataUrl, "video_" + String(index || 1) + ".mp4");
	}

	async function pasteImageFromDataUrl(dataUrl) {
		try {
			const mimeMatch = String(dataUrl || "").match(/^data:([^;,]+)[;,]/i);
			const mime = mimeMatch ? mimeMatch[1] : "image/png";
			const file = dataUrlToFile(dataUrl, "image" + extFromMime(mime));
			if (!file) {
				console.error("Telegram file build failed");
				return false;
			}

			const input = findInput();
			if (!input) {
				console.error("Telegram input not found before paste");
				return false;
			}

			input.focus();

			const dt = new DataTransfer();
			dt.items.add(file);

			try {
				const pasteEvent = new ClipboardEvent("paste", {
					bubbles: true,
					cancelable: true,
					clipboardData: dt
				});

				input.dispatchEvent(pasteEvent);
				console.log("Telegram paste event dispatched with file");
			} catch (err) {
				if (shouldIgnoreScriptError(err)) return;
				console.error("Telegram paste dispatch failed:", err);
				return false;
			}

			return true;

		} catch (err) {
			if (shouldIgnoreScriptError(err)) return;
			console.error("Telegram pasteImageFromDataUrl failed:", err);
			return false;
		}
	}

	return (async () => {
		const cleanText = String(text || "").trim();

		const mediaItems = Array.isArray(media) ? media : [];

		const imageDataUrls = mediaItems
			.map(item => ({
				type: String(item?.type || item?.mediaType || ""),
				data: String(item?.data || item?.base64 || item?.mediaBase64 || "")
			}))
			.filter(item => item.type.startsWith("image/") && item.data);

		if (!imageDataUrls.length && String(mediaType || "").startsWith("image/") && String(mediaBase64 || "")) {
			imageDataUrls.push({
				type: String(mediaType || ""),
				data: String(mediaBase64 || "")
			});
		}

		const videoDataUrls = mediaItems
			.map(item => ({
				type: String(item?.type || item?.mediaType || ""),
				data: String(item?.data || item?.base64 || item?.mediaBase64 || "")
			}))
			.filter(item => item.type.startsWith("video/") && item.data);

		if (!videoDataUrls.length && String(mediaType || "").startsWith("video/") && String(mediaBase64 || "")) {
			videoDataUrls.push({
				type: String(mediaType || ""),
				data: String(mediaBase64 || "")
			});
		}


		const finalText = cleanText
			? ("neome: " + cleanText)
			: (imageDataUrls.length ? "neome: here is the image you requested" : "neome:");

		const channelMode = await openExistingOrCreateChannel();
		if (!channelMode) {
			console.error("Telegram failed to open or create channel");
			return;
		}

		await sleep(2500);

		const opened = await waitForChannelOpen();
		if (!opened) {
			console.error("Telegram channel did not open");
			return;
		}

		let input = null;

		for (let i = 0; i < 15; i++) {
			input = findInput();
			if (input) break;
			await sleep(300);
		}

		if (!input) {
			console.error("input not found");
			return;
		}

		console.log("Telegram media detected:", {
			imageCount: imageDataUrls.length,
			videoCount: videoDataUrls.length
		});

		// ================= MIXED MEDIA FLOW =================
		if (imageDataUrls.length || videoDataUrls.length) {
			try {
				let hasAnyMedia = false;

				// 1. type text first in the main input
				if (input && finalText) {
					setEditable(input, finalText);
					await sleep(700);
				}

				// 2. paste all images first
				for (const item of imageDataUrls) {
					const ok = await pasteImageFromDataUrl(item.data);
					if (ok) {
						hasAnyMedia = true;
						await sleep(1200);
					}
				}

				// 3. upload each video after images
				for (let i = 0; i < videoDataUrls.length; i++) {
					const ok = await uploadVideoFromDataUrl(videoDataUrls[i].data, i + 1);
					if (ok) {
						hasAnyMedia = true;
						await sleep(6000);
					}
				}

				if (!hasAnyMedia) {
					console.warn("Telegram media failed, sending text only");

					let sendBtn = null;

					for (let i = 0; i < 20; i++) {
						sendBtn = findSend();
						if (sendBtn) break;
						await sleep(300);
					}

					if (!sendBtn) {
						console.error("Telegram send button not found");
						return false;
					}

					click(sendBtn);
					await sleep(500);

					clearInput(findInput());
					return true;
				}

				await sleep(1200);

				// 4. click confirm/send once
				let confirmBtn = null;

				for (let i = 0; i < 25; i++) {
					confirmBtn = findConfirmSendButton();
					if (confirmBtn) break;
					await sleep(300);
				}

				if (confirmBtn) {
					click(confirmBtn);
					await sleep(1200);
					console.log("Telegram media confirmed");
					return true;
				}

				let sendBtn = null;

				for (let i = 0; i < 25; i++) {
					sendBtn = findSend();
					if (sendBtn) break;
					await sleep(300);
				}

				if (!sendBtn) {
					console.error("Telegram final send button not found");
					return false;
				}

				click(sendBtn);
				await sleep(800);

				clearInput(findInput());

				console.log("Telegram mixed media sent:", finalText);
				return true;

			} catch (err) {
				if (shouldIgnoreScriptError(err)) return;
				console.error("Telegram mixed media flow failed:", err);
				return false;
			}
		}

		// text only flow
		setEditable(input, finalText);
		await sleep(500);

		let sendBtn = null;

		for (let i = 0; i < 15; i++) {
			sendBtn = findSend();
			if (sendBtn) break;
			await sleep(300);
		}

		if (!sendBtn) {
			console.error("send button not found");
			return;
		}

		click(sendBtn);

		await sleep(300);
		clearInput(input);

		console.log("Telegram message sent:", finalText);
		return true;
	})();
}

async function ensureTelegramWatcherRunning() {
	if (telegramWatcherStarting) {
		console.log("Telegram watcher already starting");
		return;
	}

	telegramWatcherStarting = true;

	try {
		let tab = null;

		if (telegramTabId) {
			try {
				tab = await chrome.tabs.get(telegramTabId);

				if (!tab || !String(tab.url || "").startsWith("https://web.telegram.org/")) {
					tab = null;
					telegramTabId = null;
				}
			} catch (_) {
				tab = null;
				telegramTabId = null;
			}
		}

		if (!tab) {
			const tabs = await chrome.tabs.query({
				url: ["https://web.telegram.org/*"]
			});

			if (tabs && tabs.length) {
				tab = tabs[0];
				telegramTabId = tab.id;
				console.log("Telegram existing tab reused:", telegramTabId);
			}
		}

		if (!tab) {
			tab = await chrome.tabs.create({
				url: "https://web.telegram.org/k/",
				active: true
			});
			telegramTabId = tab.id;
			console.log("Telegram tab created:", telegramTabId);
		}

		await waitForTelegramReady(tab.id);

		const result = await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			func: () => {
				if (window.__neomeTelegramRunning) {
					console.log("Telegram watcher already inside tab");
					return { alreadyRunning: true };
				}

				return { alreadyRunning: false };
			}
		});

		const alreadyRunning = !!(result && result[0] && result[0].result && result[0].result.alreadyRunning);

		if (alreadyRunning) {
			console.log("Telegram watcher already injected in tab");
			return;
		}

		await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			func: createOpenSendAndWatchTelegramChannel
		});

		console.log("Telegram injection done");

	} catch (err) {
		if (shouldIgnoreScriptError(err)) return;
		console.error("Telegram error:", err);
	} finally {
		telegramWatcherStarting = false;
	}
}

async function waitForTelegramReady(tabId) {
	const start = Date.now();

	while (Date.now() - start < 5000) {
		const result = await chrome.scripting.executeScript({
			target: { tabId },
			func: () => {
				return !!document.querySelector(".input-message-input");
			}
		});

		if (result && result[0] && result[0].result) {
			console.log("Telegram UI ready");
			return;
		}

		await new Promise(r => setTimeout(r, 200));
	}

	console.warn("Telegram ready fallback");
}



function createOpenSendAndWatchTelegramChannel() {
	if (window.__neomeTelegramRunning) {
		console.log("Telegram script already running");
		return;
	}

	window.__neomeTelegramRunning = true;

	const CHANNEL_NAME = "neome";
	const seenMessageKeys = new Set();
	let initialized = false;
	let lastSeenTelegramTimestamp = 0;


	function sleep(ms) {
		return new Promise(r => setTimeout(r, ms));
	}

	function normalizeText(value) {
		return String(value || "").replace(/\s+/g, " ").trim();
	}

	function click(el) {
		if (!el) return false;

		try { el.scrollIntoView({ block: "center" }); } catch (_) { }
		try { el.focus(); } catch (_) { }

		try {
			el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
			el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
			el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
			el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		} catch (_) { }

		try { el.click(); } catch (_) { }

		return true;
	}

	function setEditable(el, text) {
		if (!el) return false;

		el.focus();
		click(el);
		el.innerHTML = "";
		el.textContent = text;

		el.dispatchEvent(new InputEvent("input", {
			bubbles: true,
			inputType: "insertText",
			data: text
		}));

		el.dispatchEvent(new Event("change", { bubbles: true }));
		return true;
	}

	function sendTelegramEvent(message) {
		try {
			console.log("Telegram event sent:", message);

			chrome.runtime.sendMessage({
				action: "forwardWs",
				payload: {
					type: "event",
					platform: "telegram",
					event: "mention",
					mention: {
						threadId: String(message?.threadId || ""),
						author: "user",
						text: String(message?.text || "")
					}
				}
			});
		} catch (err) {
			if (shouldIgnoreScriptError(err)) return;
			console.error("Failed to send forwardWs:", err);
		}
	}

	function findExistingChannel(name) {
		const titles = Array.from(document.querySelectorAll(".peer-title"));

		for (const el of titles) {
			const txt = normalizeText(el.textContent || "").toLowerCase();
			if (txt !== name.toLowerCase()) continue;

			return (
				el.closest(".dialog") ||
				el.closest(".ListItem") ||
				el.closest(".row") ||
				el.closest('[data-peer-id]') ||
				el
			);
		}

		return null;
	}

	function getCurrentChatTitle() {
		const selectors = [
			".chat-info .title",
			"header .title",
			".peer-title"
		];

		for (const selector of selectors) {
			const els = Array.from(document.querySelectorAll(selector));
			for (const el of els) {
				const txt = normalizeText(el.textContent || "");
				if (txt) return txt;
			}
		}

		return "";
	}

	function getMessageNodes() {
		return Array.from(document.querySelectorAll(".bubble[data-mid]"));
	}

	function getMessageText(node) {
		if (!node) return "";

		const textEl =
			node.querySelector(".translatable-message") ||
			node.querySelector(".message");

		if (textEl) {
			const txt = normalizeText(textEl.textContent || "");
			if (txt) return txt;
		}

		return "";
	}

	function extractMessage(node) {
		if (!node) return null;

		const text = getMessageText(node);
		if (!text) return null;

		const peerId = String(node.getAttribute("data-peer-id") || "").trim();
		const mid = String(node.getAttribute("data-mid") || "").trim();
		const uid = peerId + "|" + mid;

		return {
			threadId: peerId + ":" + mid,
			text,
			uid
		};
	}

	function getBubbleTimestamp(node) {
		return Number(node?.getAttribute("data-timestamp") || 0);
	}

	function seedSeenMessages() {
		const nodes = getMessageNodes();

		for (const node of nodes) {
			const msg = extractMessage(node);
			if (msg && msg.uid) {
				seenMessageKeys.add(msg.uid);
			}
		}

		const lastNode = nodes[nodes.length - 1] || null;
		lastSeenTelegramTimestamp = getBubbleTimestamp(lastNode);
		initialized = true;

		console.log("Telegram seeded messages:", seenMessageKeys.size, "last timestamp:", lastSeenTelegramTimestamp);
	}

	async function openExistingOrCreateChannel() {
		let existing = findExistingChannel(CHANNEL_NAME);

		if (existing) {
			console.log("Telegram channel already exists, opening...");
			click(existing);
			await sleep(1200);
			return "existing";
		}

		let menuBtn = document.querySelector("#new-menu");

		for (let i = 0; i < 10 && !menuBtn; i++) {
			await sleep(500);
			menuBtn = document.querySelector("#new-menu");
		}

		if (!menuBtn) {
			console.error("Telegram menu button not found");
			return "";
		}

		click(menuBtn);
		await sleep(500);

		const items = Array.from(document.querySelectorAll(".btn-menu-item"));
		const newChannelBtn = items.find(el =>
			(el.textContent || "").toLowerCase().includes("new channel")
		);

		if (!newChannelBtn) {
			console.error("Telegram New Channel button not found");
			return "";
		}

		click(newChannelBtn);
		await sleep(1000);

		let input = null;

		for (let i = 0; i < 12; i++) {
			const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));

			input = editables.find(el => {
				const cls = el.className || "";
				return cls.includes("input-field-input");
			}) || null;

			if (input) break;
			await sleep(300);
		}

		if (!input) {
			console.error("Telegram channel name input not found");
			return "";
		}

		setEditable(input, CHANNEL_NAME);
		await sleep(800);

		let createBtn = null;

		for (let i = 0; i < 12; i++) {
			const buttons = Array.from(document.querySelectorAll("button.btn-circle.btn-corner"));

			createBtn = buttons.find(el => {
				const icon = el.querySelector(".button-icon");
				const iconText = normalizeText(icon?.textContent || "");
				const classes = el.className || "";
				return classes.includes("is-visible") && iconText === "";
			}) || null;

			if (createBtn) break;
			await sleep(300);
		}

		if (!createBtn) {
			console.error("Telegram create channel button not found");
			return "";
		}

		click(createBtn);
		console.log("Telegram channel creation triggered");
		return "created";
	}

	async function waitForChannelOpen() {
		for (let i = 0; i < 20; i++) {
			const title = normalizeText(getCurrentChatTitle() || "").toLowerCase();
			if (title === CHANNEL_NAME.toLowerCase()) {
				return true;
			}
			await sleep(500);
		}
		return false;
	}

	function watchForNewMessages() {
		const container =
			document.querySelector(".bubbles") ||
			document.querySelector(".chat-container") ||
			document.querySelector(".messages-container") ||
			document.body;

		if (!container) {
			console.error("Telegram message container not found");
			return;
		}

		const observer = new MutationObserver((mutations) => {
			try {
				const currentTitle = normalizeText(getCurrentChatTitle() || "").toLowerCase();
				if (currentTitle !== CHANNEL_NAME.toLowerCase()) return;
				if (!initialized) return;

				for (const mutation of mutations) {
					for (const node of mutation.addedNodes) {
						const bubble =
							node.matches?.(".bubble[data-mid]") ? node :
								node.querySelector?.(".bubble[data-mid]");

						if (!bubble) continue;

						const msg = extractMessage(bubble);
						if (!msg || !msg.uid) continue;

						const bubbleTimestamp = getBubbleTimestamp(bubble);

						if (seenMessageKeys.has(msg.uid)) continue;

						if (lastSeenTelegramTimestamp && bubbleTimestamp && bubbleTimestamp < lastSeenTelegramTimestamp) {
							seenMessageKeys.add(msg.uid);
							continue;
						}

						seenMessageKeys.add(msg.uid);

						if (bubbleTimestamp > lastSeenTelegramTimestamp) {
							lastSeenTelegramTimestamp = bubbleTimestamp;
						}

						if (normalizeText(msg.text).toLowerCase().startsWith("neome:")) {
							continue;
						}

						console.log("Telegram new message detected:", msg);
						sendTelegramEvent(msg);
					}
				}
			} catch (err) {
				if (shouldIgnoreScriptError(err)) return;
				console.error("Telegram observer error:", err);
			}
		});

		observer.observe(container, {
			childList: true,
			subtree: true
		});

		console.log("Telegram MutationObserver started");
	}

	(async () => {
		console.log("START TELEGRAM SIMPLE WATCH");

		const channelMode = await openExistingOrCreateChannel();
		if (!channelMode) return;

		await sleep(2500);

		const opened = await waitForChannelOpen();
		if (!opened) {
			console.error("Telegram channel did not open");
			return;
		}

		seedSeenMessages();
		watchForNewMessages();
	})();
}

function shouldIgnoreScriptError(err) {
	const msg = String(err?.message || err || "");
	return (
		msg.includes("Frame with ID 0 was removed") ||
		msg.includes("No tab with id") ||
		msg.includes("The tab was closed") ||
		msg.includes("Cannot access contents of the page")
	);
}


setTimeout(() => {
	console.log("Telegram auto-start");

	ensureTelegramWatcherRunning().catch((err) => {
		console.error("Telegram auto-start failed:", err);
	});
}, 1000);