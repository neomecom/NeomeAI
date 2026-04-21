// tiktok.js
// TikTok platform logic only
// Single-video upload + caption + post

export async function handleCommand(data) {
	const action = String(data.action || data.cmd || "").trim().toLowerCase();
	if (action !== "post") return;

	const text = String(data.text || "").trim();

	const mediaItem = getSingleTikTokMedia(data);
	if (!mediaItem || !mediaItem.data) {
		console.error("TikTok needs one video");
		return;
	}

	await createAndPostTikTokWindow(
		text,
		mediaItem.data,
		mediaItem.type || "video/mp4"
	);
}

function getSingleTikTokMedia(data) {
	const mediaArray = Array.isArray(data.media) ? data.media : [];

	for (const item of mediaArray) {
		if (!item) continue;

		if (typeof item === "string") {
			return {
				data: item,
				type: String(data.mediaType || "video/mp4")
			};
		}

		if (typeof item === "object") {
			const itemData = String(item.data || item.base64 || item.mediaBase64 || "");
			const itemType = String(item.type || item.mediaType || data.mediaType || "video/mp4");

			if (itemData) {
				return {
					data: itemData,
					type: itemType
				};
			}
		}
	}

	if (data.mediaBase64) {
		return {
			data: String(data.mediaBase64),
			type: String(data.mediaType || "video/mp4")
		};
	}

	return null;
}

async function createAndPostTikTokWindow(text, mediaBase64, mediaType) {
	try {
		const win = await chrome.windows.create({
			url: "https://www.tiktok.com/upload",
			type: "popup",
			width: 1280,
			height: 900,
			focused: true
		});

		setTimeout(() => {
			if (!win?.tabs?.[0]?.id) return;

			chrome.scripting.executeScript({
				target: { tabId: win.tabs[0].id },
				func: performTikTokPostAndClose,
				args: [text, mediaBase64, mediaType, win.id]
			}).then(async (results) => {
				const ok = !!(results && results[0] && results[0].result);

				if (ok && win?.id) {
					await chrome.windows.remove(win.id).catch(() => { });
					console.log("TikTok window closed");
				}
			}).catch((err) => {
				if (shouldIgnoreScriptError(err)) return;
				console.error("TikTok executeScript failed:", err);
			});
		}, 6000);

		setTimeout(() => {
			if (win?.id) {
				chrome.windows.remove(win.id).catch(() => { });
			}
		}, 240000);

	} catch (err) {
		if (shouldIgnoreScriptError(err)) return;
		console.error("TikTok window failed:", err);
	}
}

