/** app.js — entry point */
import { getToken, setUser } from './auth.js'
import { me } from './api.js'
import { route, startRouter, navigate } from './router.js'
import { loginPage }    from './pages/login.js'
import { registerPage } from './pages/register.js'
import { dashboardPage} from './pages/dashboard.js'
import { accountPage }  from './pages/account.js'
import { docsPage }     from './pages/docs.js'

const PUBLIC = ['/login', '/register']

// ── Auth guard ────────────────────────────────────────────────────
async function guard(path) {
    if (!getToken()) {
        if (!PUBLIC.includes(path)) navigate('/login')
        return false
    }
    try {
        const user = await me()
        setUser(user)
        return true
    } catch {
        navigate('/login')
        return false
    }
}

// ── Routes ────────────────────────────────────────────────────────
route('/login',    () => loginPage())
route('/register', () => registerPage())

route('/dashboard', async () => {
    const ok = await guard('/dashboard')
    if (!ok) return { root: document.createDocumentFragment(), cleanup: null }
    return dashboardPage()
})

route('/docs', async () => {
    const ok = await guard('/docs')
    if (!ok) return { root: document.createDocumentFragment(), cleanup: null }
    return docsPage()
})

route('/accounts/:id', async (id) => {
    const ok = await guard(`/accounts/${id}`)
    if (!ok) return { root: document.createDocumentFragment(), cleanup: null }
    return accountPage(id)
})

// Root redirect
route('/', async () => {
    navigate(getToken() ? '/dashboard' : '/login')
    return { root: document.createDocumentFragment(), cleanup: null }
})

// ── Boot ──────────────────────────────────────────────────────────
startRouter(document.getElementById('app'))
