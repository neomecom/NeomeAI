# Neome Browser Control Extension

**Deterministic. Secure. Yours.**  
No APIs. No Keys. Just Control.  
Your Browser. Your Rules.

Open source Chrome extension that lets **NeomeAI** safely and directly control your browser using your existing logged-in sessions — without storing passwords or API keys.

---

## ✨ Features

- Direct browser control from NeomeAI
- Works with your current login sessions (X, Reddit, TikTok, Gmail, Telegram, etc.)
- No API keys or credentials stored
- Strict host permissions for maximum security
- Fully deterministic command execution
- Open source and fully auditable

---

## 🚀 Quick Start – Chrome Extension

### 1. Install the Extension

1. Download or clone the `SocialWebsite_Chrome_Extension` folder
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the extension folder

### 2. Get Your Client ID

- Click the Neome extension icon
- Open **Neome Poster**
- Copy the **Client ID** shown (example: `8f3a9c21-4c2a-49b2-9f5e-1a2b3c4d5e6f`)

### 3. Connect in NeomeAI

1. Add a **Social Website** node
2. Paste your Client ID
3. Click **Connect**

Once connected, NeomeAI can:
- Post on X
- Create Reddit posts
- Upload TikTok videos
- Send Gmail & Telegram messages
- And more...

**Requirements:**
- Stay logged into each platform in your browser
- Keep Chrome open during automation
- No API keys needed

---

## ➕ Adding a New Platform

1. Add the website to `host_permissions` in `manifest.json`
2. Create a new file in `CustomScripts/` (e.g. `discord.js`)
3. Import and register the handler in `background.js`
4. Reload the extension

Example handler:

```javascript
export async function handleCommand(data) {
    const action = String(data.action || "").trim().toLowerCase();
    if (action !== "post") return;

    // Add your platform-specific logic here
}

Why This Is the Safest DesignRuns inside your own Chrome browser
Uses your existing sessions — nothing is stored or shared
Strict host_permissions — can only touch explicitly allowed sites
Deterministic: AI sends commands, browser executes exactly
Fully open source and transparent

Message FlowCommand (NeomeAI → Browser)json

{
  "type": "cmd",
  "platform": "x",
  "action": "post",
  "text": "Hello from NeomeAI"
}

Event (Browser → NeomeAI)json

{
  "type": "event",
  "platform": "x",
  "event": "mention",
  "mention": {
    "author": "user",
    "text": "hey check this",
    "url": "https://x.com/..."
  }
}

Virtual Environment Clientbash

cd your-project-folder

python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install websockets==12.0
python3 client.py

Copy the displayed Client ID and paste it into the Virtual Env node in NeomeAI.Self-Hosted WebSocket ServerSee the WSserver folder for a complete example.Recommended setup:Run on port 8888
Use Python virtual environment
Expose securely with Nginx + Certbot (SSL)

Full setup guide is included in the WSserver documentation.Repository StructureSocialWebsite_Chrome_Extension/ – Main Chrome extension
VirtualEnv_Client/ – Python client for local environments
WSserver/ – Example WebSocket server

ContributingWe welcome contributions to make this the safest and most deterministic browser automation tool.Feel free to:Add new platform scripts
Improve existing handlers
Suggest security enhancements
Open issues or pull requests

