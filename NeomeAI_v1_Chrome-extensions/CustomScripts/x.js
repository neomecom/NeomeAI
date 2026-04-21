// x.js
// X platform logic + mentions watcher

let xWatcherStarting = false;
let xWatcherTabId = null;

async function ensureXMentionsWatcher() {
	if (xWatcherStarting) return;
	xWatcherStarting = true;

	try {
		let tab = null;

		if (xWatcherTabId) {
			try {
				tab = await chrome.tabs.get(xWatcherTabId);

				if (!tab || !String(tab.url || "").startsWith("https://x.com/notifications")) {
					tab = null;
					xWatcherTabId = null;
				}
			} catch (_) {
				tab = null;
				xWatcherTabId = null;
			}
		}

		if (!tab) {
			const tabs = await chrome.tabs.query({
				url: ["https://x.com/notifications*"]
			});

			if (tabs && tabs.length) {
				tab = tabs.find(t => String(t.url || "").includes("/notifications/mentions")) || tabs[0];
				xWatcherTabId = tab.id;
				console.log("X mentions existing tab reused:", xWatcherTabId);
			}
		}

		if (!tab) {
			tab = await chrome.tabs.create({
				url: "https://x.com/notifications/mentions",
				active: false
			});
			xWatcherTabId = tab.id;
			console.log("X mentions tab created:", xWatcherTabId);
		} else if (!String(tab.url || "").includes("/notifications/mentions")) {
			tab = await chrome.tabs.update(tab.id, {
				url: "https://x.com/notifications/mentions"
			});
			xWatcherTabId = tab.id;
			console.log("X mentions tab redirected to mentions:", xWatcherTabId);
		}

		await waitForXMentionsReady(tab.id);

		await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			func: startXMentionsWatcherInPage
		});

		console.log("X mentions watcher injected");

	} catch (err) {
		if (shouldIgnoreScriptError(err)) return;
		console.error("Failed to start X mentions watcher:", err);
	} finally {
		xWatcherStarting = false;
	}
}

async function waitForXMentionsReady(tabId) {
	const start = Date.now();

	while (Date.now() - start < 10000) {
		try {
			const result = await chrome.scripting.executeScript({
				target: { tabId },
				func: () => {
					return !!(
						document.querySelector('article[data-testid="tweet"]') ||
						location.pathname.startsWith("/notifications/mentions")
					);
				}
			});

			if (result && result[0] && result[0].result) {
				console.log("X mentions UI ready");
				return;
			}
		} catch (_) { }

		await new Promise(r => setTimeout(r, 250));
	}

	console.warn("X mentions ready fallback");
}

export async function handleCommand(data) {
	const action = String(data.action || data.cmd || "").trim().toLowerCase();

	if (action !== "post") return;

	await createAndPostInNewWindow(
		data.text || "",
		data.media || data.mediaBase64 || null,
		data.mediaType || null
	);
}

async function createAndPostInNewWindow(text, mediaInput, mediaType) {
	try {
		const win = await chrome.windows.create({
			url: "https://x.com",
			type: "popup",
			width: 600,
			height: 600,
			focused: true
		});

		setTimeout(async () => {
			try {
				if (!win?.tabs?.[0]?.id) return;

				const results = await chrome.scripting.executeScript({
					target: { tabId: win.tabs[0].id },
					func: performXPostAndClose,
					args: [text, mediaInput, mediaType]
				});

				const ok = !!(results && results[0] && results[0].result);

				if (ok && win?.id) {
					await chrome.windows.remove(win.id).catch(() => { });
				}
			} catch (err) {
				const msg = String(err?.message || err || "");
				if (
					msg.includes("Frame with ID 0 was removed") ||
					msg.includes("No tab with id") ||
					msg.includes("The tab was closed") ||
					msg.includes("Cannot access contents of the page")
				) {
					return;
				}
				if (shouldIgnoreScriptError(err)) return;
				console.error("X executeScript failed:", err);
			}
		}, 4200);

		setTimeout(() => {
			if (win?.id) chrome.windows.remove(win.id).catch(() => { });
		}, 180000);

	} catch (err) {
		if (shouldIgnoreScriptError(err)) return;
		console.error("Failed to create X window:", err);
	}
}

