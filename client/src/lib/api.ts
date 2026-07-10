import { authHeader, logout } from './auth'

export interface Account {
    id: string
    phone: string
    port: number
    status: 'pending_qr' | 'pending_pair' | 'connected' | 'disconnected'
    createdAt: number
}

export interface Hook {
    id: string
    waAccountId: string
    eventType: string
    targetUrl: string
    secret?: string
    createdAt: number
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    if (res.status === 401) {
        logout()
        throw new Error('unauthorized')
    }
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error ?? 'request failed')
    }

    return res.status === 204 ? (null as T) : res.json()
}

// Auth
export const register = (email: string, password: string) =>
    req<{ token: string; user: { id: string; email: string } }>('POST', '/auth/register', { email, password })

export const login = (email: string, password: string) =>
    req<{ token: string; user: { id: string; email: string } }>('POST', '/auth/login', { email, password })

export const me = () =>
    req<{ userId: string; email: string }>('GET', '/auth/me')

// Accounts
export const listAccounts = () => req<Account[]>('GET', '/accounts')
export const addAccount = (phone: string, mode: 'qr' | 'pair' = 'pair', pairPhone?: string) =>
    req<{ account: Account }>('POST', '/accounts', {
        phone,
        mode,
        ...(pairPhone ? { pairPhone } : {}),
    })
export const getAccount = (id: string) => req<{ account: Account }>('GET', `/accounts/${id}`)
export const removeAccount = (id: string) => req<null>('DELETE', `/accounts/${id}`)
export const stopAccount = (id: string) => req<null>('POST', `/accounts/${id}/stop`)
export const restartAccount = (id: string) => req<null>('POST', `/accounts/${id}/restart`)

// Hooks
export const listHooks = (accountId: string) =>
    req<Hook[]>('GET', `/accounts/${accountId}/hooks`)

export const createHook = (accountId: string, hook: { eventType: string; targetUrl: string; secret?: string }) =>
    req<Hook>('POST', `/accounts/${accountId}/hooks`, hook)

export const deleteHook = (accountId: string, hookId: string) =>
    req<null>('DELETE', `/accounts/${accountId}/hooks/${hookId}`)