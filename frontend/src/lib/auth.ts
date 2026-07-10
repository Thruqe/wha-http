import { writable, get } from 'svelte/store'

export interface User {
    userId: string
    email: string
}

export const token = writable<string | null>(localStorage.getItem('token'))
export const currentUser = writable<User | null>(null)

token.subscribe(t => {
    if (t) localStorage.setItem('token', t)
    else localStorage.removeItem('token')
})

export function authHeader(): Record<string, string> {
    const t = get(token)
    return t ? { Authorization: `Bearer ${t}` } : {}
}

export function logout() {
    token.set(null)
    currentUser.set(null)
}