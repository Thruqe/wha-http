<script lang="ts">
	import { goto } from '$app/navigation'
	import { token, currentUser } from '$lib/auth'
	import { login } from '$lib/api'

	let email = $state('')
	let password = $state('')
	let error = $state<string | null>(null)
	let loading = $state(false)

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault()
		error = null
		loading = true
		try {
			const res = await login(email, password)
			token.set(res.token)
			currentUser.set({ userId: res.user.id, email: res.user.email })
			goto('/dashboard')
		} catch (err: any) {
			error = err.message
		} finally {
			loading = false
		}
	}
</script>

<div class="min-h-screen flex items-center justify-center px-4">
	<div class="w-full max-w-sm">
		<div class="mb-8 text-center">
			<h1 class="text-2xl font-semibold tracking-tight text-zinc-900">WHA-HTTP</h1>
			<p class="mt-1 text-sm text-zinc-500">Sign in to your account</p>
		</div>

		<form onsubmit={handleSubmit} class="space-y-4">
			<div class="space-y-1">
				<label class="text-sm font-medium text-zinc-700" for="email">Email</label>
				<input
					id="email"
					type="email"
					bind:value={email}
					placeholder="you@example.com"
					required
					class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 transition"
				/>
			</div>

			<div class="space-y-1">
				<label class="text-sm font-medium text-zinc-700" for="password">Password</label>
				<input
					id="password"
					type="password"
					bind:value={password}
					placeholder="••••••••"
					required
					class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 transition"
				/>
			</div>

			{#if error}
				<p class="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
					{error}
				</p>
			{/if}

			<button
				type="submit"
				disabled={loading}
				class="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition cursor-pointer"
			>
				{loading ? 'Signing in…' : 'Sign in'}
			</button>
		</form>

		<p class="mt-6 text-center text-sm text-zinc-500">
			No account? <a href="/register" class="font-medium text-zinc-900 hover:underline">Register</a>
		</p>
	</div>
</div>
