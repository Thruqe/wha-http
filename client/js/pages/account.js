/** pages/account.js */
import { getAccount, stopAccount, restartAccount } from '../api.js'
import { navigate } from '../router.js'
import { createAccountSocket } from '../ws.js'
import { el, statusBadge } from '../dom.js'

/**
 * @param {string} id  account ID from the URL
 */
export function accountPage(id) {
    // ── State refs ────────────────────────────────────────────────
    /** @type {{ id:string, phone:string, status:string }|null} */
    let account = null
    let wsStatus = 'connecting'
    let pairCode = null
    let pairQr   = null
    let pairStatus = 'idle'   // idle | pending | success | error
    let pairError  = null

    // ── Reusable DOM nodes ────────────────────────────────────────
    const errEl = el('p', { class: 'alert alert-error hidden', role: 'alert' })

    // Account hero
    const phoneEl    = el('p', { class: 'account-phone-lg' })
    const accBadge   = el('span', { class: 'badge' })
    const wsBadge    = el('span', { class: 'badge' })
    const stopBtn    = el('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Stop')
    const restartBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Restart')

    stopBtn.addEventListener('click', async () => {
        try { await stopAccount(id); const r = await getAccount(id); updateAccount(r.account) }
        catch (e) { showErr(e.message) }
    })
    restartBtn.addEventListener('click', async () => {
        try { await restartAccount(id); const r = await getAccount(id); updateAccount(r.account) }
        catch (e) { showErr(e.message) }
    })

    const heroCard = el('div', { class: 'card account-hero' },
        el('div', {},
            phoneEl,
            el('div', { class: 'account-hero-badges' }, accBadge, wsBadge),
        ),
        el('div', { class: 'account-hero-actions' }, stopBtn, restartBtn),
    )

    // Pairing panel
    const pairPanel      = el('div', { class: 'alert alert-warn hidden' })
    const pairSuccessEl  = el('div', { class: 'alert alert-ok  hidden' }, 'Paired successfully!')
    const pairErrEl      = el('div', { class: 'alert alert-error hidden' })

    // Event log
    const eventLogEl = el('div', { class: 'event-log' },
        el('p', { class: 'muted', style: 'padding:12px 20px' }, 'Waiting for events…')
    )
    /** @type {Array<{type:string, payload:object, ts:number}>} */
    const events = []
    const MAX_EVENTS = 100

    function addEvent(msg) {
        events.unshift({ ...msg, ts: Date.now() })
        if (events.length > MAX_EVENTS) events.length = MAX_EVENTS

        // Replace placeholder
        const placeholder = eventLogEl.querySelector('.muted')
        if (placeholder) placeholder.remove()

        const row = el('div', { class: 'event-row' },
            el('span', { class: 'event-time' }, new Date().toLocaleTimeString()),
            el('span', { class: 'event-type' }, msg.type),
            el('span', { class: 'event-payload' }, JSON.stringify(msg.payload)),
        )
        eventLogEl.prepend(row)
        // Trim DOM nodes to cap memory
        while (eventLogEl.children.length > MAX_EVENTS) {
            eventLogEl.lastChild.remove()
        }
    }

    const eventsCard = el('div', { class: 'card' },
        el('div', { class: 'card-header' }, 'Live Events Telemetry Stream'),
        eventLogEl,
    )

    // Header
    const header = el('header', { class: 'app-header' },
        el('button', { class: 'back-link', type: 'button', 'aria-label': 'Back to dashboard' }, '← Back'),
        el('span', { class: 'app-logo' }, 'WhatsRook'),
        el('div', {}), // spacer for flex layout
    )
    header.querySelector('.back-link').addEventListener('click', () => navigate('/dashboard'))

    const main = el('main', { class: 'app-main' },
        errEl, heroCard, pairSuccessEl, pairErrEl, pairPanel, eventsCard,
    )

    const root = el('div', { style: 'display:contents' }, header, main)

    // ── Helpers ───────────────────────────────────────────────────
    function showErr(msg) {
        errEl.textContent = msg
        errEl.classList.remove('hidden')
    }

    function updateAccount(acc) {
        account = acc
        phoneEl.textContent = acc.phone
        // Update account status badge
        setBadge(accBadge, acc.status)
    }

    function setBadge(node, status) {
        node.className = 'badge badge-' + (
            status === 'connected'    ? 'connected'    :
            status === 'disconnected' ? 'disconnected' :
            status === 'connecting'   ? 'connecting'   :
            status === 'error'        ? 'error'        : 'pending'
        )
        node.textContent = status.replace('_', ' ')
    }

    function updatePairPanel() {
        pairPanel.innerHTML = ''
        const isPending = (account?.status === 'pending_qr' || account?.status === 'pending_pair')
                       && pairStatus !== 'success'
        pairPanel.classList.toggle('hidden', !isPending)

        if (!isPending) return
        pairPanel.append(el('strong', {}, 'Waiting for pairing'))
        if (pairCode) {
            pairPanel.append(
                el('p', { style: 'margin-top:4px;font-size:12px' }, 'Enter this code on your phone:'),
                el('p', { class: 'pair-code' }, pairCode),
            )
        } else if (pairQr) {
            pairPanel.append(
                el('p', { style: 'margin-top:4px;font-size:12px' }, 'Scan this QR code:'),
                el('pre', { class: 'pair-qr' }, pairQr),
            )
        } else {
            pairPanel.append(el('p', { style: 'margin-top:4px;font-size:12px' }, 'Connecting to WhatsApp…'))
        }
    }

    // ── WebSocket + data load ─────────────────────────────────────
    let socket = null
    let unsub  = null

    getAccount(id).then(accRes => {
        updateAccount(accRes.account)
        setBadge(wsBadge, wsStatus)

        socket = createAccountSocket(id)
        unsub  = socket.subscribe(msg => {
            if (msg.type === 'connected')      { wsStatus = 'connected';    setBadge(wsBadge, 'connected')    }
            if (msg.type === 'upstream_closed'){ wsStatus = 'disconnected'; setBadge(wsBadge, 'disconnected') }
            if (msg.type === 'error')          { wsStatus = 'error';        setBadge(wsBadge, 'error')        }

            if (msg.type === 'pair_code')  { pairCode = msg.payload.code; pairStatus = 'pending'; updatePairPanel() }
            if (msg.type === 'pair_qr')    { pairQr   = msg.payload.code; pairStatus = 'pending'; updatePairPanel() }

            if (msg.type === 'pair_success' || msg.type === 'connected') {
                pairStatus = 'success'; pairCode = null; pairQr = null
                updateAccount({ ...account, status: 'connected' })
                pairSuccessEl.classList.remove('hidden')
                updatePairPanel()
            }
            if (msg.type === 'pair_error') {
                pairStatus = 'error'; pairError = msg.payload.reason
                pairErrEl.textContent = `Pairing failed: ${pairError}`
                pairErrEl.classList.remove('hidden')
            }

            addEvent(msg)
        })
    }).catch(err => showErr(err.message))

    // Cleanup: close socket when navigating away
    function cleanup() {
        unsub?.()
        socket?.close()
    }

    return { root, cleanup }
}
