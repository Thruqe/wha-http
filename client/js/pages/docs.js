/** pages/docs.js — GitHub-style API reference */
import { el } from '../dom.js'
import { navigate } from '../router.js'
import { getToken } from '../auth.js'

// ── Copy-to-clipboard helper ──────────────────────────────────────
function copyBtn(textFn) {
    const btn = el('button', { class: 'copy-btn', type: 'button', 'aria-label': 'Copy to clipboard' },
        el('i', { class: 'fi fi-rr-copy' }),
    )
    btn.addEventListener('click', () => {
        navigator.clipboard.writeText(typeof textFn === 'function' ? textFn() : textFn).then(() => {
            btn.classList.add('copied')
            btn.innerHTML = ''
            btn.append(el('i', { class: 'fi fi-rr-check' }))
            setTimeout(() => {
                btn.classList.remove('copied')
                btn.innerHTML = ''
                btn.append(el('i', { class: 'fi fi-rr-copy' }))
            }, 1800)
        })
    })
    return btn
}

// ── Code block with copy button ───────────────────────────────────
function codeBlock(code, lang = '') {
    const pre  = el('pre',  { class: 'readme-pre' })
    const code_ = el('code', { class: lang ? `lang-${lang}` : '' }, code)
    pre.append(code_)

    const wrap = el('div', { class: 'code-wrap' },
        el('div', { class: 'code-toolbar' },
            lang ? el('span', { class: 'code-lang' }, lang) : null,
            copyBtn(code),
        ),
        pre,
    )
    return wrap
}

// ── Badge chip ────────────────────────────────────────────────────
function badge(method) {
    const colors = { GET:'badge-method-get', POST:'badge-method-post', DELETE:'badge-method-delete', WS:'badge-method-ws' }
    return el('span', { class: `badge-method ${colors[method] ?? ''}` }, method)
}

// ── Endpoint block ────────────────────────────────────────────────
function endpoint({ method, path, auth = true, desc, body, response, example }) {
    const id = `ep-${method.toLowerCase()}-${path.replace(/\//g, '-').replace(/[^a-z0-9-]/g, '')}`
    const rows = [
        el('div', { class: 'ep-header' },
            badge(method),
            el('code', { class: 'ep-path' }, path),
            auth ? el('span', { class: 'ep-auth-badge' },
                el('i', { class: 'fi fi-rr-lock fi-sm' }), ' Auth required'
            ) : null,
        ),
        el('p', { class: 'ep-desc' }, desc),
    ]
    if (body) rows.push(
        el('p', { class: 'ep-sublabel' }, 'Request body'),
        codeBlock(body, 'json'),
    )
    if (example) rows.push(
        el('p', { class: 'ep-sublabel' }, 'Example'),
        codeBlock(example, 'bash'),
    )
    if (response) rows.push(
        el('p', { class: 'ep-sublabel' }, 'Response'),
        codeBlock(response, 'json'),
    )
    return el('div', { class: 'endpoint', id }, ...rows)
}

// ── Section heading ───────────────────────────────────────────────
function section(icon, title, ...children) {
    return el('section', { class: 'readme-section' },
        el('h2', { class: 'readme-h2' },
            el('i', { class: `fi ${icon} fi-sm`, style: 'margin-right:8px' }), title
        ),
        ...children,
    )
}

