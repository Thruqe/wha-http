/** pages/docs.js */
import { el } from '../dom.js'
import { navigate } from '../router.js'

export function docsPage() {
    // Header
    const header = el('header', { class: 'app-header' },
        el('button', { class: 'back-link', type: 'button' }, '← Dashboard'),
        el('span', { class: 'app-logo' }, 'WhatsRook'),
        el('div', {})
    )
    header.querySelector('.back-link').addEventListener('click', () => navigate('/dashboard'))

    const main = el('main', { class: 'app-main' },
        el('h2', { class: 'page-title' }, 'WhatsRook API Documentation'),
        
        el('div', { class: 'card', style: 'margin-bottom: 20px' },
            el('div', { class: 'card-header' }, 'Authentication'),
            el('div', { class: 'card-body' },
                el('p', {}, 'All API endpoints (except /auth/register and /auth/login) require authorization via JWT.'),
                el('pre', { style: 'background: var(--c-bg); padding: 10px; border-radius: var(--radius); margin-top: 10px; font-family: var(--font-mono); font-size:12px' }, 
                   'Authorization: Bearer <your_token>'
                )
            )
        ),

        el('div', { class: 'card', style: 'margin-bottom: 20px' },
            el('div', { class: 'card-header' }, 'Endpoints Reference'),
            el('div', { class: 'card-body', style: 'display:flex; flex-direction:column; gap:16px' },
                el('div', {},
                    el('strong', {}, 'POST /auth/register'),
                    el('p', { style: 'color: var(--c-text-2); font-size:13px' }, 'Registers a new account. Body: { "email": "...", "password": "..." }')
                ),
                el('div', {},
                    el('strong', {}, 'POST /auth/login'),
                    el('p', { style: 'color: var(--c-text-2); font-size:13px' }, 'Returns a JWT token. Body: { "email": "...", "password": "..." }')
                ),
                el('div', {},
                    el('strong', {}, 'GET /accounts'),
                    el('p', { style: 'color: var(--c-text-2); font-size:13px' }, 'Lists all WhatsApp sessions associated with the user.')
                ),
                el('div', {},
                    el('strong', {}, 'POST /accounts'),
                    el('p', { style: 'color: var(--c-text-2); font-size:13px' }, 'Adds a new WhatsApp session. Body: { "phone": "...", "mode": "qr" | "pair" }')
                ),
                el('div', {},
                    el('strong', {}, 'GET /stats'),
                    el('p', { style: 'color: var(--c-text-2); font-size:13px' }, 'Retrieve telemetry statistics and events counter.')
                )
            )
        ),

        el('div', { class: 'card' },
            el('div', { class: 'card-header' }, 'Control WebSocket Events'),
            el('div', { class: 'card-body' },
                el('p', {}, 'Establish connection via WebSocket:'),
                el('pre', { style: 'background: var(--c-bg); padding: 10px; border-radius: var(--radius); margin-top: 10px; font-family: var(--font-mono); font-size:12px' }, 
                   'ws://<host>/ws/<accountId>?token=<jwt_token>'
                )
            )
        )
    )

    const root = el('div', { style: 'display:contents' }, header, main)
    return { root, cleanup: null }
}