function startXMentionsWatcherInPage() {
	if (window.__neomeXMentionsLoaded) return;
	window.__neomeXMentionsLoaded = true;

	console.log("X Mentions watcher loaded");

	const SEEN_KEY = "neome_x_seen_mentions_v1";
	const POLL_MS = 7000;
	const MAX_SEEN = 500;

	let started = false;
	let initialDumpSent = false;

	function loadSeen() {
		try {
			return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"));
		} catch (_) {
			return new Set();
		}
	}

	function saveSeen(set) {
		try {
			const arr = Array.from(set).slice(-MAX_SEEN);
			localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
		} catch (_) { }
	}

	let seen = loadSeen();

	function isMentionsPage() {
		return location.pathname === "/notifications/mentions" || location.pathname.startsWith("/notifications/mentions");
	}

	function extractTweetIdFromHref(href) {
		const m = String(href || "").match(/\/status\/(\d+)/i);
		return m ? m[1] : null;
	}

	function getTweetArticles() {
		return Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
	}

	function getTweetText(article) {
		const txtNode =
			article.querySelector('[data-testid="tweetText"]') ||
			article.querySelector('div[lang]');
		return txtNode ? (txtNode.innerText || txtNode.textContent || "").trim() : "";
	}

	function getTweetLink(article) {
		const links = Array.from(article.querySelectorAll('a[href*="/status/"]'));
		for (const a of links) {
			const href = a.getAttribute("href") || "";
			if (/\/status\/\d+/i.test(href)) {
				return href.startsWith("http") ? href : ("https://x.com" + href);
			}
		}
		return "";
	}

	function getAuthorHandle(article) {
		const links = Array.from(article.querySelectorAll('a[href^="/"]'));
		for (const a of links) {
			const href = a.getAttribute("href") || "";
			if (/^\/[A-Za-z0-9_]{1,15}$/.test(href)) {
				const txt = (a.textContent || "").trim();
				if (txt.startsWith("@")) {
					return txt.slice(1);
				}
			}
		}
		return "";
	}

	function buildMentionFromArticle(article) {
		const link = getTweetLink(article);
		const tweetId = extractTweetIdFromHref(link);
		if (!tweetId) return null;

		return {
			tweetId,
			author: getAuthorHandle(article),
			text: getTweetText(article),
			url: link
		};
	}

	function collectAllMentionsOnPage() {
		const articles = getTweetArticles();
		const out = [];
		const used = new Set();

		for (const article of articles) {
			const mention = buildMentionFromArticle(article);
			if (!mention) continue;
			if (used.has(mention.tweetId)) continue;
			used.add(mention.tweetId);
			out.push(mention);
		}

		return out;
	}

	function collectNewMentions() {
		const all = collectAllMentionsOnPage();
		return all.filter(m => !seen.has(m.tweetId));
	}

	function markSeen(tweetId) {
		seen.add(tweetId);
		if (seen.size > MAX_SEEN) {
			seen = new Set(Array.from(seen).slice(-MAX_SEEN));
		}
		saveSeen(seen);
	}

	function sendToBackground(payload) {
		chrome.runtime.sendMessage({
			action: "forwardWs",
			payload
		}, (response) => {
			if (chrome.runtime.lastError) {
				console.warn("forwardWs send failed:", chrome.runtime.lastError.message);
				return;
			}
			console.log("forwardWs sent", response || "");
		});
	}

	function dumpCurrentMentionsOnce() {
		if (initialDumpSent) return;

		const mentions = collectAllMentionsOnPage();
		console.log("X mentions currently on page:", mentions.length, mentions);

		sendToBackground({
			type: "x_mentions_page_dump",
			count: mentions.length,
			mentions
		});

		initialDumpSent = true;
	}

	function scanOnce() {
		if (!isMentionsPage()) return;

		if (!initialDumpSent) {
			dumpCurrentMentionsOnce();
		}

		const newMentions = collectNewMentions();
		if (!newMentions.length) return;

		console.log("New mentions found:", newMentions.length, newMentions);

		for (const mention of newMentions) {
			markSeen(mention.tweetId);

			sendToBackground({
				type: "x_mention_detected",
				mention
			});
		}
	}

	function startWatcher() {
		if (started) return;
		started = true;

		console.log("🚀 X Mentions watcher started");

		setTimeout(() => {
			scanOnce();
		}, 2500);

		setInterval(scanOnce, POLL_MS);

		const observer = new MutationObserver(() => {
			scanOnce();
		});

		observer.observe(document.body, {
			childList: true,
			subtree: true
		});
	}

	setTimeout(() => {
		if (isMentionsPage()) {
			startWatcher();
		}
	}, 2500);
}

