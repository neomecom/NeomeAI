import asyncio
import json
import uuid
import websockets

# Mapping: chrome_runtime_id -> custom_client_id
chrome_to_custom = {}

# Mapping: custom_client_id -> websocket
clients = {}

# Mapping: custom_client_id -> set of browser websockets
client_to_browsers = {}

WS_MAX_SIZE = 100 * 1024 * 1024  # 100 MB


async def send_json(ws, payload):
	try:
		await ws.send(json.dumps(payload))
	except:
		pass


def new_client_id():
	return str(uuid.uuid4())


def add_browser_for_client(client_id, ws):
	if not client_id:
		return

	if client_id not in client_to_browsers:
		client_to_browsers[client_id] = set()

	client_to_browsers[client_id].add(ws)


def remove_browser_ws(ws):
	stale_ids = []

	for cid, browser_set in client_to_browsers.items():
		if ws in browser_set:
			browser_set.discard(ws)

		if not browser_set:
			stale_ids.append(cid)

	for cid in stale_ids:
		client_to_browsers.pop(cid, None)

async def cleanup_loop():
	while True:
		await asyncio.sleep(60)

		for cid, ws in list(clients.items()):
			if ws.closed:
				clients.pop(cid, None)
				client_to_browsers.pop(cid, None)

		for chrome_runtime_id, cid in list(chrome_to_custom.items()):
			if cid not in clients:
				chrome_to_custom.pop(chrome_runtime_id, None)

async def handler(ws):
	custom_client_id = None
	chrome_id = None
	role = None

	try:
		first = await ws.recv()

		try:
			msg = json.loads(first)
		except:
			await send_json(ws, {
				"type": "error",
				"message": "invalid json"
			})
			return

		role = (msg.get("role") or "").strip().lower()

		if role == "client":
			chrome_id = (msg.get("id") or msg.get("chrome_id") or "").strip()

			if not chrome_id:
				chrome_id = str(uuid.uuid4())

			if chrome_id in chrome_to_custom:
				custom_client_id = chrome_to_custom[chrome_id]
			else:
				custom_client_id = new_client_id()
				chrome_to_custom[chrome_id] = custom_client_id

			clients[custom_client_id] = ws

			await send_json(ws, {
				"type": "hello",
				"id": custom_client_id
			})

			async for raw in ws:
				try:
					data = json.loads(raw)
				except:
					continue

				msg_type = (data.get("type") or "").strip()

				if msg_type == "refresh_id":
					old_id = custom_client_id
					new_id = new_client_id()

					chrome_to_custom[chrome_id] = new_id

					if old_id and clients.get(old_id) is ws:
						clients.pop(old_id, None)

					if old_id in client_to_browsers:
						client_to_browsers[new_id] = client_to_browsers.pop(old_id)

					custom_client_id = new_id
					clients[custom_client_id] = ws

					await send_json(ws, {
						"type": "hello",
						"id": custom_client_id
					})
					continue

				if msg_type == "keepalive":
					continue

				target_browsers = list(client_to_browsers.get(custom_client_id, set()))

				if not target_browsers:
					continue

				payload = dict(data)
				payload["id"] = custom_client_id

				for browser_ws in target_browsers:
					await send_json(browser_ws, payload)

		elif role == "browser":
			await send_json(ws, {
				"type": "hello",
				"message": "browser connected"
			})

			async for raw in ws:
				try:
					data = json.loads(raw)
				except:
					await send_json(ws, {
						"type": "error",
						"message": "invalid json"
					})
					continue

				if data.get("type") != "cmd":
					continue

				target_id = (data.get("id") or "").strip()
				target_ws = clients.get(target_id)

				if not target_ws:
					await send_json(ws, {
						"type": "error",
						"message": f"client not found: {target_id}"
					})
					continue

				add_browser_for_client(target_id, ws)
				await send_json(target_ws, data)

		else:
			await send_json(ws, {
				"type": "error",
				"message": "unknown role"
			})

	except websockets.ConnectionClosed:
		pass
	except Exception:
		pass
	finally:
		if role == "client":
			if custom_client_id and clients.get(custom_client_id) is ws:
				clients.pop(custom_client_id, None)

			if chrome_id and chrome_to_custom.get(chrome_id) == custom_client_id:
				chrome_to_custom.pop(chrome_id, None)

			if custom_client_id:
				client_to_browsers.pop(custom_client_id, None)

		remove_browser_ws(ws)


async def main():
	asyncio.create_task(cleanup_loop())

	async with websockets.serve(
		handler,
		"0.0.0.0",
		8888,
		max_size=WS_MAX_SIZE,
		ping_interval=20,
		ping_timeout=20
	):
		await asyncio.Future()


if __name__ == "__main__":
	asyncio.run(main())
