# <a href="https://neome.com">Neome.com</a> Browser Control Extension

**Deterministic. Secure. Yours.**  
No APIs. No Keys. Just Control.  
**Your Browser. Your Rules.**

Open source Chrome extension that lets **NeomeAI** safely and directly control your browser using your existing logged-in sessions — without storing passwords or API keys.

---

## ✨ Features

- Direct browser control from NeomeAI
- Works with your current login sessions (X, Reddit, TikTok, Gmail, Telegram, and more)
- No API keys or credentials stored
- Strict host permissions for maximum security
- Fully deterministic command execution
- 100% open source and auditable

---

## 🚀 Quick Start – Chrome Extension

### 1. Install the Extension

1. Download or clone the `SocialWebsite_Chrome_Extension` folder
2. Go to `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top right corner)
4. Click **Load unpacked**
5. Select the extension folder

### 2. Get Your Client ID

- Click the Neome extension icon in the toolbar
- Open **Neome Poster**
- Copy the **Client ID** that appears

**Example:** `8f3a9c21-4c2a-49b2-9f5e-1a2b3c4d5e6f`

### 3. Connect in NeomeAI

1. Add a **Social Website** node
2. Paste your Client ID into the node
3. Click **Connect**

Once connected, you can automate:
- Posting on X
- Creating Reddit posts
- Uploading TikTok videos
- Sending Gmail & Telegram messages
- And many more actions

**Requirements:**
- You must be logged into each platform in your browser
- Keep Chrome open while using automation
- No API keys required

---

## ➕ Adding a New Platform

1. Add the website URL to `host_permissions` in `manifest.json`
2. Create a new file in the `CustomScripts/` folder (e.g. `discord.js`)
3. Import and register the handler in `background.js`
4. Reload the extension in `chrome://extensions/`

**Example handler:**

```javascript
export async function handleCommand(data) {
    const action = String(data.action || "").trim().toLowerCase();
    if (action !== "post") return;

    // Your platform-specific logic here
}

Why This Is the Safest Design<div style="background:#161b22; border-left:4px solid #58a6ff; padding:16px; border-radius:6px; margin:16px 0;">
<ul>
<li>Runs entirely inside <strong>your own Chrome browser</strong></li>
<li>Uses your existing logged-in sessions — nothing is stored or shared</li>
<li>Strict <code>host_permissions</code> — can only access explicitly allowed sites</li>
<li>Deterministic execution: AI only sends commands, browser executes exactly as instructed</li>
<li>Fully open source and transparent</li>
</ul>
</div>

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
source venv/bin/activate          # On Windows: venv\Scripts\activate
pip install websockets==12.0
python3 client.py

Copy the displayed Client ID and paste it into the Virtual Env node in NeomeAI.Self-Hosted WebSocket ServerSee the WSserver folder for a complete example.Recommended setup:Run on port 8888
Use a Python virtual environment
Expose securely with Nginx + Certbot (SSL)

Full setup instructions are included inside the WSserver folder.Repository Structure

SocialWebsite_Chrome_Extension/   ← Main Chrome extension
VirtualEnv_Client/                ← Python client for local environments
WSserver/                         ← Example WebSocket server

ContributingWe welcome contributions to build the safest and most deterministic browser automation tool together.Feel free to:Add support for new platforms
Improve existing scripts
Suggest security enhancements
Open issues or submit pull requests

Built for privacy-first, deterministic AI automation.Visit neome.com for more information.Made with  by the Neome community

This version uses a small amount of inline HTML for the safety section to make it stand out nicely on GitHub, while keeping everything else in clean Markdown. It should render beautifully.

Just copy the entire content above and replace your current `README.md`. Let me know if you want any tweaks!

