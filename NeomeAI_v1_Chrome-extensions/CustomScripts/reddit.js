// reddit.js
// Reddit platform logic
// - text post: open submit URL with title and selftext=true, then click Post
// - link post: open submit URL with title and url, then click Post
// - media post: open submit URL with title, click Images & Video, inject file into active uploader, try drop events too, then click Post

export async function handleCommand(data) {
	const action = String(data.action || data.cmd || "").trim().toLowerCase();
	if (action !== "post") {
		console.warn("Reddit module ignoring unsupported action:", action);
		return;
	}

	const subreddit = String(data.subreddit || "test").trim() || "test";
	const text = String(data.text || data.title || "Auto post").trim().slice(0, 300);
	const linkUrl = String(data.url || "").trim();

	const mediaItems = Array.isArray(data.media) && data.media.length
		? data.media
		: (data.mediaBase64 ? [{
			data: String(data.mediaBase64),
			type: String(data.mediaType || "")
		}] : []);

	if (linkUrl) {
		await openRedditWindow({
			url: buildLinkUrl(subreddit, text, linkUrl),
			mode: "simple"
		});
		return;
	}

	if (mediaItems.length) {
		await openRedditWindow({
			url: buildMediaUrl(subreddit, text),
			mode: "media",
			text,
			media: mediaItems
		});
		return;
	}

	await openRedditWindow({
		url: buildTextUrl(subreddit, text),
		mode: "simple"
	});
}

function buildTextUrl(subreddit, title) {
	return `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/submit?title=${encodeURIComponent(title)}&selftext=true`;
}

