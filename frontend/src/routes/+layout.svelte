<script lang="ts">
	import '../app.css'
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { page } from '$app/stores'
	import { token, currentUser } from '$lib/auth'
	import { me } from '$lib/api'

	const { children } = $props()

	const publicRoutes = ['/login', '/register']

	onMount(async () => {
		if (!$token) {
			if (!publicRoutes.includes($page.url.pathname)) goto('/login')
			return
		}
		try {
			const user = await me()
			currentUser.set(user)
		} catch {
			if (!publicRoutes.includes($page.url.pathname)) goto('/login')
		}
	})
</script>

<div class="min-h-screen bg-zinc-50 text-zinc-900 font-sans">
	{@render children()}
</div>
