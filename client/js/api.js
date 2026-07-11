/** api.js — thin fetch wrapper, mirrors the original api.ts */
import { authHeader, logout } from './auth.js'

/**
 * @template T
 * @param {string} method
 * @param {string} path
 * @param {unknown} [body]
 * @returns {Promise<T>}
 */
async function req(method, path, body) {
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

    return res.status === 204 ? null : res.json()
}

// Auth
export const register  = (email, password) =>
    req('POST', '/auth/register', { email, password })

export const login     = (email, password) =>
    req('POST', '/auth/login', { email, password })

export const me        = () =>
    req('GET', '/auth/me')

// Stats
export const stats     = () =>
    req('GET', '/stats')

export const listAccounts  = ()                        => req('GET',    '/accounts')
export const addAccount    = (phone)                   => req('POST', '/accounts', { phone })
export const startAccount  = (id, mode, client)        => req('POST',   `/accounts/${id}/start`, { mode, client })
export const getAccount    = (id)                      => req('GET',    `/accounts/${id}`)
export const removeAccount = (id)                      => req('DELETE', `/accounts/${id}`)
export const stopAccount   = (id)                      => req('POST',   `/accounts/${id}/stop`)
export const restartAccount= (id)                      => req('POST',   `/accounts/${id}/restart`)
export const pauseAccount  = (id)                      => req('POST',   `/accounts/${id}/pause`)
export const resumeAccount = (id)                      => req('POST',   `/accounts/${id}/resume`)
export const logoutAccount = (id)                      => req('POST',   `/accounts/${id}/logout`)

export async function downloadServerLogs() {
    const res = await fetch('/logs', { headers: authHeader() })
    if (!res.ok) throw new Error('Failed to download logs')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'wha-http.log'
    a.click()
    URL.revokeObjectURL(url)
}
