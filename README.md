<body style="margin:0; padding:40px 20px; background:#0d1117; color:#e6edf3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height:1.7;">
    <div style="max-width:980px; margin:0 auto;">

        <h1 style="font-size:42px; margin:0 0 16px 0;">
            <a href="https://neome.com" style="color:#58a6ff; text-decoration:none;">Neome.com</a> Browser Control Extension
        </h1>

        <p style="font-size:20px; color:#8b949e; margin:0 0 30px 0;">
            <strong>Deterministic. Secure. Yours.</strong><br>
            No APIs. No Keys. Just Control.<br>
            <strong>Your Browser. Your Rules.</strong>
        </p>

        <p style="font-size:18px; margin-bottom:40px;">
            Open source Chrome extension that lets <strong>NeomeAI</strong> safely and directly control your browser using your existing logged-in sessions — without storing passwords or API keys.
        </p>

        <div style="background:#161b22; border:1px solid #30363d; border-radius:12px; padding:32px; margin-bottom:40px;">
            <h2 style="color:#58a6ff; margin-top:0; font-size:24px;">✨ Features</h2>
            <ul style="padding-left:20px; font-size:16px;">
                <li>Direct browser control from NeomeAI</li>
                <li>Works with your current login sessions (X, Reddit, TikTok, Gmail, Telegram, and more)</li>
                <li>No API keys or credentials stored</li>
                <li>Strict host permissions for maximum security</li>
                <li>Fully deterministic command execution</li>
                <li>100% open source and auditable</li>
            </ul>
        </div>

        <div style="background:#161b22; border:1px solid #30363d; border-radius:12px; padding:32px; margin-bottom:40px;">
            <h2 style="color:#58a6ff; margin-top:0; font-size:24px;">🚀 Quick Start – Chrome Extension</h2>
            
            <h3 style="color:#58a6ff;">1. Install the Extension</h3>
            <ol>
                <li>Download or clone the <code>SocialWebsite_Chrome_Extension</code> folder</li>
                <li>Go to <code>chrome://extensions/</code> in Chrome</li>
                <li>Enable <strong>Developer mode</strong> (top right corner)</li>
                <li>Click <strong>Load unpacked</strong></li>
                <li>Select the extension folder</li>
            </ol>

            <h3 style="color:#58a6ff;">2. Get Your Client ID</h3>
            <p>Click the Neome extension icon in the toolbar → Open <strong>Neome Poster</strong> → Copy the <strong>Client ID</strong> that appears.</p>
            <p><strong>Example:</strong> <code>8f3a9c21-4c2a-49b2-9f5e-1a2b3c4d5e6f</code></p>

            <h3 style="color:#58a6ff;">3. Connect in NeomeAI</h3>
            <ol>
                <li>Add a <strong>Social Website</strong> node</li>
                <li>Paste your Client ID into the node</li>
                <li>Click <strong>Connect</strong></li>
            </ol>

            <p><strong>Once connected, you can automate:</strong></p>
            <ul>
                <li>Posting on X</li>
                <li>Creating Reddit posts</li>
                <li>Uploading TikTok videos</li>
                <li>Sending Gmail &amp; Telegram messages</li>
                <li>And many more actions</li>
            </ul>

            <div style="background:#0d1117; padding:16px; border-radius:8px; border-left:4px solid #58a6ff; margin:20px 0;">
                <strong>Requirements:</strong><br>
                • You must be logged into each platform in your browser<br>
                • Keep Chrome open while using automation<br>
                • No API keys required
            </div>
        </div>

        <div style="background:#161b22; border:1px solid #30363d; border-radius:12px; padding:32px; margin-bottom:40px;">
            <h2 style="color:#58a6ff; margin-top:0; font-size:24px;">➕ Adding a New Platform</h2>
            <ol>
                <li>Add the website URL to <code>host_permissions</code> in <code>manifest.json</code></li>
                <li>Create a new file in the <code>CustomScripts/</code> folder (e.g. <code>discord.js</code>)</li>
                <li>Import and register the handler in <code>background.js</code></li>
                <li>Reload the extension in <code>chrome://extensions/</code></li>
            </ol>

            <p><strong>Example handler:</strong></p>
            <pre style="background:#0d1117; padding:18px; border-radius:8px; overflow:auto; font-family:ui-monospace,monospace; font-size:14px; line-height:1.5; border:1px solid #30363d;">export async function handleCommand(data) {
    const action = String(data.action || "").trim().toLowerCase();
    if (action !== "post") return;

    // Your platform-specific logic here
}</pre>
        </div>

        <div style="background:#161b22; border:1px solid #30363d; border-radius:12px; padding:32px; margin-bottom:40px;">
            <h2 style="color:#58a6ff; margin-top:0; font-size:24px;">Why This Is the Safest Design</h2>
            <div style="background:#0d1117; border-left:4px solid #58a6ff; padding:20px; border-radius:8px;">
                <ul style="margin:0; padding-left:20px;">
                    <li>Runs entirely inside <strong>your own Chrome browser</strong></li>
                    <li>Uses your existing logged-in sessions — nothing is stored or shared</li>
                    <li>Strict <code>host_permissions</code> — can only access explicitly allowed sites</li>
                    <li>Deterministic execution: AI only sends commands, browser executes exactly as instructed</li>
                    <li>Fully open source and transparent</li>
                </ul>
            </div>
        </div>

        <div style="background:#161b22; border:1px solid #30363d; border-radius:12px; padding:32px; margin-bottom:40px;">
            <h2 style="color:#58a6ff; margin-top:0; font-size:24px;">Message Flow</h2>
            
            <h3 style="color:#58a6ff;">Command (NeomeAI → Browser)</h3>
            <pre style="background:#0d1117; padding:18px; border-radius:8px; overflow:auto; font-family:ui-monospace,monospace; font-size:14px; border:1px solid #30363d;">{
  "type": "cmd",
  "platform": "x",
  "action": "post",
  "text": "Hello from NeomeAI"
}</pre>

            <h3 style="color:#58a6ff;">Event (Browser → NeomeAI)</h3>
            <pre style="background:#0d1117; padding:18px; border-radius:8px; overflow:auto; font-family:ui-monospace,monospace; font-size:14px; border:1px solid #30363d;">{
  "type": "event",
  "platform": "x",
  "event": "mention",
  "mention": {
    "author": "user",
    "text": "hey check this",
    "url": "https://x.com/..."
  }
}</pre>
        </div>

        <div style="background:#161b22; border:1px solid #30363d; border-radius:12px; padding:32px; margin-bottom:40px;">
            <h2 style="color:#58a6ff; margin-top:0; font-size:24px;">Virtual Environment Client</h2>
            <pre style="background:#0d1117; padding:18px; border-radius:8px; overflow:auto; font-family:ui-monospace,monospace; font-size:14px; border:1px solid #30363d;">cd your-project-folder

