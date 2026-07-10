/** pages/register.js */
import { register as apiRegister } from '../api.js'
import { setToken, setUser } from '../auth.js'
import { navigate } from '../router.js'
import { el, formHandler } from '../dom.js'

export function registerPage() {
    const errEl  = el('p', { class: 'alert alert-error hidden', role: 'alert' })
    const emailIn= el('input', { type: 'email',    id: 'email',    placeholder: 'you@example.com', required: '' })
    const passIn = el('input', { type: 'password', id: 'password', placeholder: 'Min. 8 characters', required: '', minlength: '8' })
    const btnEl  = el('button', { type: 'submit', class: 'btn btn-primary btn-full' }, 'Create account')

    const form = el('form', { class: 'auth-form', novalidate: '' },
        el('div', { class: 'field' }, el('label', { for: 'email' }, 'Email'), emailIn),
        el('div', { class: 'field' }, el('label', { for: 'password' }, 'Password'), passIn),
        errEl,
        btnEl,
    )

    form.addEventListener('submit', formHandler(async () => {
        errEl.classList.add('hidden')
        btnEl.disabled = true
        btnEl.textContent = 'Creating…'
        try {
            const res = await apiRegister(emailIn.value, passIn.value)
            setToken(res.token)
            setUser({ userId: res.user.id, email: res.user.email })
            navigate('/dashboard')
        } catch (err) {
            errEl.textContent = err.message
            errEl.classList.remove('hidden')
        } finally {
            btnEl.disabled = false
            btnEl.textContent = 'Create account'
        }
    }))

    const root = el('div', { class: 'auth-wrap' },
        el('div', { class: 'auth-box' },
            el('h1', { class: 'auth-logo' }, 'WHA-HTTP'),
            el('p',  { class: 'auth-sub'  }, 'Create an account'),
            form,
            el('p',  { class: 'auth-footer' }, 'Have an account? ', el('a', { href: '#/login' }, 'Sign in')),
        )
    )

    return { root, cleanup: null }
}
