<script lang="ts">
	import { onMount, onDestroy } from 'svelte'
	import { page } from '$app/stores'
	import { goto } from '$app/navigation'
	import {
		getAccount,
		listHooks,
		createHook,
		deleteHook,
		stopAccount,
		restartAccount,
		type Account,
		type Hook,
	} from '$lib/api'
	import { createAccountSocket, type WsEvent } from '$lib/ws'

	const id = $page.params.id!

	let account = $state<Account | null>(null)
	let hooks = $state<Hook[]>([])
	let events = $state<(WsEvent & { ts: number })[]>([])
	let wsStatus = $state<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting')
	let error = $state<string | null>(null)

	// Pairing state
	let pairCode = $state<string | null>(null)
	let pairQr = $state<string | null>(null)
	let pairStatus = $state<'idle' | 'pending' | 'success' | 'error'>('idle')
	let pairError = $state<string | null>(null)

	// Hook form
	let newHookUrl = $state('')
	let newHookEvent = $state('message')
	let newHookSecret = $state('')
	let addingHook = $state(false)

	let socket: ReturnType<typeof createAccountSocket> | null = null
	let unsub: (() => void) | null = null

	onMount(async () => {
		try {
			;[account, hooks] = await Promise.all([getAccount(id), listHooks(id)])
		} catch (err: any) {
			error = err.message
			return
		}

		socket = createAccountSocket(id)
		unsub = socket.subscribe((msg) => {
			if (msg.type === 'connected') wsStatus = 'connected'
			if (msg.type === 'upstream_closed') wsStatus = 'disconnected'
			if (msg.type === 'error') wsStatus = 'error'

			// Pairing
			if (msg.type === 'pair_code') {
				pairCode = msg.payload.code as string
				pairStatus = 'pending'
			}
			if (msg.type === 'pair_qr') {
				pairQr = msg.payload.code as string
				pairStatus = 'pending'
			}
			if (msg.type === 'pair_success') {
				pairStatus = 'success'
				pairCode = null
				pairQr = null
				account = { ...account!, status: 'connected' }
			}
			if (msg.type === 'pair_error') {
				pairStatus = 'error'
				pairError = msg.payload.reason as string
			}

			events = [{ ...msg, ts: Date.now() }, ...events].slice(0, 100)
		})
	})

	onDestroy(() => {
		unsub?.()
		socket?.close()
	})

	async function handleStop() {
		await stopAccount(id)
		account = await getAccount(id)
	}

	async function handleRestart() {
		await restartAccount(id)
		account = await getAccount(id)
	}

	async function handleAddHook(e: SubmitEvent) {
		e.preventDefault()
		addingHook = true
		try {
			const hook = await createHook(id, {
				eventType: newHookEvent,
				targetUrl: newHookUrl,
				secret: newHookSecret || undefined,
			})
			hooks = [...hooks, hook]
			newHookUrl = ''
			newHookSecret = ''
		} catch (err: any) {
			error = err.message
		} finally {
			addingHook = false
		}
	}

	async function handleDeleteHook(hookId: string) {
		if (!confirm('Delete this webhook?')) return
		await deleteHook(id, hookId)
		hooks = hooks.filter((h) => h.id !== hookId)
	}

	const accountStatusStyles: Record<Account['status'], string> = {
		connected: 'bg-emerald-50 text-emerald-700 border-emerald-200',
		disconnected: 'bg-red-50 text-red-700 border-red-200',
		pending_qr: 'bg-amber-50 text-amber-700 border-amber-200',
	}

	const wsStatusStyles: Record<typeof wsStatus, string> = {
		connected: 'bg-emerald-50 text-emerald-700 border-emerald-200',
		disconnected: 'bg-red-50 text-red-700 border-red-200',
		error: 'bg-red-50 text-red-700 border-red-200',
		connecting: 'bg-amber-50 text-amber-700 border-amber-200',
	}
</script>

