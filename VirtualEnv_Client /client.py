import asyncio
import base64
import binascii
import json
import os
import shutil
import websockets

SERVER_URL = "wss://env.neome.com"

# allow larger websocket messages (base64 is bigger than binary)
WS_MAX_SIZE = 50 * 1024 * 1024

# lock root once (real path)
ROOT = os.path.realpath(".")
WRITE_CLIENT_ID = os.environ.get("NEOME_WRITE_CLIENT_ID") == "1"
ID_FILE = os.path.join(ROOT, "client.id")

def safe_path(path):
	if not isinstance(path, str):
		raise Exception("Invalid path")

	path = path.strip().lstrip("/")

	full = os.path.realpath(os.path.join(ROOT, path))

	if not full.startswith(ROOT + os.sep) and full != ROOT:
		raise Exception("Path escape blocked")

	return full


def handle_command(cmd):
	try:
		if not isinstance(cmd, list) or not cmd:
			return "Invalid command"

		cmd_type = cmd[0]

		# =========================
		# TREE
		# =========================
		if cmd_type == "tree":
			path = cmd[1] if len(cmd) > 1 else "."
			full = safe_path(path)

			if not os.path.exists(full):
				return f"Path not found: {path}"

			if not os.path.isdir(full):
				return f"Not a directory: {path}"

			items = sorted(os.listdir(full))
			return "\n".join(items) if items else "[empty]"

		# =========================
		# VIEW (text only)
		# =========================
		elif cmd_type == "view":
			if len(cmd) < 2:
				return "Missing path"

			path = cmd[1]
			full = safe_path(path)

			if not os.path.exists(full):
				return f"File not found: {path}"

			if not os.path.isfile(full):
				return f"Not a file: {path}"

			with open(full, "rb") as f:
				sample = f.read(4096)

			if b"\x00" in sample:
				return f"Binary file: {path}"

			try:
				with open(full, "r", encoding="utf-8", errors="strict") as f:
					return f.read()
			except UnicodeDecodeError:
				return f"Binary file: {path}"

		# =========================
		# MKDIR
		# =========================
		elif cmd_type == "mkdir":
			if len(cmd) < 2:
				return "Missing path"

			path = cmd[1]
			full = safe_path(path)

			if os.path.exists(full):
				return f"Already exists: {path}"

			os.makedirs(full, exist_ok=True)
			return f"Created folder: {path}"

		# =========================
		# WRITE (text)
		# =========================
		elif cmd_type == "write":
			if len(cmd) < 2:
				return "Missing path"

			path = cmd[1]
			content = cmd[2] if len(cmd) > 2 else ""

			full = safe_path(path)

			parent = os.path.dirname(full)
			if parent:
				os.makedirs(parent, exist_ok=True)

			with open(full, "w", encoding="utf-8") as f:
				f.write(content)

			return f"Wrote {path}"

		# =========================
		# COPY
		# =========================
		elif cmd_type == "copy":
			if len(cmd) < 3:
				return "Missing source or destination"

			src_path = cmd[1]
			dst_path = cmd[2]

			src_full = safe_path(src_path)
			dst_full = safe_path(dst_path)

			if not os.path.exists(src_full):
				return f"Source not found: {src_path}"

			if src_full == dst_full:
				return "Source and destination are the same"

			dst_parent = os.path.dirname(dst_full)
			if dst_parent:
				os.makedirs(dst_parent, exist_ok=True)

			if os.path.isfile(src_full):
				if os.path.isdir(dst_full):
					dst_full = os.path.join(dst_full, os.path.basename(src_full))

				os.makedirs(os.path.dirname(dst_full), exist_ok=True)
				shutil.copy2(src_full, dst_full)
				return f"Copied file: {src_path} -> {dst_path}"

			if os.path.isdir(src_full):
				if os.path.exists(dst_full):
					return f"Destination already exists: {dst_path}"

				shutil.copytree(src_full, dst_full)
				return f"Copied folder: {src_path} -> {dst_path}"

			return "Unknown type"

		# =========================
		# WRITE_B64 (binary-safe)
		# =========================
		elif cmd_type == "write_b64":
			if len(cmd) < 3:
				return "Missing path or base64 data"

			path = cmd[1]
			b64_data = cmd[2]

			if not isinstance(b64_data, str):
				return "Invalid base64 data"

			full = safe_path(path)

			parent = os.path.dirname(full)
			if parent:
				os.makedirs(parent, exist_ok=True)

			try:
				raw = base64.b64decode(b64_data, validate=True)
			except (binascii.Error, ValueError):
				return "Invalid base64 data"

			with open(full, "wb") as f:
				f.write(raw)

			return f"Wrote binary {path} ({len(raw)} bytes)"

		# =========================
		# READ_B64 (download any file)
		# =========================
		elif cmd_type == "read_b64":
			if len(cmd) < 2:
				return "Missing path"

			path = cmd[1]
			full = safe_path(path)

			if not os.path.exists(full):
				return f"File not found: {path}"

			if not os.path.isfile(full):
				return f"Not a file: {path}"

			with open(full, "rb") as f:
				raw = f.read()

			return "B64:" + base64.b64encode(raw).decode("ascii")

		# =========================
		# DELETE
		# =========================
		elif cmd_type == "delete":
			if len(cmd) < 2:
				return "Missing path"

			path = cmd[1]
			full = safe_path(path)

			if not os.path.exists(full):
				return f"Path not found: {path}"

			if os.path.isfile(full):
				os.remove(full)
				return f"Deleted file: {path}"

			if os.path.isdir(full):
				shutil.rmtree(full)
				return f"Deleted folder: {path}"

			return "Unknown type"

		return f"Unknown command: {cmd_type}"

	except Exception as e:
		return f"Error: {str(e)}"


async def send_json(ws, data):
	await ws.send(json.dumps(data))


async def main():
	while True:
		try:
			async with websockets.connect(
				SERVER_URL,
				max_size=WS_MAX_SIZE
			) as ws:
				await send_json(ws, {"role": "client"})
				print("[+] connected to server", flush=True)

				async for raw in ws:
					try:
						data = json.loads(raw)
					except:
						continue

					msg_type = data.get("type")

					if msg_type == "hello" and data.get("id"):
						print("CLIENT_ID:", data["id"], flush=True)

						if WRITE_CLIENT_ID:
							try:
								with open(ID_FILE, "w", encoding="utf-8") as f:
									f.write(data["id"])
							except Exception as e:
								print("[!] failed to write client.id:", e, flush=True)

						continue

					if msg_type == "cmd":
						result = handle_command(data.get("cmd"))

						await send_json(ws, {
							"type": "result",
							"output": result
						})

		except Exception as e:
			print("[!] disconnected:", e, flush=True)
			await asyncio.sleep(2)


if __name__ == "__main__":
	asyncio.run(main())
