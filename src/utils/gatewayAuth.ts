/**
 * Gateway Auth — login/logout for api.clew-code.org
 *
 * When CLEW_GATEWAY_URL is set, 'clew auth login' uses the gateway
 * instead of Anthropic's OAuth flow.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { openBrowser } from './browser.js';

const GATEWAY_URL = process.env.CLEW_GATEWAY_URL || 'https://api.clew-code.org/v1';

export type GatewayAuthResult = {
  token: string;
  user: { id: string; email: string; tier: string };
};

/**
 * Login to the gateway with email + password.
 */
export async function login(email: string, password: string): Promise<GatewayAuthResult> {
  const res = await fetch(`${GATEWAY_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Gateway login failed');
  return data;
}

/**
 * Signup to the gateway.
 */
export async function signup(email: string, password: string): Promise<GatewayAuthResult> {
  const res = await fetch(`${GATEWAY_URL}/v1/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Gateway signup failed');
  return data;
}

/**
 * Save gateway credentials to config file.
 */
export async function saveGatewayToken(token: string, user: GatewayAuthResult['user']): Promise<void> {
  const configPath = join(homedir(), '.clew', 'gateway.json');
  await writeFile(configPath, JSON.stringify({ token, user }, null, 2));
}

/**
 * Import a token obtained from the web dashboard.
 */
export async function importToken(token: string): Promise<GatewayAuthResult> {
  const res = await fetch(`${GATEWAY_URL}/auth/me`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!res.ok) throw new Error('Invalid or expired token');
  const data = await res.json();
  const user = {
    id: data.user?.id || 'unknown',
    email: data.user?.email || 'unknown',
    tier: data.user?.tier || 'free',
  };
  await saveGatewayToken(token, user);
  return { token, user };
}

/**
 * Read saved gateway token from config file.
 */
export async function readGatewayToken(): Promise<string | null> {
  try {
    const configPath = join(homedir(), '.clew', 'gateway.json');
    const raw = await readFile(configPath, 'utf-8');
    const { token } = JSON.parse(raw);
    return token || null;
  } catch {
    return null;
  }
}

/**
 * Login via browser — opens local HTTP server, launches browser,
 * catches the token callback.
 */
export async function loginViaBrowser(): Promise<void> {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Clew Login</title><style>
body{background:#0a0a0f;color:#e4e4e7;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#12121a;border:1px solid #27272a;border-radius:12px;padding:2rem;width:360px;max-width:90vw}
h1{font-size:1.25rem;font-weight:600;margin:0 0 .25rem}
p{color:#a1a1aa;font-size:.85rem;margin:0 0 1.25rem}
label{font-size:.82rem;color:#a1a1aa;display:block;margin-bottom:.3rem}
input{width:100%;padding:.6rem .75rem;background:#1a1a28;border:1px solid #27272a;border-radius:6px;color:#e4e4e7;font-size:.9rem;box-sizing:border-box;margin-bottom:.75rem}
input:focus{outline:none;border-color:#a855f7}
button{width:100%;padding:.6rem;background:#a855f7;color:#fff;border:none;border-radius:6px;font-size:.9rem;font-weight:500;cursor:pointer}
button:hover{background:#9333ea}
.error{color:#ef4444;font-size:.82rem;margin-top:.5rem;display:none}
.loading{display:none;text-align:center;color:#a1a1aa;font-size:.85rem;padding:2rem}
.form{display:block}
.success{display:none;text-align:center;padding:2rem}
.success .check{font-size:3rem;color:#22c55e;margin-bottom:.5rem}
</style></head><body>
<div class="card">
<h1>Sign in to Clew</h1><p>Enter your credentials to authenticate the CLI</p>
<div class="form" id="form">
<label for="email">Email</label><input type="email" id="email" placeholder="you@example.com" autofocus>
<label for="password">Password</label><input type="password" id="password" placeholder="password">
<button onclick="doLogin()">Sign in</button>
<div class="error" id="error"></div>
<p style="margin-top:1rem;text-align:center;font-size:.78rem;color:#6b6b80">
Don't have an account? <a href="https://clew-code.org/app/#login" style="color:#a855f7;text-decoration:none">Sign up</a>
</p>
</div>
<div class="loading" id="loading"><p>Signing in...</p></div>
<div class="success" id="success"><div class="check">&#10003;</div><p>Logged in! You can close this tab.</p></div>
</div>
<script>
const API = '${GATEWAY_URL}';
async function doLogin(){const e=document.getElementById('email').value,p=document.getElementById('password').value,er=document.getElementById('error');
if(!e||!p){er.textContent='Email and password required';er.style.display='block';return}
document.getElementById('form').style.display='none';document.getElementById('loading').style.display='block';er.style.display='none';
try{const r=await fetch(API+'/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e,password:p})});
const d=await r.json();if(!r.ok||!d.token){throw new Error(d.error||'Login failed')}
window.location.href='/callback?token='+encodeURIComponent(d.token)+'&email='+encodeURIComponent(d.user?.email||'')+'&tier='+encodeURIComponent(d.user?.tier||'free')}
catch(err){document.getElementById('form').style.display='block';document.getElementById('loading').style.display='none';er.textContent=err.message;er.style.display='block'}}
</script></body></html>`;

  return new Promise<void>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://localhost`);
      const parsedUrl = new URL(req.url || '/', `http://localhost`);

      if (parsedUrl.pathname === '/callback') {
        const token = parsedUrl.searchParams.get('token');
        const email = parsedUrl.searchParams.get('email') || 'unknown';
        const tier = parsedUrl.searchParams.get('tier') || 'free';

        if (token) {
          await saveGatewayToken(token, { id: 'web', email, tier });
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<html><body style="background:#0a0a0f;color:#e4e4e7;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui;margin:0">
<div style="text-align:center"><h1 style="color:#22c55e">&#10003;</h1><p>CLI login successful!<br><span style="color:#a1a1aa;font-size:.85rem">Logged in as ${email} (${tier})</span></p></div></body></html>`);
          server.close();
          process.stdout.write(`\nLogged in as ${email} (${tier})\n`);
          resolve();
        } else {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing token');
        }
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    });

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port;
      const url = `http://127.0.0.1:${port}`;
      process.stdout.write('Opening browser for CLI login...\n');
      openBrowser(url).catch(() => {
        process.stdout.write(`Open this URL in your browser:\n${url}\n`);
      });
    });
  });
}

/**
 * Check if gateway auth is configured.
 */
export function isGatewayConfigured(): boolean {
  return !process.env.CLEW_DISABLE_GATEWAY;
}
