// gmail.js
// Gmail platform logic only
// Reuse existing Gmail tab if possible, otherwise open one.
// Keep tab open and listen for new incoming emails.
// Open a popup compose window for sending email.

let gmailWatcherTabId = null;
let gmailWatcherStarting = false;

export async function handleCommand(data) {
	const action = String(data.action || data.cmd || "").trim().toLowerCase();

	if (action === "post") {
		await openComposeWindowAndSendEmail(
			String(data.to || "").trim(),
			String(data.title || "").trim(),
			String(data.text || "").trim(),
			Array.isArray(data.media) ? data.media : [],
			String(data.mediaBase64 || "").trim(),
			String(data.mediaType || "").trim()
		);
		return;
	}

	console.warn("Gmail module ignoring unsupported action:", action);
}

async function ensureGmailWatcherRunning() {
	if (gmailWatcherStarting) return;
	gmailWatcherStarting = true;

	try {
		let tab = null;

		if (gmailWatcherTabId) {
			try {
				tab = await chrome.tabs.get(gmailWatcherTabId);

				if (!tab || !String(tab.url || "").startsWith("https://mail.google.com/")) {
					tab = null;
					gmailWatcherTabId = null;
				}
			} catch (_) {
				tab = null;
				gmailWatcherTabId = null;
			}
		}

		if (!tab) {
			const tabs = await chrome.tabs.query({
				url: ["https://mail.google.com/*"]
			});

			if (tabs && tabs.length) {
				tab = tabs[0];
				gmailWatcherTabId = tab.id;
				console.log("✅ Reusing existing Gmail tab:", gmailWatcherTabId);
			}
		}

		if (!tab) {
			tab = await chrome.tabs.create({
				url: "https://mail.google.com/mail/u/0/#inbox",
				active: false
			});
			gmailWatcherTabId = tab.id;
			console.log("✅ Gmail tab created:", gmailWatcherTabId);
		}

		if (tab.url && !String(tab.url).includes("mail.google.com")) {
			await chrome.tabs.update(tab.id, {
				url: "https://mail.google.com/mail/u/0/#inbox"
			});
		}

		await waitForTabReady(tab.id);
		await injectGmailWatcher(tab.id);

	} catch (err) {
		if (shouldIgnoreScriptError(err)) return;
		console.error("Failed to ensure Gmail watcher:", err);
	} finally {
		gmailWatcherStarting = false;
	}
}

async function openComposeWindowAndSendEmail(to, subject, body, media, mediaBase64, mediaType) {
	try {
		const win = await chrome.windows.create({
			url: "https://mail.google.com/mail/u/0/#inbox?compose=new",
			type: "popup",
			width: 1280,
			height: 900,
			focused: true
		});

		setTimeout(() => {
			if (win && win.tabs && win.tabs[0] && win.tabs[0].id) {
				chrome.scripting.executeScript({
					target: { tabId: win.tabs[0].id },
					func: performGmailSendFromPage,
					args: [to, subject, body, media, mediaBase64, mediaType, win.id]
				}).catch((err) => {
					if (shouldIgnoreScriptError(err)) return;
					console.error("Gmail send executeScript failed:", err);
				});
			}
		}, 5000);

		setTimeout(() => {
			if (win && win.id) {
				chrome.windows.remove(win.id).catch(() => { });
			}
		}, 90000);

	} catch (err) {
		if (shouldIgnoreScriptError(err)) return;
		console.error("Failed to open Gmail compose window:", err);
	}
}

function waitForTabReady(tabId) {
	return new Promise((resolve) => {
		let done = false;

		function finish() {
			if (done) return;
			done = true;
			chrome.tabs.onUpdated.removeListener(listener);
			resolve();
		}

		function listener(updatedTabId, info) {
			if (updatedTabId !== tabId) return;
			if (info.status === "complete") {
				setTimeout(finish, 1500);
			}
		}

		chrome.tabs.onUpdated.addListener(listener);

		chrome.tabs.get(tabId).then((tab) => {
			if (tab && tab.status === "complete") {
				setTimeout(finish, 1500);
			}
		}).catch(() => {
			setTimeout(finish, 4000);
		});

		setTimeout(finish, 15000);
	});
}

