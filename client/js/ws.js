/** ws.js — account WebSocket, direct port of ws.ts */
import { getToken } from './auth.js'

/** @returns {string} */
function randomId() {
    return Math.random().toString(36).slice(2, 10)
}

/**
 * @param {string} accountId
 * @returns {{ subscribe: Function, send: Function, close: Function }}
 */
export function createAccountSocket(accountId) {
    /** @type {Set<Function>} */
    const handlers = new Set()
    /** @type {Map<string, { resolve: Function, reject: Function }>} */
    const pending  = new Map()
    /** @type {WebSocket|null} */
    let ws     = null
    let closed = false

    function connect() {
        const t = getToken()
        ws = new WebSocket(`ws://${location.host}/ws/${accountId}?token=${t}`)

        ws.onmessage = e => {
            try {
                const msg = JSON.parse(e.data)

                if (msg.type === 'ack' && msg.id) {
                    const p = pending.get(msg.id)
                    if (p) {
                        pending.delete(msg.id)
                        msg.payload?.ok ? p.resolve() : p.reject(msg.payload?.error ?? 'unknown error')
                    }
                    return
                }

                handlers.forEach(h => h(msg))
            } catch {
                console.warn('[ws] unparseable message', e.data)
            }
        }

        ws.onclose = () => { if (!closed) setTimeout(connect, 2000) }
        ws.onerror = e  => console.error('[ws] error', e)
    }

    connect()

    return {
        subscribe(handler) {
            handlers.add(handler)
            return () => handlers.delete(handler)
        },

        send(type, payload = {}) {
            return new Promise((resolve, reject) => {
                if (ws?.readyState !== WebSocket.OPEN) { reject('not connected'); return }
                const id = randomId()
                pending.set(id, { resolve, reject })
                ws.send(JSON.stringify({ type, id, payload }))
                setTimeout(() => {
                    if (pending.has(id)) { pending.delete(id); reject(`timeout: ${id}`) }
                }, 10_000)
            })
        },

        close() { closed = true; ws?.close() },
    }
}