async function performTikTokPostAndClose(text, mediaBase64, mediaType, windowId) {
	const sleep = ms => new Promise(r => setTimeout(r, ms));

	function isVisible(el) {
		if (!el) return false;
		const r = el.getBoundingClientRect();
		const s = getComputedStyle(el);
		return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
	}

	function textOf(el) {
		return String(
			(el?.textContent || "") + " " +
			(el?.getAttribute?.("aria-label") || "") + " " +
			(el?.getAttribute?.("placeholder") || "")
		).replace(/\s+/g, " ").trim().toLowerCase();
	}

	function dataUrlToFile(dataUrl, mimeType) {
		const arr = String(dataUrl || "").split(",");
		const mime = mimeType || (arr[0].match(/:(.*?);/) || [])[1] || "video/mp4";
		const bstr = atob(arr[1] || "");
		const u8 = new Uint8Array(bstr.length);

		for (let i = 0; i < bstr.length; i++) {
			u8[i] = bstr.charCodeAt(i);
		}

		let ext = "mp4";
		if (mime.includes("webm")) ext = "webm";
		else if (mime.includes("quicktime")) ext = "mov";

		return new File([u8], "upload." + ext, { type: mime });
	}

	function buildDataTransfer(file) {
		const dt = new DataTransfer();
		dt.items.add(file);
		return dt;
	}

	function getAllRoots() {
		const roots = [document];
		const walker = document.createTreeWalker(document.documentElement || document.body, NodeFilter.SHOW_ELEMENT);
		let node;
		while ((node = walker.nextNode())) {
			if (node.shadowRoot) roots.push(node.shadowRoot);
		}
		return roots;
	}

	function deepQueryAll(selector) {
		const out = [];
		for (const root of getAllRoots()) {
			try {
				out.push(...root.querySelectorAll(selector));
			} catch (_) { }
		}
		return out;
	}

	function findBestFileInput() {
		const inputs = deepQueryAll('input[type="file"]');

		let best = null;
		let bestScore = -1;

		for (const input of inputs) {
			const accept = String(input.accept || "").toLowerCase();
			let score = 0;

			if (accept.includes("video")) score += 5;
			if (!accept) score += 1;

			const parent = input.closest("div, label, form") || input.parentElement;
			const parentText = textOf(parent);

			if (parentText.includes("select video")) score += 6;
			if (parentText.includes("upload")) score += 4;
			if (parentText.includes("drag")) score += 3;

			const rect = (parent || input).getBoundingClientRect();
			if (rect.width > 100 && rect.height > 60) score += 2;

			if (score > bestScore) {
				bestScore = score;
				best = input;
			}
		}

		return best;
	}

	function findDropZone() {
		const nodes = deepQueryAll("div, label, button");
		let best = null;
		let bestScore = -1;

		for (const el of nodes) {
			if (!isVisible(el)) continue;

			const rect = el.getBoundingClientRect();
			if (rect.width < 180 || rect.height < 120) continue;

			const txt = textOf(el);
			let score = 0;

			if (txt.includes("select video")) score += 8;
			if (txt.includes("drag and drop")) score += 7;
			if (txt.includes("drag")) score += 4;
			if (txt.includes("upload")) score += 4;
			if (txt.includes("video")) score += 2;
			if (el.querySelector?.('input[type="file"]')) score += 5;

			if (score > bestScore) {
				bestScore = score;
				best = el;
			}
		}

		return best || document.body;
	}

	function setFilesOnInput(input, dt) {
		try {
			input.focus();
		} catch (_) { }

		try {
			input.files = dt.files;
		} catch (e) {
			if (shouldIgnoreScriptError(e)) return false;
			console.error("assigning files failed:", e);
			return false;
		}

		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(new Event("change", { bubbles: true }));

		return !!(input.files && input.files.length);
	}

	async function simulateDrop(target, dt) {
		target.dispatchEvent(new DragEvent("dragenter", {
			bubbles: true,
			cancelable: true,
			dataTransfer: dt
		}));

		await sleep(80);

		target.dispatchEvent(new DragEvent("dragover", {
			bubbles: true,
			cancelable: true,
			dataTransfer: dt
		}));

		await sleep(80);

		target.dispatchEvent(new DragEvent("drop", {
			bubbles: true,
			cancelable: true,
			dataTransfer: dt
		}));
	}

	function uploadLooksAccepted() {
		const selectors = [
			"video",
			"canvas",
			'[class*="progress"]',
			'[class*="Progress"]',
			'[data-e2e*="upload"]',
			'[class*="upload"]',
			'[class*="Upload"]'
		];

		for (const sel of selectors) {
			const els = deepQueryAll(sel);
			for (const el of els) {
				if (isVisible(el)) return true;
			}
		}

		const bodyText = textOf(document.body);
		if (
			bodyText.includes("uploading") ||
			bodyText.includes("uploaded") ||
			bodyText.includes("processing") ||
			bodyText.includes("caption") ||
			bodyText.includes("description")
		) {
			return true;
		}

		return false;
	}

	function findCaption() {
		const els = deepQueryAll('div[contenteditable="true"], textarea, [role="textbox"]');

		for (const el of els) {
			if (!isVisible(el)) continue;

			const rect = el.getBoundingClientRect();
			if (rect.width < 60 || rect.height < 20) continue;

			const txt = textOf(el);

			if (
				txt.includes("caption") ||
				txt.includes("describe") ||
				txt.includes("description") ||
				el.getAttribute("contenteditable") === "true" ||
				el.tagName === "TEXTAREA"
			) {
				return el;
			}
		}

		return null;
	}

	function setCaption(el, value) {
		if (!el) return false;

		el.click();
		el.focus();

		if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
			el.value = value;
			el.dispatchEvent(new Event("input", { bubbles: true }));
			el.dispatchEvent(new Event("change", { bubbles: true }));
			return true;
		}

		try {
			document.execCommand("selectAll", false, null);
			document.execCommand("insertText", false, value);
		} catch (_) { }

		el.innerText = value;
		el.textContent = value;

		el.dispatchEvent(new InputEvent("input", {
			bubbles: true,
			inputType: "insertText",
			data: value
		}));

		el.dispatchEvent(new Event("change", { bubbles: true }));
		el.dispatchEvent(new KeyboardEvent("keyup", {
			bubbles: true,
			key: " "
		}));

		return true;
	}

	function findPostBtn() {
		const btns = deepQueryAll('button, div[role="button"]');

		for (const b of btns) {
			if (!isVisible(b)) continue;

			const rect = b.getBoundingClientRect();
			if (rect.width < 40 || rect.height < 20) continue;

			const t = textOf(b);
			const disabled = b.disabled || b.getAttribute("aria-disabled") === "true";

			if ((t === "post" || t === "publish") && !disabled) {
				return b;
			}
		}

		for (const b of btns) {
			if (!isVisible(b)) continue;

			const t = textOf(b);
			if (t === "post" || t === "publish") {
				return b;
			}
		}

		return null;
	}

	function findPostNowBtn() {
		const buttons = deepQueryAll('button, div[role="button"]');

		for (const b of buttons) {
			if (!isVisible(b)) continue;
			const txt = textOf(b);
			if (txt === "post now" || txt.includes("post now")) {
				return b;
			}
		}

		return null;
	}

	try {
		window.focus();
		await sleep(5000);

		const file = dataUrlToFile(mediaBase64, mediaType);
		const dt = buildDataTransfer(file);

		let accepted = false;

		for (let attempt = 1; attempt <= 8; attempt++) {
			console.log("TikTok upload attempt", attempt);

			const input = findBestFileInput();
			const zone = findDropZone();

			if (input) {
				const ok = setFilesOnInput(input, dt);
				console.log("fileInput.files length =", input.files ? input.files.length : 0, "setOk =", ok);
			}

			await sleep(300);

			if (zone) {
				try {
					zone.scrollIntoView({ behavior: "smooth", block: "center" });
				} catch (_) { }

				try {
					await simulateDrop(zone, dt);
					console.log("drag-drop triggered");
				} catch (e) {
					if (shouldIgnoreScriptError(e)) return false;
					console.warn("drag-drop failed:", e);
				}
			}

			for (let i = 0; i < 20; i++) {
				if (uploadLooksAccepted()) {
					accepted = true;
					console.log("upload accepted");
					break;
				}
				await sleep(500);
			}

			if (accepted) break;
		}

		if (!accepted) {
			console.error("TikTok upload not detected");
			return false;
		}

		await sleep(6000);

		if (text) {
			let caption = null;

			for (let i = 0; i < 60; i++) {
				caption = findCaption();
				if (caption) break;
				await sleep(500);
			}

			if (caption) {
				setCaption(caption, text);
				console.log("caption set");
			} else {
				console.warn("caption not found");
			}
		}

		let postBtn = null;

		for (let i = 0; i < 180; i++) {
			postBtn = findPostBtn();
			if (postBtn && !postBtn.disabled && postBtn.getAttribute("aria-disabled") !== "true") {
				break;
			}
			await sleep(1000);
		}

		if (!postBtn || postBtn.disabled || postBtn.getAttribute("aria-disabled") === "true") {
			console.error("post button not ready");
			return false;
		}

		postBtn.click();
		console.log("waiting for possible copyright popup...");

		let confirmBtn = null;

		for (let i = 0; i < 30; i++) {
			confirmBtn = findPostNowBtn();
			if (confirmBtn) break;
			await sleep(1000);
		}

		if (confirmBtn) {
			console.log("clicking Post now");
			confirmBtn.click();
		} else {
			console.log("no popup appeared");
		}

		console.log("posted");
		return true;

	} catch (e) {
		if (shouldIgnoreScriptError(e)) return false;
		console.error("TikTok error:", e);
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