// ── Page ──────────────────────────────────────────────────────────
export function docsPage() {
    const host  = window.location.host
    const TOKEN = () => getToken() ?? '<your_jwt_token>'

    const header = el('header', { class: 'app-header' },
        el('button', { class: 'back-link', type: 'button' },
            el('i', { class: 'fi fi-rr-arrow-left fi-sm' }), ' Dashboard'
        ),
        el('span', { class: 'app-logo' }, 'WhatsRook'),
        el('div', {}),
    )
    header.querySelector('.back-link').addEventListener('click', () => navigate('/dashboard'))

    const main = el('main', { class: 'app-main readme-main' },

        // ── README header ──────────────────────────────────────────
        el('div', { class: 'readme-hero' },
            el('h1', { class: 'readme-title' }, 'WHA-HTTP API Reference'),
            el('p',  { class: 'readme-sub' },
                'A lightweight HTTP & WebSocket gateway that wraps WhatsApp sessions managed by ',
                el('code', {}, 'whatsrook'), '. All endpoints below require a valid JWT unless noted.'
            ),
            el('div', { class: 'readme-badges' },
                el('span', { class: 'readme-badge' }, 'REST API'),
                el('span', { class: 'readme-badge' }, 'WebSocket'),
                el('span', { class: 'readme-badge' }, 'JWT Auth'),
            ),
        ),

        // ── Quick start ────────────────────────────────────────────
        section('fi-rr-rocket', 'Quick Start',
            el('ol', { class: 'readme-ol' },
                el('li', {}, 'Register an account'),
                el('li', {}, 'Login and save the returned JWT token'),
                el('li', {}, 'Use the token as a Bearer header on every subsequent request'),
                el('li', {}, 'Add a WhatsApp account and open the WebSocket to receive events'),
            ),
            el('p', { class: 'ep-sublabel' }, 'Base URL'),
            codeBlock(`http://${host}`, 'text'),
        ),

        // ── Auth ───────────────────────────────────────────────────
        section('fi-rr-shield-check', 'Authentication',
            el('p', { class: 'ep-desc' },
                'Include a Bearer token on every protected request:'
            ),
            codeBlock(`Authorization: Bearer ${TOKEN()}`, 'http'),

            endpoint({
                method: 'POST', path: '/auth/register', auth: false,
                desc: 'Create a new user account.',
                body: `{\n  "email": "you@example.com",\n  "password": "s3cr3t"\n}`,
                response: `{ "token": "eyJ..." }`,
                example: `curl -X POST http://${host}/auth/register \\\n  -H "Content-Type: application/json" \\\n  -d '{"email":"you@example.com","password":"s3cr3t"}'`,
            }),

            endpoint({
                method: 'POST', path: '/auth/login', auth: false,
                desc: 'Login and receive a JWT token.',
                body: `{\n  "email": "you@example.com",\n  "password": "s3cr3t"\n}`,
                response: `{ "token": "eyJ..." }`,
                example: `curl -X POST http://${host}/auth/login \\\n  -H "Content-Type: application/json" \\\n  -d '{"email":"you@example.com","password":"s3cr3t"}'`,
            }),

            endpoint({
                method: 'GET', path: '/auth/me', auth: true,
                desc: 'Returns the authenticated user object.',
                response: `{ "id": "...", "email": "you@example.com" }`,
                example: `curl http://${host}/auth/me \\\n  -H "Authorization: Bearer ${TOKEN()}"`,
            }),
        ),

        // ── Accounts ───────────────────────────────────────────────
        section('fi-rr-users', 'WhatsApp Accounts',

            endpoint({
                method: 'GET', path: '/accounts',
                desc: 'List all WhatsApp sessions for the authenticated user.',
                response: `[\n  { "id": "...", "phone": "2348012345678", "status": "connected", "client": "chrome", "port": 3000 }\n]`,
                example: `curl http://${host}/accounts \\\n  -H "Authorization: Bearer ${TOKEN()}"`,
            }),

            endpoint({
                method: 'POST', path: '/accounts',
                desc: 'Register a new WhatsApp phone number. Status will be "stopped" until you call /start.',
                body: `{\n  "phone": "2348012345678"\n}`,
                response: `{ "account": { "id": "...", "phone": "2348012345678", "status": "stopped" } }`,
                example: `curl -X POST http://${host}/accounts \\\n  -H "Authorization: Bearer ${TOKEN()}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"phone":"2348012345678"}'`,
            }),

            endpoint({
                method: 'GET', path: '/accounts/:id',
                desc: 'Fetch details of a single account.',
                response: `{ "account": { ... }, "process": { "name": "wa-2348...", "status": "online" } }`,
                example: `curl http://${host}/accounts/<id> \\\n  -H "Authorization: Bearer ${TOKEN()}"`,
            }),

            endpoint({
                method: 'GET', path: '/accounts/:id/contacts',
                desc: 'Fetch all contacts synced in the SQLite database of a connected WhatsApp account.',
                response: `[\n  {\n    "theirJid": "2348037924270@s.whatsapp.net",\n    "firstName": "",\n    "fullName": "Philp",\n    "pushName": "Olaks",\n    "businessName": ""\n  }\n]`,
                example: `curl http://${host}/accounts/<id>/contacts \\\n  -H "Authorization: Bearer ${TOKEN()}"`,
            }),

            endpoint({
                method: 'DELETE', path: '/accounts/:id',
                desc: 'Remove an account, stop the bot, and delete auth files.',
                response: `{ "ok": true }`,
                example: `curl -X DELETE http://${host}/accounts/<id> \\\n  -H "Authorization: Bearer ${TOKEN()}"`,
            }),
        ),

        // ── Account actions ────────────────────────────────────────
        section('fi-rr-settings', 'Account Actions',
            el('p', { class: 'ep-desc' }, 'All action endpoints are ', el('code', {}, 'POST /accounts/:id/<action>'), '.'),

            endpoint({
                method: 'POST', path: '/accounts/:id/start',
                desc: 'Start the WhatsApp bot with the specified authentication mode and client.',
                body: `{\n  "mode":   "qr" | "pair",\n  "client": "chrome" | "android" | "ios"\n}`,
                response: `{ "ok": true }`,
                example: `curl -X POST http://${host}/accounts/<id>/start \\\n  -H "Authorization: Bearer ${TOKEN()}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"mode":"qr","client":"chrome"}'`,
            }),

            endpoint({
                method: 'POST', path: '/accounts/:id/stop',
                desc: 'Stop (SIGKILL) the running bot process. Status becomes "stopped".',
                response: `{ "ok": true }`,
                example: `curl -X POST http://${host}/accounts/<id>/stop \\\n  -H "Authorization: Bearer ${TOKEN()}"`,
            }),

            endpoint({
                method: 'POST', path: '/accounts/:id/restart',
                desc: 'Kill and restart the bot with the last known arguments.',
                response: `{ "ok": true }`,
                example: `curl -X POST http://${host}/accounts/<id>/restart \\\n  -H "Authorization: Bearer ${TOKEN()}"`,
            }),

            endpoint({
                method: 'POST', path: '/accounts/:id/pause',
                desc: 'Pause (SIGSTOP) the bot process without killing it.',
                response: `{ "ok": true }`,
                example: `curl -X POST http://${host}/accounts/<id>/pause \\\n  -H "Authorization: Bearer ${TOKEN()}"`,
            }),

            endpoint({
                method: 'POST', path: '/accounts/:id/resume',
                desc: 'Resume (SIGCONT) a previously paused bot.',
                response: `{ "ok": true }`,
                example: `curl -X POST http://${host}/accounts/<id>/resume \\\n  -H "Authorization: Bearer ${TOKEN()}"`,
            }),

            endpoint({
                method: 'POST', path: '/accounts/:id/logout',
                desc: 'Logout this WhatsApp session, delete all auth files, and remove the account from the database permanently.',
                response: `{ "ok": true, "deleted": true }`,
                example: `curl -X POST http://${host}/accounts/<id>/logout \\\n  -H "Authorization: Bearer ${TOKEN()}"`,
            }),
        ),

        // ── Stats ──────────────────────────────────────────────────
        section('fi-rr-chart-line-up', 'Statistics',
            endpoint({
                method: 'GET', path: '/stats',
                desc: 'Retrieve aggregate telemetry — total accounts, connected count, and per-event-type counters.',
                response: `{\n  "totalAccounts": 3,\n  "connectedCount": 2,\n  "eventCounts": { "connected": 12, "message": 540 }\n}`,
                example: `curl http://${host}/stats \\\n  -H "Authorization: Bearer ${TOKEN()}"`,
            }),
        ),

        // ── Logs ──────────────────────────────────────────────────
        section('fi-rr-document', 'Server Logs',
            endpoint({
                method: 'GET', path: '/logs',
                desc: 'Download the server log file (logs.txt) as a plain-text attachment.',
                example: `curl http://${host}/logs \\\n  -H "Authorization: Bearer ${TOKEN()}" \\\n  -o wha-http.log`,
            }),
        ),

        // ── WebSocket ──────────────────────────────────────────────
        section('fi-rr-plug', 'WebSocket Stream',
            el('p', { class: 'ep-desc' },
                'Each account has a dedicated WebSocket endpoint. Connect with your JWT as a query parameter to receive real-time events.'
            ),

            el('div', { class: 'endpoint' },
                el('div', { class: 'ep-header' },
                    badge('WS'),
                    el('code', { class: 'ep-path' }, `/ws/:accountId?token=<jwt>`),
                ),
                el('p', { class: 'ep-desc' }, 'Bidirectional stream for live events, bot logs, pairing codes, and QR data.'),
                el('p', { class: 'ep-sublabel' }, 'Connection example'),
                codeBlock(`const ws = new WebSocket('ws://${host}/ws/<accountId>?token=${TOKEN()}')`, 'js'),
                el('p', { class: 'ep-sublabel' }, 'Incoming event shape'),
                codeBlock(`{ "type": "<event_type>", "payload": { ... } }`, 'json'),
                el('p', { class: 'ep-sublabel' }, 'Event types'),
                el('div', { class: 'event-type-table' },
                    ...['connected', 'upstream_closed', 'error', 'pair_code', 'pair_qr', 'pair_success', 'pair_error', 'log', 'message', 'messages.upsert'].map(t =>
                        el('div', { class: 'event-type-row' },
                            el('code', { class: 'event-type-name' }, t),
                            el('span', { class: 'event-type-desc' }, eventTypeDesc(t)),
                        )
                    )
                ),
            ),
        ),
    )

    const root = el('div', { style: 'display:contents' }, header, main)
    return { root, cleanup: null }
}

function eventTypeDesc(t) {
    const m = {
        'connected':       'WebSocket proxy is connected to the upstream bot.',
        'upstream_closed': 'Upstream bot connection was closed.',
        'error':           'An error occurred in the proxy or bot.',
        'pair_code':       'An 8-digit pairing code was generated. payload: { code }',
        'pair_qr':         'A QR code string was generated. payload: { code }',
        'pair_success':    'Authentication succeeded.',
        'pair_error':      'Authentication failed. payload: { reason }',
        'log':             'A log line from the bot process. payload: { line }',
        'message':         'An incoming WhatsApp message.',
        'messages.upsert': 'Batch of new messages from the bot.',
    }
    return m[t] ?? ''
}
