import { get } from 'svelte/store'
import { token } from './auth'

export interface WsEvent {
    type: string
    id?: string
    payload: Record<string, unknown>
}

export interface AccountSocket {
    subscribe: (handler: (event: WsEvent) => void) => () => void
    send: (type: string, payload?: Record<string, unknown>) => Promise<void>
    close: () => void
}

function randomId() {
    return Math.random().toString(36).slice(2, 10)
}

export function createAccountSocket(accountId: string): AccountSocket {
    const handlers = new Set<(event: WsEvent) => void>()
    const pending = new Map<string, { resolve: () => void; reject: (e: string) => void }>()
    let ws: WebSocket | null = null
    let closed = false

    function connect() {
        const t = get(token)
        ws = new WebSocket(`ws://${location.host}/ws/${accountId}?token=${t}`)

        ws.onmessage = e => {
            try {
                const msg: WsEvent = JSON.parse(e.data)

                // Resolve pending ack
                if (msg.type === 'ack' && msg.id) {
                    const p = pending.get(msg.id)
                    if (p) {
                        pending.delete(msg.id)
                        const { ok, error } = msg.payload as { ok: boolean; error?: string }
                        ok ? p.resolve() : p.reject(error ?? 'unknown error')
                    }
                    return
                }

                handlers.forEach(h => h(msg))
            } catch {
                console.warn('[ws] unparseable message', e.data)
            }
        }

        ws.onclose = () => {
            if (!closed) setTimeout(connect, 2000)
        }

        ws.onerror = e => console.error('[ws] error', e)
    }

    connect()

    return {
        subscribe(handler) {
            handlers.add(handler)
            return () => handlers.delete(handler)
        },

        send(type, payload = {}) {
            return new Promise((resolve, reject) => {
                if (ws?.readyState !== WebSocket.OPEN) {
                    reject('not connected')
                    return
                }
                const id = randomId()
                pending.set(id, { resolve, reject })
                ws.send(JSON.stringify({ type, id, payload }))
                setTimeout(() => {
                    if (pending.has(id)) {
                        pending.delete(id)
                        reject(`timeout waiting for ack: ${id}`)
                    }
                }, 10_000)
            })
        },

        close() {
            closed = true
            ws?.close()
        },
    }
}