/** router.js — hash-based SPA router */

/** @type {Function|null} Current page cleanup */
let currentCleanup = null

/** @type {Array<{ pattern: RegExp, handler: Function }>} */
const routes = []

/**
 * Register a route.
 * @param {string|RegExp} pattern  e.g. '/dashboard' or /^\/accounts\/([^/]+)$/
 * @param {Function} handler       receives regex match groups, returns { root, cleanup }
 */
export function route(pattern, handler) {
    const re = pattern instanceof RegExp
        ? pattern
        : new RegExp('^' + pattern.replace(/:[^/]+/g, '([^/]+)') + '$')
    routes.push({ pattern: re, handler })
}

/**
 * Navigate to a hash path (e.g. '/dashboard').
 * @param {string} path
 */
export function navigate(path) {
    location.hash = '#' + path
}

/** Mount the router into a container element. */
export function startRouter(container) {
    async function resolve() {
        // Run previous page cleanup (e.g. close WebSocket) before any async work
        if (currentCleanup) { currentCleanup(); currentCleanup = null }

        const raw  = location.hash.slice(1) || '/'
        const path = raw.split('?')[0] // ignore query params

        for (const { pattern, handler } of routes) {
            const m = path.match(pattern)
            if (m) {
                // await so async handlers (e.g. auth-guarded pages) resolve correctly
                const { root, cleanup } = await handler(...m.slice(1))
                currentCleanup = cleanup

                // Swap DOM: remove previous page, mount new one
                container.innerHTML = ''
                container.append(root)
                return
            }
        }

        // No match — redirect to login
        navigate('/login')
    }

    window.addEventListener('hashchange', resolve)
    resolve() // handle initial load
}
