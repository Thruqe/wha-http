<script lang="ts">
	import { goto } from '$app/navigation'
	import { token } from '$lib/auth'

	goto($token ? '/dashboard' : '/login')
</script>