async function injectGmailWatcher(tabId) {
	try {
		await chrome.scripting.executeScript({
			target: { tabId },
			func: startGmailWatcherInPage
		});

		console.log("Gmail watcher injected into tab:", tabId);
	} catch (err) {
		if (shouldIgnoreScriptError(err)) return;
		console.error("Gmail watcher injection failed:", err);
	}
}

function startGmailWatcherInPage() {
	if (window.__neomeGmailWatcherRunning) {
		console.log("Gmail watcher already running");
		return;
	}

	window.__neomeGmailWatcherRunning = true;
	console.log("Gmail watcher started");

	function sleep(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	function isVisible(el) {
		if (!el) return false;

		const style = window.getComputedStyle(el);
		const rect = el.getBoundingClientRect();

		return (
			style.display !== "none" &&
			style.visibility !== "hidden" &&
			rect.width > 0 &&
			rect.height > 0
		);
	}

	function getInboxRows() {
		return Array.from(document.querySelectorAll('tr[role="row"]')).filter(row => {
			if (!isVisible(row)) return false;
			if (row.querySelector("th")) return false;

			const subjectEl =
				row.querySelector("span.bog") ||
				row.querySelector("span[data-thread-id]");

			const fromEl =
				row.querySelector("span[email]") ||
				row.querySelector(".yP") ||
				row.querySelector(".zF");

			return !!(subjectEl || fromEl);
		});
	}

	function extractEmail(row) {
		if (!row) return null;

		const fromEl =
			row.querySelector("span[email]") ||
			row.querySelector(".yP") ||
			row.querySelector(".zF");

		const subjectEl =
			row.querySelector("span.bog") ||
			row.querySelector("span[data-thread-id]");

		const snippetEl =
			row.querySelector(".y2");

		const threadIdEl =
			row.querySelector("[data-thread-id]") ||
			row.querySelector("[data-legacy-thread-id]");

		let rawThreadId =
			String(row.getAttribute("data-legacy-thread-id") || "").trim() ||
			String(threadIdEl?.getAttribute("data-thread-id") || "").trim() ||
			String(threadIdEl?.getAttribute("data-legacy-thread-id") || "").trim();

		let threadId = "";

		if (rawThreadId) {
			const match = rawThreadId.match(/(\d+)/);
			if (match) {
				threadId = "#" + match[1];
			}
		}

		let from = "";
		let subject = "";
		let snippet = "";

		if (fromEl) {
			const name = String(fromEl.getAttribute("name") || "").trim();
			const email = String(fromEl.getAttribute("email") || "").trim();
			const text = String(fromEl.textContent || "").trim();

			from = name && email
				? `${name} <${email}>`
				: (name || email || text || "");
		}

		if (subjectEl) {
			subject = String(subjectEl.textContent || "").trim();
		}

		if (snippetEl) {
			snippet = String(snippetEl.textContent || "")
				.replace(/^\s*-\s*/, "")
				.replace(/^\s*\d{1,2}:\d{2}\s*(AM|PM)\s*/i, "")
				.replace(/^\s*\d{1,2}:\d{2}\s*/, "")
				.replace(/\s+/g, " ")
				.trim();
		}

		return {
			threadId: threadId || "",
			from: from || "",
			subject: subject || "",
			snippet: snippet || ""
		};
	}

	function getEmailKey(email) {
		const threadId = String(email?.threadId || "").trim();
		if (threadId) return threadId;

		return [
			String(email?.from || "").trim(),
			String(email?.subject || "").trim()
		].join(" | ");
	}

	function sendEmailEvent(email) {
		try {
			chrome.runtime.sendMessage({
				action: "forwardWs",
				payload: {
					type: "event",
					platform: "gmail",
					event: "new_email",
					email: {
						threadId: String(email?.threadId || ""),
						from: String(email?.from || ""),
						subject: String(email?.subject || ""),
						snippet: String(email?.snippet || "")
					}
				}
			});
		} catch (err) {
			if (shouldIgnoreScriptError(err)) return;
			console.error("Failed to send forwardWs:", err);
		}
	}

	async function ensureInboxView() {
		for (let i = 0; i < 10; i++) {
			const rows = getInboxRows();
			if (rows.length) return true;

			const inboxLink =
				Array.from(document.querySelectorAll('a[title], a[aria-label], div[role="link"]'))
					.find(el => {
						const txt = (
							(el.getAttribute("title") || "") + " " +
							(el.getAttribute("aria-label") || "") + " " +
							(el.textContent || "")
						).toLowerCase();
						return txt.includes("inbox");
					});

			if (inboxLink) {
				inboxLink.click();
			} else if (!location.href.includes("#inbox")) {
				location.hash = "#inbox";
			}

			await sleep(1500);
		}

		return false;
	}

	async function waitForFirstEmail() {
		for (let i = 0; i < 30; i++) {
			const rows = getInboxRows();
			if (rows.length) {
				const email = extractEmail(rows[0]);
				if (email && (email.from || email.subject || email.snippet)) {
					return email;
				}
			}
			await sleep(1000);
		}
		return null;
	}

	const seenEmailKeys = new Set();
	let initialized = false;

	setInterval(() => {
		try {
			const rows = getInboxRows();
			if (!rows.length) return;

			const email = extractEmail(rows[0]);
			if (!email) return;

			const key = getEmailKey(email);
			if (!key) return;

			// FIRST VALID READ → just initialize, do not send
			if (!initialized) {
				seenEmailKeys.add(key);
				initialized = true;
				console.log("Gmail initialized, no send");
				return;
			}

			// NORMAL FLOW
			if (!seenEmailKeys.has(key)) {
				seenEmailKeys.add(key);
				console.log("New Gmail email detected:", email);
				sendEmailEvent(email);
			}
		} catch (err) {
			if (shouldIgnoreScriptError(err)) return;
			console.error("Gmail watcher loop error:", err);
		}
	}, 2000);
}

async function performGmailSendFromPage(to, subject, body, media, mediaBase64, mediaType, windowId) {
	function sleep(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	function isVisible(el) {
		if (!el) return false;
		const style = window.getComputedStyle(el);
		const rect = el.getBoundingClientRect();
		return (
			style.display !== "none" &&
			style.visibility !== "hidden" &&
			rect.width > 0 &&
			rect.height > 0
		);
	}

	function setNativeValue(el, value) {
		el.focus();
		el.click();

		const proto = Object.getPrototypeOf(el);
		const descriptor = Object.getOwnPropertyDescriptor(proto, "value");

		if (descriptor && descriptor.set) {
			descriptor.set.call(el, value);
		} else {
			el.value = value;
		}

		el.dispatchEvent(new Event("input", { bubbles: true }));
		el.dispatchEvent(new Event("change", { bubbles: true }));
	}

	function findComposeButton() {
		const selectors = [
			'div[gh="cm"]',
			'button[gh="cm"]',
			'[role="button"][gh="cm"]'
		];

		for (const selector of selectors) {
			const el = document.querySelector(selector);
			if (isVisible(el)) return el;
		}

		return Array.from(document.querySelectorAll('div[role="button"], button')).find(el => {
			const text = String(el.textContent || "").trim().toLowerCase();
			return isVisible(el) && text === "compose";
		}) || null;
	}

	function findToInput() {
		const selectors = [
			'input[peoplekit-id][type="text"]',
			'input[aria-label*="Recipients" i]',
			'input[aria-label*="To" i]',
			'input[name="to"]',
			'textarea[name="to"]'
		];

		for (const selector of selectors) {
			const els = Array.from(document.querySelectorAll(selector));
			const found = els.find(isVisible);
			if (found) return found;
		}

		return null;
	}

	function findSubjectInput() {
		const selectors = [
			'input[name="subjectbox"]',
			'input[placeholder*="Subject" i]'
		];

		for (const selector of selectors) {
			const els = Array.from(document.querySelectorAll(selector));
			const found = els.find(isVisible);
			if (found) return found;
		}

		return null;
	}

	function findBodyBox() {
		const selectors = [
			'div[aria-label="Message Body"]',
			'div[role="textbox"][aria-label*="Message Body" i]',
			'div[contenteditable="true"][g_editable="true"]'
		];

		for (const selector of selectors) {
			const els = Array.from(document.querySelectorAll(selector));
			const found = els.find(isVisible);
			if (found) return found;
		}

		return null;
	}

	function findSendButton() {
		const selectors = [
			'div[role="button"][data-tooltip^="Send" i]',
			'div[role="button"][aria-label^="Send" i]',
			'button[aria-label^="Send" i]'
		];

		for (const selector of selectors) {
			const els = Array.from(document.querySelectorAll(selector));
			const found = els.find(isVisible);
			if (found) return found;
		}

		return Array.from(document.querySelectorAll('div[role="button"], button')).find(el => {
			const text = String(el.textContent || "").trim().toLowerCase();
			return isVisible(el) && text === "send";
		}) || null;
	}

	function findAttachInput() {
		const selectors = [
			'input[type="file"][name]',
			'input[type="file"]'
		];

		for (const selector of selectors) {
			const els = Array.from(document.querySelectorAll(selector));
			const found = els.find(el => el && (isVisible(el) || el.type === "file"));
			if (found) return found;
		}

		return null;
	}

	function setBody(box, text) {
		box.click();
		box.focus();

		try {
			document.execCommand("selectAll", false, null);
		} catch (_) { }

		box.innerHTML = "";
		box.textContent = text;

		box.dispatchEvent(new InputEvent("input", {
			bubbles: true,
			inputType: "insertText",
			data: text
		}));

		box.dispatchEvent(new Event("change", { bubbles: true }));
		box.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: " " }));
	}

	function normalizeMediaItems(input, fallbackData, fallbackType) {
		if (Array.isArray(input) && input.length) {
			return input.map(item => {
				if (!item) return null;

				if (typeof item === "string") {
					return {
						data: item,
						type: fallbackType || ""
					};
				}

				if (typeof item === "object") {
					return {
						data: String(item.data || item.base64 || item.mediaBase64 || ""),
						type: String(item.type || item.mediaType || fallbackType || "")
					};
				}

				return null;
			}).filter(item => item && item.data);
		}

		if (fallbackData) {
			return [{
				data: String(fallbackData),
				type: String(fallbackType || "")
			}];
		}

		return [];
	}

	function dataUrlToFile(dataUrl, fallbackMimeType, index) {
		const arr = String(dataUrl || "").split(",");
		const header = arr[0] || "";
		const bodyPart = arr[1] || "";
		const mime = (header.match(/data:(.*?);base64/i) || [])[1] || fallbackMimeType || "application/octet-stream";

		const binary = atob(bodyPart);
		const bytes = new Uint8Array(binary.length);

		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}

		let ext = "bin";
		if (/png/i.test(mime)) ext = "png";
		else if (/jpe?g/i.test(mime)) ext = "jpg";
		else if (/gif/i.test(mime)) ext = "gif";
		else if (/webp/i.test(mime)) ext = "webp";
		else if (/mp4/i.test(mime)) ext = "mp4";
		else if (/quicktime/i.test(mime)) ext = "mov";
		else if (/webm/i.test(mime)) ext = "webm";

		return new File([bytes], "attachment_" + String(index || 1) + "." + ext, { type: mime });
	}

	async function attachFiles(files) {
		for (let i = 0; i < 40; i++) {
			const input = findAttachInput();
			if (input) {
				try {
					const dt = new DataTransfer();

					for (const file of files) {
						dt.items.add(file);
					}

					input.files = dt.files;
					input.dispatchEvent(new Event("input", { bubbles: true }));
					input.dispatchEvent(new Event("change", { bubbles: true }));
					console.log("Gmail attachments injected:", files.length);
					return true;
				} catch (err) {
					if (shouldIgnoreScriptError(err)) return;
					console.error("Gmail attachment injection failed:", err);
				}
			}

			await sleep(500);
		}

		return false;
	}

	async function waitAttachmentsReady(timeoutSeconds = 60) {
		for (let i = 0; i < timeoutSeconds; i++) {
			const bodyText = String(document.body.textContent || "").toLowerCase();

			if (
				bodyText.includes("uploading") ||
				bodyText.includes("attaching")
			) {
				await sleep(1000);
				continue;
			}

			const sendBtn = findSendButton();
			if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute("aria-disabled") !== "true") {
				return true;
			}

			await sleep(1000);
		}

		return false;
	}

	function sendResult(status, message) {
		try {
			chrome.runtime.sendMessage({
				action: "forwardWs",
				payload: {
					type: "result",
					platform: "gmail",
					action: "post",
					status: status,
					message: message || "",
					to: String(to || ""),
					title: String(subject || "")
				}
			});
		} catch (err) {
			if (shouldIgnoreScriptError(err)) return;
			console.error("Failed to send forwardWs:", err);
		}
	}

	try {
		window.focus();

		for (let i = 0; i < 10; i++) {
			if (findToInput() && findSubjectInput() && findBodyBox()) break;

			const composeBtn = findComposeButton();
			if (composeBtn) {
				composeBtn.click();
			}

			await sleep(1000);
		}

		let toInput = null;
		let subjectInput = null;
		let bodyBox = null;

		for (let i = 0; i < 20; i++) {
			toInput = findToInput();
			subjectInput = findSubjectInput();
			bodyBox = findBodyBox();

			if (toInput && subjectInput && bodyBox) break;
			await sleep(1000);
		}

		if (!toInput || !subjectInput || !bodyBox) {
			console.error("Gmail compose fields not found");
			sendResult("error", "compose fields not found");
			return;
		}

		if (!to) {
			console.error("Gmail recipient missing");
			sendResult("error", "recipient missing");
			return;
		}

		setNativeValue(toInput, to);
		await sleep(700);

		try {
			toInput.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
			toInput.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }));
		} catch (_) { }

		await sleep(700);

		setNativeValue(subjectInput, subject);
		await sleep(500);

		setBody(bodyBox, body);
		await sleep(1000);

		const mediaItems = normalizeMediaItems(media, mediaBase64, mediaType);
		if (mediaItems.length) {
			const files = mediaItems.map((item, index) =>
				dataUrlToFile(item.data, item.type || mediaType || "", index + 1)
			);

			const attached = await attachFiles(files);
			if (!attached) {
				console.error("Gmail attachment input not found");
				sendResult("error", "attachment input not found");
				return;
			}

			const ready = await waitAttachmentsReady(90);
			if (!ready) {
				console.error("Gmail attachments not ready");
				sendResult("error", "attachments not ready");
				return;
			}

			await sleep(1000);
		}

		let sendBtn = null;

		for (let i = 0; i < 15; i++) {
			sendBtn = findSendButton();
			if (sendBtn && !sendBtn.disabled && sendBtn.getAttribute("aria-disabled") !== "true") {
				break;
			}
			await sleep(500);
		}

		if (!sendBtn) {
			console.error("Gmail send button not found");
			sendResult("error", "send button not found");
			return;
		}

		sendBtn.click();
		console.log("Gmail send button clicked");
		sendResult("sent", "email sent");

	} catch (err) {
		
		sendResult("error", "gmail send error");
		if (shouldIgnoreScriptError(err)) return;
		console.error("Gmail send error:", err);
	}

	setTimeout(() => {

		if (typeof chrome !== "undefined" && chrome.windows && windowId) {
			chrome.windows.remove(windowId).catch(() => { });
		}
	}, 5000);
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

	ensureGmailWatcherRunning().catch((err) => {
		console.error("Gmail auto-start failed:", err);
	});
}, 1000);