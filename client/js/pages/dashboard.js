/** pages/dashboard.js */
import { listAccounts, addAccount, removeAccount, stats, downloadServerLogs } from '../api.js'
import { getUser, logout } from '../auth.js'
import { navigate } from '../router.js'
import { el, formHandler, statusBadge, loader, toast } from '../dom.js'

export function dashboardPage() {
    const errEl     = el('p', { class: 'alert alert-error hidden', role: 'alert' })
    const listEl    = el('div', { class: 'accounts-list' })
    const emptyEl   = el('p', { class: 'muted', style: 'padding:8px 0' }, 'No accounts yet. Add one below.')
    const loadingEl = loader()

    // ── Telemetry card (message graph only — no event counter) ──
    const statTotal     = el('span', { class: 'stat-num' }, '0')
    const statConnected = el('span', { class: 'stat-num' }, '0')

    // Dashboard-level aggregate graph (connected count over time)
    const GRAPH_W = 20
    const graphCounts = Array(GRAPH_W).fill(0)
    const dashGraphCanvas = el('canvas', { style: 'width:100%;height:80px;display:block;' })

    function drawDashGraph() {
        const canvas = dashGraphCanvas
        const dpr = window.devicePixelRatio || 1
        const W = canvas.offsetWidth || 400
        const H = 80
        canvas.width  = W * dpr
        canvas.height = H * dpr
        const ctx = canvas.getContext('2d')
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, W, H)
        const max = Math.max(...graphCounts, 1)
        const step = W / (GRAPH_W - 1)
        const pad  = 8

        const grad = ctx.createLinearGradient(0, 0, 0, H)
        grad.addColorStop(0, 'rgba(24,24,27,.12)')
        grad.addColorStop(1, 'rgba(24,24,27,.01)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.moveTo(0, H)
        for (let i = 0; i < GRAPH_W; i++) {
            const x = i * step
            const y = H - pad - ((graphCounts[i] / max) * (H - pad * 2))
            ctx.lineTo(x, y)
        }
        ctx.lineTo((GRAPH_W - 1) * step, H)
        ctx.closePath()
        ctx.fill()

        ctx.strokeStyle = '#18181b'
        ctx.lineWidth = 1.5
        ctx.lineJoin = 'round'
        ctx.beginPath()
        for (let i = 0; i < GRAPH_W; i++) {
            const x = i * step
            const y = H - pad - ((graphCounts[i] / max) * (H - pad * 2))
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.stroke()
    }

    const dlLogsBtn = el('button', { class: 'btn btn-ghost btn-sm', 'data-tip': 'Download server log file' },
        el('i', { class: 'fi fi-rr-download fi-sm' }), ' Server Logs'
    )
    dlLogsBtn.addEventListener('click', async () => {
        try { await downloadServerLogs() }
        catch (e) { toast('Failed to download logs: ' + e.message, 'error') }
    })

    const statsCard = el('div', { class: 'card stats-card' },
        el('div', { class: 'card-header' },
            el('span', {},
                el('i', { class: 'fi fi-rr-chart-line-up fi-sm', style: 'margin-right:6px' }),
                'System Overview',
            ),
            dlLogsBtn,
        ),
        el('div', { class: 'card-body stats-grid' },
            el('div', { class: 'stat-item' },
                el('label', {}, 'Total Sessions'),
                statTotal,
            ),
            el('div', { class: 'stat-item' },
                el('label', {}, 'Active Sessions'),
                statConnected,
            ),
        ),
        el('div', { style: 'padding: 0 8px 12px' }, dashGraphCanvas),
    )

    /** @type {Array<{id:string,phone:string,status:string}>} */
    let accounts = []

    function renderList() {
        listEl.innerHTML = ''
        if (accounts.length === 0) { listEl.append(emptyEl); return }
        for (const acc of accounts) {
            const removeBtn = el('button', {
                class: 'btn-danger-ghost',
                type: 'button',
                'aria-label': `Remove account ${acc.phone}`,
                'data-tip': 'Remove account',
            },
                el('i', { class: 'fi fi-rr-trash fi-sm' }),
            )

            const row = el('div', {
                class: 'account-row',
                role: 'button',
                tabindex: '0',
                'aria-label': `Account ${acc.phone}`,
            },
                el('div', { class: 'account-row-left' },
                    el('i', { class: 'fi fi-rr-whatsapp', style: 'font-size:20px;color:var(--c-text-3)' }),
                    el('span', { class: 'account-phone' }, '+' + acc.phone),
                    statusBadge(acc.status),
                ),
                removeBtn,
            )

            const nav = () => navigate(`/accounts/${acc.id}`)
            row.addEventListener('click', e => { if (e.target.closest('.btn-danger-ghost')) return; nav() })
            row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nav() } })

            removeBtn.addEventListener('click', async e => {
                e.stopPropagation()
                if (!confirm('Remove this account?')) return
                try {
                    await removeAccount(acc.id)
                    accounts = accounts.filter(a => a.id !== acc.id)
                    renderList()
                    loadTelemetry()
                } catch (err) {
                    toast(err.message, 'error')
                }
            })

            listEl.append(row)
        }
    }

    // ── Add account form ─────────────────────────────────────────
    const phoneIn = el('input', { type: 'tel', placeholder: 'e.g. 2348012345678', required: '', 'aria-label': 'Phone number', id: 'add-phone' })
    const addBtn  = el('button', { type: 'submit', class: 'btn btn-primary' },
        el('i', { class: 'fi fi-rr-plus fi-sm' }), ' Add Account'
    )
    const addForm = el('form', { class: 'add-form', novalidate: '' }, phoneIn, addBtn)

    addForm.addEventListener('submit', formHandler(async () => {
        const phone = phoneIn.value.trim()
        if (!phone) { toast('Phone number is required', 'error'); return }

        addBtn.disabled = true
        addBtn.lastChild.textContent = ' Adding…'

        try {
            const res = await addAccount(phone)
            navigate(`/accounts/${res.account.id}`)
        } catch (err) {
            toast(err.message, 'error')
        } finally {
            addBtn.disabled = false
            addBtn.lastChild.textContent = ' Add Account'
        }
    }))

    // Header
    const user = getUser()
    const header = el('header', { class: 'app-header' },
        el('span', { class: 'app-logo' }, 'WhatsRook'),
        el('div', { class: 'app-header-right' },
            el('a', { href: '#/docs', style: 'font-size:14px;font-weight:500;color:var(--c-text-2);display:flex;align-items:center;gap:5px' },
                el('i', { class: 'fi fi-rr-book fi-sm' }), 'API Docs'
            ),
            el('span', { class: 'app-email' }, user?.email ?? ''),
            el('button', { class: 'btn btn-ghost btn-sm', type: 'button', id: 'sign-out-btn' },
                el('i', { class: 'fi fi-rr-sign-out-alt fi-sm' }), ' Sign out'
            ),
        )
    )

    header.querySelector('#sign-out-btn').addEventListener('click', () => { logout(); navigate('/login') })

    const main = el('main', { class: 'app-main' },
        el('div', {},
            el('h1', { class: 'page-title' }, 'WhatsApp Accounts'),
            el('p', { class: 'page-subtitle' }, 'Manage your WhatsApp bot sessions.'),
        ),
        statsCard,
        el('div', { class: 'card', style: 'padding: 20px 22px;' },
            el('h2', { style: 'font-size:15px;font-weight:600;margin-bottom:14px;display:flex;align-items:center;gap:8px' },
                el('i', { class: 'fi fi-rr-add fi-sm' }), 'Add Account'
            ),
            addForm,
            errEl,
        ),
        el('div', { class: 'card', style: 'padding: 20px 22px;' },
            el('h2', { style: 'font-size:15px;font-weight:600;margin-bottom:14px;display:flex;align-items:center;gap:8px' },
                el('i', { class: 'fi fi-rr-list fi-sm' }), 'Your Accounts'
            ),
            loadingEl,
            listEl,
        ),
    )

    const root = el('div', { style: 'display:contents' }, header, main)

    function loadTelemetry() {
        stats().then(data => {
            const total     = data.totalAccounts   || 0
            const connected = data.connectedCount  || 0
            statTotal.textContent     = String(total)
            statConnected.textContent = String(connected)
            // push connected count to graph
            graphCounts.shift()
            graphCounts.push(connected)
            requestAnimationFrame(drawDashGraph)
        }).catch(err => console.error('telemetry error', err))
    }

    listAccounts().then(list => {
        accounts = list
        loadingEl.remove()
        renderList()
        loadTelemetry()
    }).catch(err => {
        loadingEl.remove()
        toast(err.message, 'error')
    })

    window.addEventListener('resize', drawDashGraph)

    return {
        root,
        cleanup: () => window.removeEventListener('resize', drawDashGraph),
    }
}
