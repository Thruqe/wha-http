/** auth.js — token + user state, no framework */

let _token = localStorage.getItem('token')
let _user = null

/** @returns {string|null} */
export function getToken() { return _token }

/** @returns {{ userId: string, email: string }|null} */
export function getUser() { return _user }

/** @param {string} t */
export function setToken(t) {
    _token = t
    localStorage.setItem('token', t)
}

/** @param {{ userId: string, email: string }} u */
export function setUser(u) { _user = u }

export function logout() {
    _token = null
    _user = null
    localStorage.removeItem('token')
}

/** @returns {Record<string,string>} */
export function authHeader() {
    return _token ? { Authorization: `Bearer ${_token}` } : {}
}
