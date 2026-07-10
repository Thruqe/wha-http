/** dom.js — tiny DOM helpers, no library needed */

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
 * Wraps an async submit handler: calls e.preventDefault() and swallows
 * nothing — errors must be handled in the callback.
 * @param {(e: SubmitEvent) => Promise<void>} fn
 */
export function formHandler(fn) {
    return (e) => { e.preventDefault(); fn(e) }
}

/**
 * Returns a <span class="badge badge-*"> for a given account/ws status.
 * @param {string} status
 * @returns {HTMLElement}
 */
export function statusBadge(status) {
    const cls =
        status === 'connected'    ? 'badge-connected'    :
        status === 'disconnected' ? 'badge-disconnected' :
        status === 'connecting'   ? 'badge-connecting'   :
        status === 'error'        ? 'badge-error'        : 'badge-pending'
    return el('span', { class: `badge ${cls}` }, status.replace('_', ' '))
}