<div class="min-h-screen flex flex-col">
	<header class="border-b border-zinc-200 bg-white px-6 py-4 flex items-center gap-4">
		<button
			onclick={() => goto('/dashboard')}
			class="text-sm text-zinc-500 hover:text-zinc-900 transition cursor-pointer"
		>
			← Back
		</button>
		<span class="text-base font-semibold tracking-tight text-zinc-900">WHA-HTTP</span>
	</header>

	<main class="flex-1 px-6 py-8 max-w-2xl mx-auto w-full space-y-6">
		{#if error}
			<p class="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
				{error}
			</p>
		{/if}

		{#if account}
			<!-- Account hero -->
			<div
				class="rounded-xl border border-zinc-200 bg-white px-5 py-4 flex items-center justify-between"
			>
				<div class="space-y-2">
					<p class="text-base font-semibold text-zinc-900">{account.phone}</p>
					<div class="flex items-center gap-2">
						<span
							class="text-xs font-medium px-2 py-0.5 rounded-full border {accountStatusStyles[
								account.status
							]}"
						>
							{account.status.replace('_', ' ')}
						</span>
						<span
							class="text-xs font-medium px-2 py-0.5 rounded-full border {wsStatusStyles[wsStatus]}"
						>
							ws: {wsStatus}
						</span>
					</div>
				</div>
				<div class="flex gap-2">
					<button
						onclick={handleStop}
						class="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 transition cursor-pointer"
					>
						Stop
					</button>
					<button
						onclick={handleRestart}
						class="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 transition cursor-pointer"
					>
						Restart
					</button>
				</div>
			</div>

			<!-- Pairing panel -->
			{#if account.status === 'pending_qr' || pairStatus === 'pending'}
				<div class="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 space-y-2">
					<h3 class="text-sm font-semibold text-amber-800">Waiting for pairing</h3>
					{#if pairCode}
						<p class="text-xs text-amber-700">Enter this code on your phone:</p>
						<p class="font-mono text-2xl font-bold tracking-widest text-amber-900">{pairCode}</p>
					{:else if pairQr}
						<p class="text-xs text-amber-700">Scan this QR code:</p>
						<pre
							class="text-xs font-mono text-amber-900 whitespace-pre-wrap break-all">{pairQr}</pre>
					{:else}
						<p class="text-xs text-amber-700">Connecting to WhatsApp…</p>
					{/if}
				</div>
			{/if}

			{#if pairStatus === 'success'}
				<div class="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3">
					<p class="text-sm font-medium text-emerald-700">Paired successfully!</p>
				</div>
			{/if}

			{#if pairStatus === 'error'}
				<div class="rounded-xl border border-red-200 bg-red-50 px-5 py-3">
					<p class="text-sm font-medium text-red-700">Pairing failed: {pairError}</p>
				</div>
			{/if}

			<!-- Live event log -->
			<div class="rounded-xl border border-zinc-200 bg-white">
				<div class="px-5 py-3 border-b border-zinc-100">
					<h3 class="text-sm font-semibold text-zinc-900">Live Events</h3>
				</div>
				<div class="divide-y divide-zinc-100 max-h-72 overflow-y-auto">
					{#if events.length === 0}
						<p class="px-5 py-4 text-sm text-zinc-400">Waiting for events…</p>
					{:else}
						{#each events as ev (ev.ts)}
							<div class="px-5 py-2.5 flex items-start gap-3 font-mono text-xs">
								<span class="text-zinc-400 shrink-0">{new Date(ev.ts).toLocaleTimeString()}</span>
								<span class="text-zinc-700 font-semibold shrink-0">{ev.type}</span>
								<span class="text-zinc-500 truncate">{JSON.stringify(ev.payload)}</span>
							</div>
						{/each}
					{/if}
				</div>
			</div>

			<!-- Webhooks -->
			<div class="rounded-xl border border-zinc-200 bg-white">
				<div class="px-5 py-3 border-b border-zinc-100">
					<h3 class="text-sm font-semibold text-zinc-900">Webhooks</h3>
				</div>

				<div class="divide-y divide-zinc-100">
					{#if hooks.length === 0}
						<p class="px-5 py-4 text-sm text-zinc-400">No webhooks configured.</p>
					{:else}
						{#each hooks as hook (hook.id)}
							<div class="px-5 py-3 flex items-center justify-between gap-4">
								<div class="flex items-center gap-2 text-sm min-w-0">
									<span class="font-medium text-zinc-700 shrink-0">{hook.eventType}</span>
									<span class="text-zinc-400">→</span>
									<span class="text-zinc-500 truncate">{hook.targetUrl}</span>
								</div>
								<button
									onclick={() => handleDeleteHook(hook.id)}
									class="text-xs text-zinc-400 hover:text-red-500 transition shrink-0 cursor-pointer"
								>
									Delete
								</button>
							</div>
						{/each}
					{/if}
				</div>

				<!-- Add hook form -->
				<div class="px-5 py-4 border-t border-zinc-100 space-y-3">
					<h4 class="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Add webhook</h4>
					<form onsubmit={handleAddHook} class="space-y-3">
						<div class="space-y-1">
							<label class="text-xs font-medium text-zinc-600" for="event-type">Event type</label>
							<input
								id="event-type"
								bind:value={newHookEvent}
								placeholder="message"
								required
								class="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 transition"
							/>
						</div>
						<div class="space-y-1">
							<label class="text-xs font-medium text-zinc-600" for="target-url">Target URL</label>
							<input
								id="target-url"
								bind:value={newHookUrl}
								type="url"
								placeholder="https://your.server/hook"
								required
								class="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 transition"
							/>
						</div>
						<div class="space-y-1">
							<label class="text-xs font-medium text-zinc-600" for="secret">
								Secret <span class="text-zinc-400 font-normal">(optional)</span>
							</label>
							<input
								id="secret"
								bind:value={newHookSecret}
								placeholder="hmac secret"
								class="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 transition"
							/>
						</div>
						<button
							type="submit"
							disabled={addingHook}
							class="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition cursor-pointer"
						>
							{addingHook ? 'Adding…' : 'Add webhook'}
						</button>
					</form>
				</div>
			</div>
		{/if}
	</main>
</div>
