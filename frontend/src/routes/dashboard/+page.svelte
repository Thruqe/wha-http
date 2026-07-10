<script lang="ts">
	import { onMount } from 'svelte'
	import { goto } from '$app/navigation'
	import { currentUser, logout } from '$lib/auth'
	import { listAccounts, addAccount, removeAccount, type Account } from '$lib/api'

	let accounts = $state<Account[]>([])
	let newPhone = $state('')
	let error = $state<string | null>(null)
	let loading = $state(true)
	let adding = $state(false)

	onMount(async () => {
		try {
			accounts = await listAccounts()
		} catch (err: any) {
			error = err.message
		} finally {
			loading = false
		}
	})

	let newMode = $state<'pair' | 'qr'>('pair')

	async function handleAdd(e: SubmitEvent) {
		e.preventDefault()
		error = null
		adding = true
		try {
			const account = await addAccount(newPhone, newMode, newMode === 'pair' ? newPhone : undefined)
			accounts = [...accounts, account]
			newPhone = ''
		} catch (err: any) {
			error = err.message
		} finally {
			adding = false
		}
	}

	async function handleRemove(id: string) {
		if (!confirm('Remove this account?')) return
		try {
			await removeAccount(id)
			accounts = accounts.filter((a) => a.id !== id)
		} catch (err: any) {
			error = err.message
		}
	}

	const statusStyles: Record<Account['status'], string> = {
		connected: 'bg-emerald-50 text-emerald-700 border-emerald-200',
		disconnected: 'bg-red-50 text-red-700 border-red-200',
		pending_qr: 'bg-amber-50 text-amber-700 border-amber-200',
	}
</script>

<div class="min-h-screen flex flex-col">
	<header class="border-b border-zinc-200 bg-white px-6 py-4 flex items-center justify-between">
		<span class="text-base font-semibold tracking-tight text-zinc-900">WHA-HTTP</span>
		<div class="flex items-center gap-4">
			<span class="text-sm text-zinc-500">{$currentUser?.email}</span>
			<button
				onclick={() => {
					logout()
					goto('/login')
				}}
				class="text-sm text-zinc-500 hover:text-zinc-900 transition cursor-pointer"
			>
				Sign out
			</button>
		</div>
	</header>

	<main class="flex-1 px-6 py-8 max-w-2xl mx-auto w-full">
		<h2 class="text-lg font-semibold text-zinc-900 mb-6">WhatsApp Accounts</h2>

		<form onsubmit={handleAdd} class="flex gap-2 mb-6">
			<input
				bind:value={newPhone}
				placeholder="2348012345678"
				required
				class="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 transition"
			/>
			<button
				type="submit"
				disabled={adding}
				class="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition cursor-pointer whitespace-nowrap"
			>
				{adding ? 'Adding…' : '+ Add account'}
			</button>
		</form>

		{#if error}
			<p class="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
				{error}
			</p>
		{/if}

		{#if loading}
			<p class="text-sm text-zinc-400">Loading…</p>
		{:else if accounts.length === 0}
			<p class="text-sm text-zinc-400">No accounts yet. Add one above.</p>
		{:else}
			<div class="space-y-2">
				{#each accounts as account (account.id)}
					<div
						class="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 hover:border-zinc-300 hover:shadow-sm transition cursor-pointer"
						role="button"
						tabindex="0"
						onclick={() => goto(`/accounts/${account.id}`)}
						onkeydown={(e) => e.key === 'Enter' && goto(`/accounts/${account.id}`)}
					>
						<div class="flex items-center gap-3">
							<span class="text-sm font-medium text-zinc-900">{account.phone}</span>
							<span
								class="text-xs font-medium px-2 py-0.5 rounded-full border {statusStyles[
									account.status
								]}"
							>
								{account.status.replace('_', ' ')}
							</span>
						</div>
						<button
							onclick={(e) => {
								e.stopPropagation()
								handleRemove(account.id)
							}}
							class="text-xs text-zinc-400 hover:text-red-500 transition cursor-pointer"
						>
							Remove
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</main>
</div>
