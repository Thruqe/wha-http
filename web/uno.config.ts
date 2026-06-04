import { defineConfig, presetUno, presetMini } from "unocss";

export default defineConfig({
    presets: [presetUno()],
    theme: {
        colors: {
            success: "#0070f3",
            warning: "#f5a623",
            error: "#ee0000",
        },
    },
    shortcuts: {
        card: "bg-white border border-zinc-200 rounded-xl shadow-sm p-6 transition-shadow hover:shadow-md hover:border-zinc-300",
        "card-title":
            "text-xs font-medium uppercase tracking-widest text-zinc-500 mb-4",
        btn: "inline-flex items-center justify-center gap-2 h-10 px-4 text-sm font-medium rounded-lg cursor-pointer transition-colors border border-zinc-200 text-zinc-500 bg-white hover:bg-zinc-50 hover:border-zinc-900 hover:text-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed",
        "btn-primary":
            "btn bg-zinc-900 border-zinc-900 text-white hover:bg-white hover:text-zinc-900",
        "btn-danger": "btn text-red-600 hover:bg-red-50 hover:border-red-600",
        "input-text":
            "w-full h-10 px-3 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 placeholder:text-zinc-400",
        dot: "w-1.5 h-1.5 rounded-full bg-zinc-300 transition-all",
        "dot-connected":
            "dot bg-success shadow-[0_0_0_3px_rgba(0,112,243,0.15)]",
        "dot-connecting":
            "dot bg-warning shadow-[0_0_0_3px_rgba(245,166,35,0.15)] animate-pulse",
        "dot-error": "dot bg-error shadow-[0_0_0_3px_rgba(238,0,0,0.15)]",
        "log-tag": "font-semibold text-[11px] uppercase tracking-widest",
    },
});