python3 -m venv venv
source venv/bin/activate          # On Windows: venv\Scripts\activate
pip install websockets==12.0
python3 client.py</pre>
            <p>Copy the displayed <strong>Client ID</strong> and paste it into the <strong>Virtual Env</strong> node in NeomeAI.</p>
        </div>

        <div style="background:#161b22; border:1px solid #30363d; border-radius:12px; padding:32px; margin-bottom:40px;">
            <h2 style="color:#58a6ff; margin-top:0; font-size:24px;">Self-Hosted WebSocket Server</h2>
            <p>See the <code>WSserver</code> folder for a complete example.</p>
            <p><strong>Recommended setup:</strong></p>
            <ul>
                <li>Run on port <strong>8888</strong></li>
                <li>Use a Python virtual environment</li>
                <li>Expose securely with Nginx + Certbot (SSL)</li>
            </ul>
            <p>Full setup instructions are included inside the <code>WSserver</code> folder.</p>
        </div>

        <div style="background:#161b22; border:1px solid #30363d; border-radius:12px; padding:32px; margin-bottom:40px;">
            <h2 style="color:#58a6ff; margin-top:0; font-size:24px;">Repository Structure</h2>
            <pre style="background:#0d1117; padding:18px; border-radius:8px; font-family:ui-monospace,monospace; font-size:14px; border:1px solid #30363d;">SocialWebsite_Chrome_Extension/   ← Main Chrome extension
VirtualEnv_Client/                ← Python client for local environments
WSserver/                         ← Example WebSocket server</pre>
        </div>

        <div style="background:#161b22; border:1px solid #30363d; border-radius:12px; padding:32px; margin-bottom:40px;">
            <h2 style="color:#58a6ff; margin-top:0; font-size:24px;">Contributing</h2>
            <p>We welcome contributions to build the safest and most deterministic browser automation tool together.</p>
            <p>Feel free to:</p>
            <ul>
                <li>Add support for new platforms</li>
                <li>Improve existing scripts</li>
                <li>Suggest security enhancements</li>
                <li>Open issues or submit pull requests</li>
            </ul>
        </div>

        <div style="text-align:center; color:#8b949e; margin-top:60px; font-size:15px;">
            <p><strong>Built for privacy-first, deterministic AI automation.</strong></p>
            <p>Visit <a href="https://neome.com" style="color:#58a6ff;">neome.com</a> for more information.</p>
            <p>Made with ❤️ by the Neome community</p>
        </div>

    </div>
</body>