function buildLinkUrl(subreddit, title, url) {
	return `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/submit?title=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;
}

function buildMediaUrl(subreddit, title) {
	return `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/submit?title=${encodeURIComponent(title)}`;
}

async function openRedditWindow(opts) {
	try {
		const win = await chrome.windows.create({
			url: opts.url,
			type: "popup",
			width: 1400,
			height: 1200,
			focused: true
		});

		setTimeout(() => {
			if (!win?.tabs?.[0]?.id) return;

			if (opts.mode === "media") {
				chrome.scripting.executeScript({
					target: { tabId: win.tabs[0].id },
					func: performRedditMediaPost,
					args: [opts.text || "", Array.isArray(opts.media) ? opts.media : []]
				}).then(async (results) => {
					const ok = !!(results && results[0] && results[0].result);
					if (ok && win?.id) {
						await chrome.windows.remove(win.id).catch(() => { });
						console.log("✅ Reddit window closed");
					}
				}).catch((err) => {
					if (shouldIgnoreScriptError(err)) return;
					console.error("Reddit media executeScript failed:", err);
				});
				return;
			}

			chrome.scripting.executeScript({
				target: { tabId: win.tabs[0].id },
				func: performRedditSimplePost,
				args: []
			}).then(async (results) => {
				const ok = !!(results && results[0] && results[0].result);
				if (ok && win?.id) {
					await chrome.windows.remove(win.id).catch(() => { });
					console.log("✅ Reddit window closed");
				}
			}).catch((err) => {
				if (shouldIgnoreScriptError(err)) return;
				console.error("Reddit simple executeScript failed:", err);
			});
		}, 4500);

		setTimeout(() => {
			if (win?.id) {
				chrome.windows.remove(win.id).catch(() => { });
			}
		}, opts.mode === "media" ? 120000 : 30000);

	} catch (err) {
		if (shouldIgnoreScriptError(err)) return;
		console.error("Failed to open Reddit window:", err);
	}
}

async function performRedditSimplePost() {
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

	function getRoots() {
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
		for (const root of getRoots()) {
			try {
				out.push(...root.querySelectorAll(selector));
			} catch (_) { }
		}
		return out;
	}

	function isVisible(el) {
		if (!el) return false;
		const rect = el.getBoundingClientRect();
		const style = window.getComputedStyle(el);
		return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
	}

	function findPostButton() {
		const direct = document.getElementById("inner-post-submit-button");
		if (direct && isVisible(direct) && !direct.disabled && direct.getAttribute("aria-disabled") !== "true") {
			return direct;
		}

		const buttons = deepQueryAll("button");
		for (const btn of buttons) {
			if (!isVisible(btn)) continue;
			if (btn.disabled) continue;
			if (btn.getAttribute("aria-disabled") === "true") continue;
			const txt = (btn.textContent || "").trim().toLowerCase();
			if (txt === "post" || txt === "post now" || txt.includes("post")) {
				return btn;
			}
		}
		return null;
	}

	try {
		window.focus();

		let postBtn = null;
		for (let i = 0; i < 35; i++) {
			postBtn = findPostButton();
			if (postBtn) break;
			await sleep(800);
		}

		if (!postBtn) {
			console.error("Reddit Post button not found");
			return false;
		}

		postBtn.scrollIntoView({ behavior: "smooth", block: "center" });
		await sleep(500);
		postBtn.click();
		console.log("Reddit Post clicked");

		await sleep(3000);
		return true;

	} catch (e) {
		if (shouldIgnoreScriptError(e)) return;
		console.error("Reddit simple posting error:", e);
	}

	return false;
}

async function performRedditMediaPost(text, media) {
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

	function normalizeMediaItems(input) {
		if (!input) return [];

		if (Array.isArray(input)) {
			return input.map(item => {
				if (!item) return null;

				if (typeof item === "string") {
					return {
						data: item,
						type: ""
					};
				}

				if (typeof item === "object") {
					return {
						data: String(item.data || item.base64 || item.mediaBase64 || ""),
						type: String(item.type || item.mediaType || "")
					};
				}

				return null;
			}).filter(item => item && item.data);
		}

		if (typeof input === "string") {
			return [{
				data: input,
				type: ""
			}];
		}

		return [];
	}

	function getRoots() {
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
		for (const root of getRoots()) {
			try {
				out.push(...root.querySelectorAll(selector));
			} catch (_) { }
		}
		return out;
	}

	function isVisible(el) {
		if (!el) return false;
		const rect = el.getBoundingClientRect();
		const style = window.getComputedStyle(el);
		return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
	}

	function getText(el) {
		return String(el?.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
	}

	function findClickableByText(matchers) {
		const nodes = deepQueryAll('button, div[role="button"], span, a, label');
		for (const node of nodes) {
			if (!isVisible(node)) continue;
			const txt = getText(node);
			if (!txt) continue;

			for (const matcher of matchers) {
				if (txt === matcher || txt.includes(matcher)) {
					return node.closest('button, div[role="button"], a, label') || node;
				}
			}
		}
		return null;
	}

	function findImagesTab() {
		return findClickableByText([
			"images & video",
			"image & video",
			"images and video",
			"images",
			"image"
		]);
	}

	function dataUrlToFile(dataUrl, fallbackMimeType, index) {
		const arr = String(dataUrl || "").split(",");
		const header = arr[0] || "";
		const body = arr[1] || "";
		const mime = (header.match(/data:(.*?);base64/i) || [])[1] || fallbackMimeType || "image/png";

		const binary = atob(body);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}

		let ext = "png";
		if (/jpeg/i.test(mime)) ext = "jpg";
		else if (/gif/i.test(mime)) ext = "gif";
		else if (/webp/i.test(mime)) ext = "webp";
		else if (/mp4/i.test(mime)) ext = "mp4";
		else if (/quicktime/i.test(mime)) ext = "mov";
		else if (/webm/i.test(mime)) ext = "webm";

		return new File([bytes], `upload_${String(index || 1)}.${ext}`, { type: mime });
	}

	function buildDataTransfer(files) {
		const dt = new DataTransfer();
		for (const file of files) {
			dt.items.add(file);
		}
		return dt;
	}

	function dispatchDragDrop(target, dt) {
		const dragEnter = new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt });
		const dragOver = new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt });
		const drop = new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt });

		target.dispatchEvent(dragEnter);
		target.dispatchEvent(dragOver);
		target.dispatchEvent(drop);
	}

	function setFilesOnInput(input, dt) {
		try {
			input.focus();
		} catch (_) { }

		try {
			input.files = dt.files;
		} catch (e) {
			if (shouldIgnoreScriptError(e)) return false;
			console.error("Failed assigning files to input:", e);
			return false;
		}

		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(new Event("change", { bubbles: true }));

		try {
			const clickEvt = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
			input.dispatchEvent(clickEvt);
		} catch (_) { }

		return input.files && input.files.length > 0;
	}

	function looksLikeUploadArea(el) {
		if (!el || !isVisible(el)) return false;

		const txt = (
			(el.textContent || "") + " " +
			(el.getAttribute?.("aria-label") || "") + " " +
			(el.getAttribute?.("title") || "") + " " +
			(el.getAttribute?.("data-testid") || "") + " " +
			(el.className || "")
		).toLowerCase();

		if (
			txt.includes("upload") ||
			txt.includes("drop") ||
			txt.includes("drag") ||
			txt.includes("image") ||
			txt.includes("video")
		) {
			return true;
		}

		return !!el.querySelector?.('input[type="file"]');
	}

	function getAllFileInputs() {
		return deepQueryAll('input[type="file"]');
	}

	function findBestFileInput() {
		const all = getAllFileInputs();

		for (const input of all) {
			if (!input) continue;

			const accept = String(input.accept || "").toLowerCase();
			const parent = input.parentElement;
			const container = input.closest('form, div, label, faceplate-form-helper-text, shreddit-post-composer, shreddit-composer') || parent;

			if (container && looksLikeUploadArea(container)) {
				if (!accept || accept.includes("image") || accept.includes("video")) {
					return { input, container };
				}
			}
		}

		for (const input of all) {
			const accept = String(input.accept || "").toLowerCase();
			if (!accept || accept.includes("image") || accept.includes("video")) {
				return { input, container: input.closest('form, div, label') || input.parentElement || document.body };
			}
		}

		return null;
	}

	function findBestDropZone() {
		const candidates = [
			...deepQueryAll('label'),
			...deepQueryAll('div[role="button"]'),
			...deepQueryAll('button'),
			...deepQueryAll('div')
		];

		let best = null;
		let bestScore = -1;

		for (const el of candidates) {
			if (!looksLikeUploadArea(el)) continue;

			let score = 0;
			const txt = (
				(el.textContent || "") + " " +
				(el.getAttribute?.("aria-label") || "") + " " +
				(el.getAttribute?.("title") || "") + " " +
				(el.className || "")
			).toLowerCase();

			if (txt.includes("upload")) score += 5;
			if (txt.includes("drop")) score += 4;
			if (txt.includes("drag")) score += 3;
			if (txt.includes("image")) score += 2;
			if (txt.includes("video")) score += 2;
			if (el.querySelector?.('input[type="file"]')) score += 6;

			const rect = el.getBoundingClientRect();
			if (rect.width > 150 && rect.height > 80) score += 2;

			if (score > bestScore) {
				best = el;
				bestScore = score;
			}
		}

		return best;
	}

	function hasUploadPreview(expectedCount) {
		const selectors = [
			'img[src^="blob:"]',
			'video[src^="blob:"]',
			'[data-testid*="media"]',
			'[class*="preview"] img',
			'[class*="preview"] video',
			'[alt*="uploaded"]',
			'[alt*="preview"]'
		];

		let visibleCount = 0;

		for (const sel of selectors) {
			const els = deepQueryAll(sel);
			for (const el of els) {
				if (isVisible(el)) {
					visibleCount++;
				}
			}
		}

		const bodyText = getText(document.body);
		if (bodyText.includes("processing video") || bodyText.includes("uploading")) {
			return true;
		}

		return visibleCount >= Math.max(1, expectedCount);
	}

	function findPostButton() {
		const direct = document.getElementById("inner-post-submit-button");
		if (direct && isVisible(direct) && !direct.disabled && direct.getAttribute("aria-disabled") !== "true") {
			return direct;
		}

		const buttons = deepQueryAll("button");
		for (const btn of buttons) {
			if (!isVisible(btn)) continue;
			if (btn.disabled) continue;
			if (btn.getAttribute("aria-disabled") === "true") continue;

			const txt = getText(btn);
			if (txt === "post" || txt === "post now" || txt.includes("post")) {
				return btn;
			}
		}

		return null;
	}

	try {
		window.focus();

		for (let i = 0; i < 30; i++) {
			if (document.readyState === "complete" || document.readyState === "interactive") break;
			await sleep(500);
		}

		let imgTab = null;
		for (let i = 0; i < 40; i++) {
			imgTab = findImagesTab();
			if (imgTab) break;
			await sleep(700);
		}

		if (!imgTab) {
			console.error("Reddit Images & Video tab not found");
			return false;
		}

		imgTab.scrollIntoView({ behavior: "smooth", block: "center" });
		await sleep(500);
		imgTab.click();
		console.log("Reddit Images & Video tab clicked");

		await sleep(1800);

		const mediaItems = normalizeMediaItems(media);
		if (!mediaItems.length) {
			console.error("Reddit media missing");
			return false;
		}

		const files = mediaItems.map((item, index) =>
			dataUrlToFile(item.data, item.type || "image/png", index + 1)
		);

		const dt = buildDataTransfer(files);

		let uploadOk = false;

		for (let attempt = 1; attempt <= 12; attempt++) {
			console.log("Reddit upload attempt", attempt, "files:", files.length);

			const best = findBestFileInput();
			const dropZone = findBestDropZone();

			if (best?.container && isVisible(best.container)) {
				try {
					best.container.scrollIntoView({ behavior: "smooth", block: "center" });
				} catch (_) { }
			} else if (dropZone) {
				try {
					dropZone.scrollIntoView({ behavior: "smooth", block: "center" });
				} catch (_) { }
			}

			await sleep(400);

			if (dropZone) {
				try {
					dropZone.click();
				} catch (_) { }
			}

			if (best?.input) {
				const setOk = setFilesOnInput(best.input, dt);
				console.log(
					"fileInput.files length =",
					best.input.files ? best.input.files.length : 0,
					"setOk =",
					setOk
				);
			}

			await sleep(400);

			if (dropZone) {
				try {
					dispatchDragDrop(dropZone, dt);
					console.log("Drag/drop dispatched to upload zone");
				} catch (e) {
					if (shouldIgnoreScriptError(e)) return false;
					console.warn("Drag/drop failed:", e);
				}
			} else if (best?.container) {
				try {
					dispatchDragDrop(best.container, dt);
					console.log("Drag/drop dispatched to input container");
				} catch (e) {
					if (shouldIgnoreScriptError(e)) return false;
					console.warn("Container drag/drop failed:", e);
				}
			}

			await sleep(1500);

			if (hasUploadPreview(files.length)) {
				console.log("Reddit upload preview detected");
				uploadOk = true;
				break;
			}

			const postBtn = findPostButton();
			if (postBtn) {
				console.log("Reddit post button became enabled");
				uploadOk = true;
				break;
			}
		}

		if (!uploadOk) {
			console.error("Reddit upload did not appear in UI");
			return false;
		}

		let postBtn = null;
		for (let i = 0; i < 120; i++) {
			postBtn = findPostButton();
			if (postBtn) break;
			await sleep(1000);
		}

		if (!postBtn) {
			console.error("Reddit Post button not ready after upload");
			return false;
		}

		postBtn.scrollIntoView({ behavior: "smooth", block: "center" });
		await sleep(800);
		postBtn.click();
		console.log("Reddit media Post clicked");

		await sleep(4000);
		return true;

	} catch (e) {
		if (shouldIgnoreScriptError(e)) return false;
		console.error("Reddit media posting error:", e);
	}

	return false;
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