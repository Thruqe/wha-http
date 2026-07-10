// test.js — wha-http end-to-end test
// Usage: node test.js
// Set BASE, EMAIL, PASSWORD, PHONE, PAIR_PHONE at the top or via env

const BASE = process.env.BASE || 'http://localhost:8080'
const WS_BASE = process.env.WS_BASE || 'ws://localhost:8080'
const EMAIL = process.env.EMAIL || 'test@example.com'
const PASSWORD = process.env.PASSWORD || 'password123'
const PHONE = process.env.PHONE || '2348000000000' // session identifier
const PAIR_PHONE = process.env.PAIR_PHONE || '2348000000000' // phone to send pair code to
const MODE = process.env.MODE || 'pair' // "qr" or "pair"

let token = null
let accountID = null

// ── helpers ────────────────────────────────────────────────────────────────

function log(tag, msg, data) {
	const ts = new Date().toISOString().slice(11, 23)
	const extra = data !== undefined ? ' ' + JSON.stringify(data) : ''
	console.log(`[${ts}] [${tag}]${extra ? ' ' + msg + extra : ' ' + msg}`)
}

async function api(method, path, body) {
	const headers = { 'Content-Type': 'application/json' }
	if (token) headers['Authorization'] = 'Bearer ' + token
	const res = await fetch(BASE + path, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
	})
	const text = await res.text()
	let json
	try {
		json = JSON.parse(text)
	} catch {
		json = { raw: text }
	}
	return { status: res.status, body: json }
}

function assert(label, condition, got) {
	if (condition) {
		log('PASS', label)
	} else {
		log('FAIL', label, got)
		process.exit(1)
	}
}

// ── steps ──────────────────────────────────────────────────────────────────

async function stepRegisterOrLogin() {
	log('TEST', 'Register or login')

	let res = await api('POST', '/auth/register', { email: EMAIL, password: PASSWORD })
	if (res.status === 409) {
		log('INFO', 'Email already registered, logging in instead')
		res = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD })
	}
	assert('auth returns 200/201', res.status === 200 || res.status === 201, res)
	assert('token present', typeof res.body.token === 'string', res.body)
	token = res.body.token
	log('INFO', 'token acquired')
}

async function stepMe() {
	log('TEST', 'GET /auth/me')
	const res = await api('GET', '/auth/me')
	assert('/auth/me returns 200', res.status === 200, res)
	assert('userId present', typeof res.body.userId === 'string', res.body)
	log('INFO', 'me', res.body)
}

async function stepListAccounts() {
	log('TEST', 'GET /accounts')
	const res = await api('GET', '/accounts')
	assert('/accounts returns 200', res.status === 200, res)
	assert('accounts is array', Array.isArray(res.body), res.body)
	log('INFO', `found ${res.body.length} existing account(s)`)
}

async function stepAddAccount() {
	log('TEST', `POST /accounts (mode=${MODE})`)
	const body = { phone: PHONE, mode: MODE }
	if (MODE === 'pair') body.pairPhone = PAIR_PHONE
	const res = await api('POST', '/accounts', body)
	if (res.status === 409) {
		log('WARN', 'account already running — fetching existing accounts to grab ID')
		const list = await api('GET', '/accounts')
		const existing = list.body.find((a) => a.phone === PHONE)
		assert('found existing account', !!existing, list.body)
		accountID = existing.id
		log('INFO', 'reusing account', { id: accountID })
		return
	}
	assert('add account returns 201', res.status === 201, res)
	assert('account.id present', typeof res.body.account?.id === 'string', res.body)
	accountID = res.body.account.id
	log('INFO', 'account created', { id: accountID, status: res.body.account.status })
}

async function stepGetAccount() {
	log('TEST', `GET /accounts/${accountID}`)
	const res = await api('GET', `/accounts/${accountID}`)
	assert('get account returns 200', res.status === 200, res)
	assert('account.id matches', res.body.account?.id === accountID, res.body)
	log('INFO', 'account', { status: res.body.account.status, process: res.body.process?.status })
}

async function stepWebSocket() {
	log('TEST', `WS /ws/${accountID} — waiting for pair_code or pair_qr (30s timeout)`)

	return new Promise((resolve, reject) => {
		const { WebSocket } = require('ws')
		const ws = new WebSocket(`${WS_BASE}/ws/${accountID}`, {
			headers: { Authorization: 'Bearer ' + token },
		})

		const timeout = setTimeout(() => {
			ws.close()
			reject(new Error('timed out waiting for pair_code/pair_qr event'))
		}, 30_000)

		ws.on('open', () => log('INFO', 'ws connected'))

		ws.on('message', (raw) => {
			let evt
			try {
				evt = JSON.parse(raw)
			} catch {
				return
			}
			log('EVENT', evt.type, evt.payload)

			if (evt.type === 'pair_code') {
				clearTimeout(timeout)
				log('PASS', 'received pair_code event')
				log('INFO', '>>> Enter this code on your phone:', evt.payload)
				ws.close()
				resolve()
			} else if (evt.type === 'pair_qr') {
				clearTimeout(timeout)
				log('PASS', 'received pair_qr event')
				log('INFO', '>>> QR code:', evt.payload?.code?.slice(0, 40) + '...')
				ws.close()
				resolve()
			} else if (evt.type === 'pair_success') {
				clearTimeout(timeout)
				log('PASS', 'pair_success — already paired!')
				ws.close()
				resolve()
			} else if (evt.type === 'error') {
				clearTimeout(timeout)
				ws.close()
				reject(new Error('server error event: ' + JSON.stringify(evt.payload)))
			}
		})

		ws.on('error', (err) => {
			clearTimeout(timeout)
			reject(err)
		})

		ws.on('close', (code) => {
			log('INFO', 'ws closed', { code })
		})
	})
}

async function stepHooks() {
	log('TEST', `POST /accounts/${accountID}/hooks`)
	const res = await api('POST', `/accounts/${accountID}/hooks`, {
		targetUrl: 'https://webhook.site/test-wha-http',
	})
	assert('create hook returns 201', res.status === 201, res)
	const hookID = res.body.id
	assert('hook.id present', typeof hookID === 'string', res.body)
	log('INFO', 'hook created', { id: hookID })

	const list = await api('GET', `/accounts/${accountID}/hooks`)
	assert('list hooks returns 200', list.status === 200, list)
	assert(
		'hook appears in list',
		list.body.some((h) => h.id === hookID),
		list.body
	)
	log('PASS', 'hook listed')

	const del = await api('DELETE', `/accounts/${accountID}/hooks/${hookID}`)
	assert('delete hook returns 200', del.status === 200, del)
	log('PASS', 'hook deleted')
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
	log('INFO', `target: ${BASE}`)
	log('INFO', `phone: ${PHONE} | mode: ${MODE}`)
	console.log('─'.repeat(60))

	await stepRegisterOrLogin()
	await stepMe()
	await stepListAccounts()
	await stepAddAccount()
	await stepGetAccount()
	await stepHooks()
	await stepWebSocket()

	console.log('─'.repeat(60))
	log('INFO', 'all tests passed')
}

main().catch((err) => {
	log('FATAL', err.message)
	process.exit(1)
})