async function performXPostAndClose(text, mediaInput, mediaType) {
	const sleep = ms => new Promise(r => setTimeout(r, ms));

	function findTextbox() {
		return document.querySelector('div[data-testid="tweetTextarea_0"][contenteditable="true"]')
			|| document.querySelector('div[role="textbox"]');
	}

	function findPostButton() {
		return document.querySelector('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]');
	}

	function dataUrlToFile(dataUrl, mimeType, index) {
		const arr = String(dataUrl || "").split(",");
		const mime = String(mimeType || (arr[0].match(/:(.*?);/) || [])[1] || "").toLowerCase();
		const bstr = atob(arr[1] || "");
		const u8 = new Uint8Array(bstr.length);

		for (let i = 0; i < bstr.length; i++) {
			u8[i] = bstr.charCodeAt(i);
		}

		let ext = "bin";
		if (mime.includes("png")) ext = "png";
		else if (mime.includes("jpeg") || mime.includes("jpg")) ext = "jpg";
		else if (mime.includes("webp")) ext = "webp";
		else if (mime.includes("gif")) ext = "gif";
		else if (mime.includes("mp4")) ext = "mp4";
		else if (mime.includes("webm")) ext = "webm";
		else if (mime.includes("quicktime")) ext = "mov";

		return new File([u8], "upload_" + String(index || 1) + "." + ext, { type: mime || "application/octet-stream" });
	}

	function normalizeMediaItems(input, fallbackType) {
		if (!input) return [];

		if (typeof input === "string") {
			return [{
				data: input,
				type: fallbackType || ""
			}];
		}

		if (Array.isArray(input)) {
			return input
				.map(function (item) {
					if (!item) return null;

					if (typeof item === "string") {
						return {
							data: item,
							type: ""
						};
					}

					if (typeof item === "object" && item.data) {
						return {
							data: item.data,
							type: item.type || ""
						};
					}

					return null;
				})
				.filter(Boolean);
		}

		if (typeof input === "object" && input.data) {
			return [{
				data: input.data,
				type: input.type || fallbackType || ""
			}];
		}

		return [];
	}

	async function attachFiles(files) {
		for (let i = 0; i < 40; i++) {
			const input = document.querySelector('input[type="file"]');
			if (input) {
				const dt = new DataTransfer();

				for (const file of files) {
					dt.items.add(file);
				}

				input.files = dt.files;
				input.dispatchEvent(new Event("change", { bubbles: true }));
				return true;
			}

			await sleep(500);
		}

		return false;
	}

	async function waitPostEnabled(timeout = 240) {
		for (let i = 0; i < timeout; i++) {
			const btn = findPostButton();
			if (btn && !btn.disabled) return true;
			await sleep(1000);
		}
		return false;
	}

	async function typeDirect(textbox, value) {
		textbox.focus();
		await sleep(300);

		const finalText = String(value || "");

		try {
			document.execCommand("selectAll", false, null);
			document.execCommand("delete", false, null);
		} catch (_) {
			textbox.textContent = "";
		}

		await sleep(200);

		try {
			const dt = new DataTransfer();
			dt.setData("text/plain", finalText);

			const pasteEvent = new ClipboardEvent("paste", {
				bubbles: true,
				cancelable: true,
				clipboardData: dt
			});

			textbox.dispatchEvent(pasteEvent);

			if (!textbox.innerText.trim() && !textbox.textContent.trim()) {
				throw new Error("paste did not insert");
			}

			return;
		} catch (_) { }

		try {
			document.execCommand("insertText", false, finalText);
		} catch (_) {
			textbox.textContent = finalText;
		}

		await sleep(300);
	}

	try {
		await sleep(1200);

		const composeBtn = document.querySelector('[data-testid="SideNav_NewTweet_Button"], [aria-label="Post"]');
		if (composeBtn) composeBtn.click();

		await sleep(1800);

		const textbox = findTextbox();
		if (!textbox) {
			console.error("textbox not found");
			return false;
		}

		const mediaItems = normalizeMediaItems(mediaInput, mediaType);
		if (mediaItems.length) {
			const files = mediaItems.map(function (item, index) {
				return dataUrlToFile(item.data, item.type || mediaType || "", index + 1);
			});

			const ok = await attachFiles(files);
			if (!ok) {
				console.error("media attach failed");
				return false;
			}

			console.log("media attached", files.length);

			const ready = await waitPostEnabled(240);
			if (!ready) {
				console.error("media not ready");
				return false;
			}

			await sleep(2000);
		}

		if (text) {
			await typeDirect(textbox, text);
			console.log("text typed");
			await sleep(1000);
		}

		const btn = findPostButton();
		if (!btn) {
			console.error("post button missing");
			return false;
		}

		btn.click();
		console.log("posted");

		await sleep(3000);
		return true;

	} catch (e) {
		console.error("X error:", e);
		return false;
	}
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
	console.log("X auto-start");

	ensureXMentionsWatcher().catch((err) => {
		console.error("X auto-start failed:", err);
	});
}, 1000);