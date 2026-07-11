/** dom.js — tiny DOM helpers */

/**
 * Create an element with attributes and children.
 * @param {string} tag
 * @param {Record<string,string>} attrs
 * @param {...(Node|string)} children
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'style') { node.style.cssText = v }
        else node.setAttribute(k, v)
    }
    for (const child of children) {
        if (child == null) continue
        node.append(typeof child === 'string' ? document.createTextNode(child) : child)
    }
    return node
}

/**
 * Wraps an async submit handler.
 * @param {(e: SubmitEvent) => Promise<void>} fn
 */
export function formHandler(fn) {
    return (e) => { e.preventDefault(); fn(e) }
}

/**
 * Returns a <span class="badge badge-*"> for a given status.
 * @param {string} status
 * @returns {HTMLElement}
 */
export function statusBadge(status) {
    const cls =
        status === 'connected'    ? 'badge-connected'    :
        status === 'disconnected' ? 'badge-disconnected' :
        status === 'stopped'      ? 'badge-disconnected' :
        status === 'paused'       ? 'badge-connecting'   :
        status === 'connecting'   ? 'badge-connecting'   :
        status === 'error'        ? 'badge-error'        : 'badge-pending'
    return el('span', { class: `badge ${cls}` }, status.replace(/_/g, ' '))
}

/**
 * Creates a spinner element for use inside buttons.
 * @returns {HTMLElement}
 */
export function spinner() {
    return el('span', { class: 'spinner', 'aria-hidden': 'true' })
}

/**
 * Full-page / section loader.
 * @param {string} [size=''] — '' for normal, 'sm' for small
 * @returns {HTMLElement}
 */
export function loader(size = '') {
    const cls = size === 'sm' ? 'loader loader-sm' : 'loader'
    return el('div', { class: 'loader-wrap' }, el('div', { class: cls, role: 'status', 'aria-label': 'Loading…' }))
}

/**
 * Open a custom modal dialog.
 * Returns a { close } object to programmatically dismiss.
 *
 * @param {{
 *   title: string,
 *   body: HTMLElement,
 *   footer?: HTMLElement,
 *   onClose?: () => void
 * }} opts
 */
export function openModal({ title, body, footer, onClose }) {
    const closeBtn = el('button', { class: 'modal-close', type: 'button', 'aria-label': 'Close' }, '×')

    const header = el('div', { class: 'modal-header' },
        el('h2', { class: 'modal-title' }, title),
        closeBtn,
    )

    const bodyWrap = el('div', { class: 'modal-body' }, body)
    const children = [header, bodyWrap]
    if (footer) children.push(footer)

    const modal    = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' }, ...children)
    const backdrop = el('div', { class: 'modal-backdrop' }, modal)

    document.body.append(backdrop)

    function close() {
        backdrop.remove()
        onClose?.()
    }

    closeBtn.addEventListener('click', close)
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close() })
    document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc) }
    })

    return { close, backdrop }
}

/**
 * Show a temporary toast notification (non-blocking).
 * @param {string} message
 * @param {'ok'|'error'|'warn'} [type='ok']
 * @param {number} [ms=3500]
 */
export function toast(message, type = 'ok', ms = 3500) {
    let wrap = document.getElementById('toast-wrap')
    if (!wrap) {
        wrap = el('div', { id: 'toast-wrap', style: 'position:fixed;bottom:24px;right:24px;display:flex;flex-direction:column;gap:8px;z-index:9999;' })
        document.body.append(wrap)
    }
    const t = el('div', { class: `alert alert-${type}`, style: 'min-width:220px;max-width:340px;box-shadow:var(--shadow-md);animation:slideUp .22s ease;' }, message)
    wrap.append(t)
    setTimeout(() => t.remove(), ms)
}
