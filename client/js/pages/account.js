/** pages/account.js */
import { getAccount, stopAccount, restartAccount, pauseAccount, resumeAccount, logoutAccount, startAccount } from '../api.js'
import { navigate } from '../router.js'
import { createAccountSocket } from '../ws.js'
import { el, statusBadge, loader, openModal, toast, spinner } from '../dom.js'

/** @param {string} id — account ID from the URL */
export function accountPage(id) {
    // ── State ─────────────────────────────────────────────────────
    let account    = null
    let wsStatus   = 'connecting'
    let pairCode   = null
    let pairQr     = null
    let pairStatus = 'idle'   // idle | pending | success | error
    let socket     = null
    let unsub      = null

    const botLogs  = []
    const events   = []
    const MAX      = 100

    // ── Message graph state ───────────────────────────────────────
    const MSG_WINDOW = 20   // keep last N data points
    const msgCounts  = Array(MSG_WINDOW).fill(0)
    const msgLabels  = Array(MSG_WINDOW).fill('')
    let   msgTotal   = 0

    // ── DOM ───────────────────────────────────────────────────────
    const errEl      = el('p',  { class: 'alert alert-error hidden', role: 'alert' })
    const successEl  = el('div', { class: 'alert alert-ok hidden' }, '✓ Paired & connected successfully!')
    const phoneEl    = el('p',  { class: 'account-phone-lg' })
    const accBadge   = el('span', { class: 'badge' })
    const wsBadge    = el('span', { class: 'badge' })

    // ── Control Buttons (Flaticon icons) ──────────────────────────
    function makeCtrlBtn(iconClass, label, tip, danger = false) {
        return el('button', {
            class: danger ? 'btn btn-danger-ghost btn-sm' : 'btn btn-ghost btn-sm',
            type: 'button',
            'data-tip': tip,
        },
            el('i', { class: iconClass + ' fi fi-sm' }),
            label,
        )
    }
    const stopBtn    = makeCtrlBtn('fi-rr-stop-circle',    'Stop',    'Stop the bot process')
    const pauseBtn   = makeCtrlBtn('fi-rr-pause-circle',   'Pause',   'Freeze the bot (SIGSTOP)')
    const resumeBtn  = makeCtrlBtn('fi-rr-play-circle',    'Resume',  'Resume a paused bot (SIGCONT)')
    const restartBtn = makeCtrlBtn('fi-rr-rotate-right',   'Restart', 'Kill and restart the bot')
    const logoutBtn  = makeCtrlBtn('fi-rr-sign-out-alt',   'Logout',  'Logout & delete this account', true)

    async function ctrlAction(btn, action) {
        btn.disabled = true
        const sp = spinner()
        btn.prepend(sp)
        try {
            await action()
            const r = await getAccount(id)
            updateAccount(r.account)
        } catch (e) {
            toast(e.message, 'error')
        } finally {
            sp.remove()
            btn.disabled = false
        }
    }

    stopBtn.addEventListener('click',    () => ctrlAction(stopBtn,    () => stopAccount(id)))
    pauseBtn.addEventListener('click',   () => ctrlAction(pauseBtn,   () => pauseAccount(id)))
    resumeBtn.addEventListener('click',  () => ctrlAction(resumeBtn,  () => resumeAccount(id)))
    restartBtn.addEventListener('click', () => ctrlAction(restartBtn, () => restartAccount(id)))
    logoutBtn.addEventListener('click',  async () => {
        const confirmed = await confirmModal(
            'Logout & Delete Account',
            'This will logout from WhatsApp, delete all session files, and remove this account permanently. Are you sure?'
        )
        if (!confirmed) return
        logoutBtn.disabled = true
        const sp = spinner()
        logoutBtn.prepend(sp)
        try {
            await logoutAccount(id)
            toast('Account deleted successfully', 'ok')
            navigate('/dashboard')
        } catch (e) {
            toast(e.message, 'error')
            sp.remove()
            logoutBtn.disabled = false
        }
    })

    const heroCard = el('div', { class: 'card account-hero' },
        el('div', {},
            phoneEl,
            el('div', { class: 'account-hero-badges' }, accBadge, wsBadge),
        ),
        el('div', { class: 'account-hero-actions' }, stopBtn, pauseBtn, resumeBtn, restartBtn, logoutBtn),
    )

    // ── Config Hub (shown when stopped) ───────────────────────────
    let selectedMode   = 'qr'
    let selectedClient = 'chrome'

    const qrOpt = el('div', { class: 'mode-opt selected', role: 'button', tabindex: '0' },
        el('i', { class: 'fi fi-rr-qrcode fi-xl mode-opt-icon' }),
        el('span', { class: 'mode-opt-label' }, 'QR Code'),
        el('span', { class: 'mode-opt-desc' }, 'Scan with WhatsApp camera'),
    )
    const pairOpt = el('div', { class: 'mode-opt', role: 'button', tabindex: '0' },
        el('i', { class: 'fi fi-rr-smartphone fi-xl mode-opt-icon' }),
        el('span', { class: 'mode-opt-label' }, 'Pairing Code'),
        el('span', { class: 'mode-opt-desc' }, 'Enter 8-digit code on phone'),
    )

    function setMode(m) {
        selectedMode = m
        qrOpt.classList.toggle('selected', m === 'qr')
        pairOpt.classList.toggle('selected', m === 'pair')
    }
    qrOpt.addEventListener('click',     () => setMode('qr'))
    pairOpt.addEventListener('click',   () => setMode('pair'))
    qrOpt.addEventListener('keydown',   e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMode('qr') } })
    pairOpt.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMode('pair') } })

    const clients = [
        { value: 'chrome',  label: 'Chrome',  icon: 'fi-rr-browser' },
        { value: 'android', label: 'Android', icon: 'fi-rr-smartphone' },
        { value: 'ios',     label: 'iOS',     icon: 'fi-brands-apple' },
    ]
    const clientOptEls = {}
    const clientOptionsEl = el('div', { class: 'client-options' })
    for (const c of clients) {
        const opt = el('div', { class: c.value === 'chrome' ? 'client-opt selected' : 'client-opt', role: 'button', tabindex: '0' },
            el('i', { class: `fi ${c.icon} fi-xl client-opt-icon` }),
            el('span', { class: 'client-opt-label' }, c.label),
        )
        opt.addEventListener('click', () => {
            selectedClient = c.value
            for (const [v, o] of Object.entries(clientOptEls)) {
                o.classList.toggle('selected', v === c.value)
            }
        })
        opt.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opt.click() } })
        clientOptEls[c.value] = opt
        clientOptionsEl.append(opt)
    }

    const configStartBtn = el('button', { class: 'btn btn-primary btn-full', type: 'button' },
        el('i', { class: 'fi fi-rr-power' }), 'Start & Authenticate Bot'
    )
    configStartBtn.addEventListener('click', async () => {
        configStartBtn.disabled = true
        const sp = spinner()
        configStartBtn.prepend(sp)
        try {
            await startAccount(id, selectedMode, selectedClient)
            const r = await getAccount(id)
            updateAccount(r.account)
            connectWs()
        } catch (err) {
            toast(err.message, 'error')
        } finally {
            sp.remove()
            configStartBtn.disabled = false
        }
    })

    const configCard = el('div', { class: 'card hidden' },
        el('div', { class: 'card-header' },
            el('i', { class: 'fi fi-rr-settings' }), ' Bot Configuration & Authentication'
        ),
        el('div', { class: 'config-hub' },
            el('div', {},
                el('p', { class: 'config-hub-title' }, 'Set up your WhatsApp connection'),
                el('p', { class: 'config-hub-desc' }, 'Choose how to link your phone and which WhatsApp client profile to use.'),
            ),
            el('div', { class: 'config-section' },
                el('span', { class: 'config-section-label' }, 'Authentication Method'),
                el('div', { class: 'mode-options' }, qrOpt, pairOpt),
            ),
            el('div', { class: 'config-section' },
                el('span', { class: 'config-section-label' }, 'WhatsApp Client'),
                clientOptionsEl,
            ),
            configStartBtn,
        ),
    )

    // ── Pair / QR panel ───────────────────────────────────────────
    const pairPanel = el('div', { class: 'card hidden' },
        el('div', { class: 'card-header' },
            el('i', { class: 'fi fi-rr-mobile' }), ' Scan to Authenticate'
        ),
    )
    const pairBody = el('div', { class: 'pair-section' })
    pairPanel.append(pairBody)

    function updatePairPanel() {
        pairBody.innerHTML = ''
        const isPending = (account?.status === 'pending_qr' || account?.status === 'pending_pair')
                       && pairStatus !== 'success'
        pairPanel.classList.toggle('hidden', !isPending)
        if (!isPending) return

        if (pairCode) {
            pairBody.append(
                el('p', { class: 'pair-section-title' }, 'Enter this code on your phone'),
                el('p', { class: 'pair-code' }, pairCode),
                el('p', { class: 'pair-hint' }, 'WhatsApp → Settings → Linked Devices → Link a Device → enter code above.'),
            )
        } else if (pairQr) {
            const canvas = el('canvas', { class: 'pair-qr-canvas', width: '220', height: '220' })
            pairBody.append(
                el('p', { class: 'pair-section-title' }, 'Scan with WhatsApp Camera'),
                canvas,
                el('p', { class: 'pair-hint' }, 'WhatsApp → Settings → Linked Devices → Link a Device → scan above.'),
            )
            if (typeof QRious !== 'undefined') {
                new QRious({ element: canvas, value: pairQr, size: 220, padding: 10, background: '#fff' })
            }
        } else {
            pairBody.append(loader(), el('p', { class: 'pair-hint' }, 'Waiting for WhatsApp to generate your code…'))
        }
    }

    // ── Message graph (Canvas sparkline) ─────────────────────────
    const graphCanvas = el('canvas', {
        id: 'msg-graph',
        style: 'width:100%;height:120px;display:block;',
    })
    const msgTotalEl  = el('span', { class: 'stat-num', style: 'font-size:22px' }, '0')
    const msgRateEl   = el('span', { style: 'font-size:12px;color:var(--c-text-3);margin-top:2px' }, 'messages received')

    function drawGraph() {
        const canvas = graphCanvas
        const dpr = window.devicePixelRatio || 1
        const W = canvas.offsetWidth || 400
        const H = 120
        canvas.width  = W * dpr
        canvas.height = H * dpr
        const ctx = canvas.getContext('2d')
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, W, H)

        const max = Math.max(...msgCounts, 1)
        const step = W / (MSG_WINDOW - 1)
        const pad  = 12

        // gradient fill
        const grad = ctx.createLinearGradient(0, 0, 0, H)
        grad.addColorStop(0,   'rgba(24,24,27,.18)')
        grad.addColorStop(1,   'rgba(24,24,27,.01)')
        ctx.fillStyle = grad

        ctx.beginPath()
        ctx.moveTo(0, H)
        for (let i = 0; i < MSG_WINDOW; i++) {
            const x = i * step
            const y = H - pad - ((msgCounts[i] / max) * (H - pad * 2))
            if (i === 0) ctx.lineTo(x, y)
            else         ctx.lineTo(x, y)
        }
        ctx.lineTo((MSG_WINDOW - 1) * step, H)
        ctx.closePath()
        ctx.fill()

        // line
        ctx.strokeStyle = '#18181b'
        ctx.lineWidth   = 2
        ctx.lineJoin    = 'round'
        ctx.beginPath()
        for (let i = 0; i < MSG_WINDOW; i++) {
            const x = i * step
            const y = H - pad - ((msgCounts[i] / max) * (H - pad * 2))
            if (i === 0) ctx.moveTo(x, y)
            else         ctx.lineTo(x, y)
        }
        ctx.stroke()

        // dot at latest
        const lx = (MSG_WINDOW - 1) * step
        const ly = H - pad - ((msgCounts[MSG_WINDOW - 1] / max) * (H - pad * 2))
        ctx.beginPath()
        ctx.arc(lx, ly, 4, 0, Math.PI * 2)
        ctx.fillStyle = '#18181b'
        ctx.fill()
    }

    function recordMessage() {
        msgTotal++
        msgCounts.shift()
        msgCounts.push(msgCounts[msgCounts.length - 1] + 1 || 1)
        // decay: reset each minute slot
        msgTotalEl.textContent = String(msgTotal)
        drawGraph()
    }

    const graphCard = el('div', { class: 'card' },
        el('div', { class: 'card-header' },
            el('span', {},
                el('i', { class: 'fi fi-rr-chart-line-up fi-sm', style: 'margin-right:6px' }),
                'Message Activity',
            ),
            el('div', { style: 'display:flex;flex-direction:column;align-items:flex-end' },
                msgTotalEl,
                msgRateEl,
            ),
        ),
        el('div', { style: 'padding: 0 4px 8px' }, graphCanvas),
    )

    // ── Event log ─────────────────────────────────────────────────
    const eventLogEl = el('div', { class: 'event-log' },
        el('p', { class: 'muted', style: 'padding: 14px 22px' }, 'Waiting for events…')
    )

    function addEvent(msg) {
        events.unshift({ ...msg, ts: Date.now() })
        if (events.length > MAX) events.length = MAX
        const ph = eventLogEl.querySelector('.muted')
        if (ph) ph.remove()
        const row = el('div', { class: 'event-row' },
            el('span', { class: 'event-time' }, new Date().toLocaleTimeString()),
            el('span', { class: 'event-type' }, msg.type),
            el('span', { class: 'event-payload' }, JSON.stringify(msg.payload ?? {})),
        )
        eventLogEl.prepend(row)
        while (eventLogEl.children.length > MAX) eventLogEl.lastChild.remove()

        // count messages for the graph
        if (msg.type === 'message' || msg.type === 'msg' || msg.type === 'messages.upsert') {
            recordMessage()
        }
    }

    const downloadEventsBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-tip': 'Export events as JSON' },
        el('i', { class: 'fi fi-rr-download fi-sm' }), ' Export'
    )
    downloadEventsBtn.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `events-${account?.phone || id}.json`; a.click()
        URL.revokeObjectURL(url)
    })

    const eventsCard = el('div', { class: 'card' },
        el('div', { class: 'card-header' },
            el('span', {},
                el('i', { class: 'fi fi-rr-pulse fi-sm', style: 'margin-right:6px' }),
                'Live Events Telemetry',
            ),
            downloadEventsBtn,
        ),
        eventLogEl,
    )

    // ── Bot console logs ──────────────────────────────────────────
    const logConsoleEl = el('div', { class: 'log-console' },
        el('p', { class: 'muted', style: 'padding: 14px 22px' }, 'No log lines yet…'),
    )

    function stripAnsi(t) {
        return t.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    }
    function appendBotLog(line) {
        const clean = stripAnsi(line)
        botLogs.push(clean)
        if (botLogs.length > 500) botLogs.shift()
        const ph = logConsoleEl.querySelector('.muted')
        if (ph) ph.remove()
        logConsoleEl.append(el('div', { class: 'log-row' }, clean))
        logConsoleEl.scrollTop = logConsoleEl.scrollHeight
    }

    const dlLogsBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-tip': 'Download bot session logs' },
        el('i', { class: 'fi fi-rr-download fi-sm' }), ' Save Logs'
    )
    dlLogsBtn.addEventListener('click', () => {
        const blob = new Blob([botLogs.join('\n')], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `bot-${account?.phone || id}.log`; a.click()
        URL.revokeObjectURL(url)
    })

    const logsCard = el('div', { class: 'card' },
        el('div', { class: 'card-header' },
            el('span', {},
                el('i', { class: 'fi fi-rr-terminal fi-sm', style: 'margin-right:6px' }),
                'Bot Console Logs',
            ),
            dlLogsBtn,
        ),
        logConsoleEl,
    )

    // ── Page skeleton ─────────────────────────────────────────────
    const header = el('header', { class: 'app-header' },
        el('button', { class: 'back-link', type: 'button', 'aria-label': 'Back to dashboard' },
            el('i', { class: 'fi fi-rr-arrow-left fi-sm' }), ' Back'
        ),
        el('span', { class: 'app-logo' }, 'WhatsRook'),
        el('div', {}),
    )
    header.querySelector('.back-link').addEventListener('click', () => navigate('/dashboard'))

    const pageLoader = loader()
    const main = el('main', { class: 'app-main' }, errEl, pageLoader)
    const root = el('div', { style: 'display:contents' }, header, main)

    // ── Helpers ───────────────────────────────────────────────────
    function showErr(msg) {
        errEl.textContent = msg
        errEl.classList.remove('hidden')
    }

    function setBadge(node, status) {
        const cls =
            status === 'connected'    ? 'connected'    :
            status === 'disconnected' ? 'disconnected' :
            status === 'stopped'      ? 'disconnected' :
            status === 'paused'       ? 'connecting'   :
            status === 'connecting'   ? 'connecting'   :
            status === 'error'        ? 'error'        : 'pending'
        node.className = `badge badge-${cls}`
        node.textContent = status.replace(/_/g, ' ')
    }

    function updateAccount(acc) {
        account = acc
        phoneEl.textContent = '+' + acc.phone
        setBadge(accBadge, acc.status)

        const isStopped = acc.status === 'stopped'
        const isPending = acc.status === 'pending_qr' || acc.status === 'pending_pair'

        configCard.classList.toggle('hidden',  !isStopped)
        pairPanel.classList.toggle('hidden',   !isPending)
        graphCard.classList.toggle('hidden',    isStopped)
        eventsCard.classList.toggle('hidden',   isStopped)
        logsCard.classList.toggle('hidden',     isStopped)

        stopBtn.disabled    = isStopped
        pauseBtn.disabled   = isStopped || acc.status === 'paused'
        resumeBtn.disabled  = acc.status !== 'paused'
        restartBtn.disabled = isStopped
        logoutBtn.disabled  = false  // always available — it deletes the account

        if (isPending) updatePairPanel()

        // resize graph canvas after layout
        if (!isStopped) requestAnimationFrame(drawGraph)
    }

    function confirmModal(title, message) {
        return new Promise(resolve => {
            const yesBtn = el('button', { class: 'btn btn-primary', type: 'button' }, 'Yes, continue')
            const noBtn  = el('button', { class: 'btn btn-ghost',   type: 'button' }, 'Cancel')
            const body   = el('p', { style: 'font-size:14px;color:var(--c-text-2);line-height:1.6' }, message)
            const footer = el('div', { class: 'modal-footer' }, noBtn, yesBtn)
            const { close } = openModal({ title, body, footer })
            yesBtn.addEventListener('click', () => { close(); resolve(true) })
            noBtn.addEventListener('click',  () => { close(); resolve(false) })
        })
    }

    // ── WebSocket ─────────────────────────────────────────────────
    function connectWs() {
        if (socket) return
        socket = createAccountSocket(id)
        unsub = socket.subscribe(msg => {
            if (msg.type === 'connected')       { wsStatus = 'connected';    setBadge(wsBadge, 'connected') }
            if (msg.type === 'upstream_closed') { wsStatus = 'disconnected'; setBadge(wsBadge, 'disconnected') }
            if (msg.type === 'error')           { wsStatus = 'error';        setBadge(wsBadge, 'error') }

            if (msg.type === 'pair_code') { pairCode = msg.payload?.code; pairStatus = 'pending'; updatePairPanel(); return }
            if (msg.type === 'pair_qr')   { pairQr   = msg.payload?.code; pairStatus = 'pending'; updatePairPanel(); return }

            if (msg.type === 'pair_success') {
                pairStatus = 'success'; pairCode = null; pairQr = null
                updateAccount({ ...account, status: 'connected' })
                successEl.classList.remove('hidden')
                updatePairPanel()
                return
            }
            if (msg.type === 'pair_error') {
                pairStatus = 'error'
                toast('Pairing failed: ' + (msg.payload?.reason ?? 'unknown'), 'error')
                return
            }
            if (msg.type === 'log') { appendBotLog(msg.payload?.line ?? ''); return }

            addEvent(msg)
        })
    }

    // ── Boot ──────────────────────────────────────────────────────
    getAccount(id).then(accRes => {
        pageLoader.remove()
        main.append(errEl, heroCard, successEl, configCard, pairPanel, graphCard, eventsCard, logsCard)
        updateAccount(accRes.account)
        setBadge(wsBadge, wsStatus)
        connectWs()
    }).catch(err => { pageLoader.remove(); showErr(err.message) })

    window.addEventListener('resize', drawGraph)

    function cleanup() {
        unsub?.(); socket?.close(); socket = null
        window.removeEventListener('resize', drawGraph)
    }
    return { root, cleanup }
}
