/** pages/login.js */
import { login as apiLogin } from '../api.js'
import { setToken, setUser } from '../auth.js'
import { navigate } from '../router.js'
import { el, formHandler } from '../dom.js'

export function loginPage() {
    const errEl = el('p', { class: 'alert alert-error hidden', role: 'alert' })
    const emailIn = el('input', { type: 'email', id: 'email', placeholder: 'you@example.com', required: '' })
    const passIn  = el('input', { type: 'password', id: 'password', placeholder: '••••••••', required: '' })
    const btnEl   = el('button', { type: 'submit', class: 'btn btn-primary btn-full' }, 'Sign in')

    const form = el('form', { class: 'auth-form', novalidate: '' },
        el('div', { class: 'field' }, el('label', { for: 'email' }, 'Email'), emailIn),
        el('div', { class: 'field' }, el('label', { for: 'password' }, 'Password'), passIn),
        errEl,
        btnEl,
    )

    form.addEventListener('submit', formHandler(async () => {
        errEl.classList.add('hidden')
        btnEl.disabled = true
        btnEl.textContent = 'Signing in…'
        try {
            const res = await apiLogin(emailIn.value, passIn.value)
            setToken(res.token)
            setUser({ userId: res.user.id, email: res.user.email })
            navigate('/dashboard')
        } catch (err) {
            errEl.textContent = err.message
            errEl.classList.remove('hidden')
        } finally {
            btnEl.disabled = false
            btnEl.textContent = 'Sign in'
        }
    }))

    const root = el('div', { class: 'auth-wrap' },
        el('div', { class: 'auth-box' },
            el('h1', { class: 'auth-logo' }, 'WHA-HTTP'),
            el('p',  { class: 'auth-sub'  }, 'Sign in to your account'),
            form,
            el('p',  { class: 'auth-footer' }, 'No account? ', el('a', { href: '#/register' }, 'Register')),
        )
    )

    return { root, cleanup: null }
}
