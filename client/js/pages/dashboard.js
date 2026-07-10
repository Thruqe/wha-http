/** pages/dashboard.js */
import { listAccounts, addAccount, removeAccount, stats } from '../api.js'
import { getUser, logout } from '../auth.js'
import { navigate } from '../router.js'
import { el, formHandler, statusBadge } from '../dom.js'

export function dashboardPage() {
    const errEl      = el('p', { class: 'alert alert-error hidden', role: 'alert' })
    const listEl     = el('div', { class: 'accounts-list' })
    const emptyEl    = el('p', { class: 'muted' }, 'No accounts yet. Add one above.')
    const loadingEl  = el('p', { class: 'muted' }, 'Loading…')
    const phoneIn    = el('input', { type: 'tel', placeholder: '2348012345678', required: '', 'aria-label': 'Phone number' })
    const addBtn     = el('button', { type: 'submit', class: 'btn btn-primary' }, '+ Add account')

    // Telemetry Statistics DOM elements
    const statTotal = el('span', { class: 'stat-num' }, '0')
    const statConnected = el('span', { class: 'stat-num' }, '0')
    const statEvents = el('div', { class: 'event-stats-grid' })

    const statsCard = el('div', { class: 'card stats-card' },
        el('div', { class: 'card-header' }, 'System Telemetry & Metrics'),
        el('div', { class: 'card-body stats-grid' },
            el('div', { class: 'stat-item' }, el('label', {}, 'Total WhatsApp Sessions'), statTotal),
            el('div', { class: 'stat-item' }, el('label', {}, 'Active Sessions'), statConnected)
        ),
        el('div', { class: 'section-label' }, 'Events Counter (All Sessions)'),
        el('div', { class: 'card-body' }, statEvents)
    )

    /** @type {Array<{id:string,phone:string,status:string}>} */
    let accounts = []

    function renderList() {
        listEl.innerHTML = ''
        if (accounts.length === 0) {
            listEl.append(emptyEl)
            return
        }
        for (const acc of accounts) {
            const row = el('div', {
                class: 'account-row',
                role: 'button',
                tabindex: '0',
                'aria-label': `Account ${acc.phone}`,
            },
                el('div', { class: 'account-row-left' },
                    el('span', { class: 'account-phone' }, acc.phone),
                    statusBadge(acc.status),
                ),
                el('button', {
                    class: 'btn-danger-ghost',
                    type: 'button',
                    'aria-label': `Remove account ${acc.phone}`,
                }, 'Remove'),
            )

            // Navigate on row click/key
            const nav = () => navigate(`/accounts/${acc.id}`)
            row.addEventListener('click', e => {
                if (e.target.closest('.btn-danger-ghost')) return
                nav()
            })
            row.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nav() }
            })

            // Remove button
            row.querySelector('.btn-danger-ghost').addEventListener('click', async e => {
                e.stopPropagation()
                if (!confirm('Remove this account?')) return
                try {
                    await removeAccount(acc.id)
                    accounts = accounts.filter(a => a.id !== acc.id)
                    renderList()
                    loadTelemetry() // Reload telemetry stats on session removal
                } catch (err) {
                    errEl.textContent = err.message
                    errEl.classList.remove('hidden')
                }
            })

            listEl.append(row)
        }
    }

    const addForm = el('form', { class: 'add-form', novalidate: '' }, phoneIn, addBtn)
    addForm.addEventListener('submit', formHandler(async () => {
        errEl.classList.add('hidden')
        addBtn.disabled = true
        addBtn.textContent = 'Adding…'
        try {
            const phone = phoneIn.value.trim()
            const res = await addAccount(phone, 'pair', phone)
            accounts = [...accounts, res.account]
            phoneIn.value = ''
            navigate(`/accounts/${res.account.id}`)
        } catch (err) {
            errEl.textContent = err.message
            errEl.classList.remove('hidden')
        } finally {
            addBtn.disabled = false
            addBtn.textContent = '+ Add account'
        }
    }))

    // Header with API/Docs navigation
    const user = getUser()
    const header = el('header', { class: 'app-header' },
        el('span', { class: 'app-logo' }, 'WhatsRook'),
        el('div', { class: 'app-header-right' },
            el('a', { href: '#/docs', style: 'margin-right: 12px; font-size:13px; font-weight:500; color:var(--c-text-2)' }, 'API Docs'),
            el('span', { class: 'app-email' }, user?.email ?? ''),
            el('button', {
                class: 'btn btn-ghost btn-sm',
                type: 'button',
                id: 'sign-out-btn',
            }, 'Sign out'),
        )
    )

    header.querySelector('#sign-out-btn').addEventListener('click', () => {
        logout()
        navigate('/login')
    })

    const main = el('main', { class: 'app-main' },
        el('h2', { class: 'page-title' }, 'WhatsApp Accounts Dashboard'),
        statsCard,
        addForm,
        errEl,
        loadingEl,
        listEl,
    )

    const root = el('div', { style: 'display:contents' }, header, main)

    function loadTelemetry() {
        stats().then(data => {
            statTotal.textContent = String(data.totalAccounts || 0)
            statConnected.textContent = String(data.connectedCount || 0)
            statEvents.innerHTML = ''
            const counts = data.eventCounts || {}
            const keys = Object.keys(counts)
            if (keys.length === 0) {
                statEvents.append(el('p', { class: 'muted' }, 'No messages/events received yet.'))
            } else {
                for (const key of keys) {
                    statEvents.append(
                        el('div', { class: 'event-stat-badge' },
                            el('span', { class: 'event-stat-name' }, key),
                            el('span', { class: 'event-stat-count' }, String(counts[key]))
                        )
                    )
                }
            }
        }).catch(err => {
            console.error('Failed to load telemetry stats', err)
        })
    }

    // Fetch on mount
    listAccounts().then(list => {
        accounts = list
        loadingEl.remove()
        renderList()
        loadTelemetry()
    }).catch(err => {
        loadingEl.remove()
        errEl.textContent = err.message
        errEl.classList.remove('hidden')
    })

    return { root, cleanup: null }
}
