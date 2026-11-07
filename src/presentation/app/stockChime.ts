let audio: AudioContext | null = null
let pending = 0

function context(): AudioContext | null {
  const Ctor = window.AudioContext ?? window.webkitAudioContext
  if (!Ctor) return null
  audio ??= new Ctor()
  return audio
}

function ring(ctx: AudioContext, when: number): void {
  const master = ctx.createGain()
  master.gain.setValueAtTime(0.0001, when)
  master.gain.exponentialRampToValueAtTime(0.16, when + 0.015)
  master.gain.exponentialRampToValueAtTime(0.0001, when + 0.48)
  master.connect(ctx.destination)

  const partials: readonly (readonly [number, number])[] = [
    [988, 0.7],
    [1480, 0.28],
  ]
  for (const [frequency, amount] of partials) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(frequency, when)
    gain.gain.value = amount
    osc.connect(gain)
    gain.connect(master)
    osc.start(when)
    osc.stop(when + 0.5)
  }
}

function flush(ctx: AudioContext): void {
  const count = Math.min(pending, 4)
  pending = 0
  for (let index = 0; index < count; index += 1) {
    ring(ctx, ctx.currentTime + index * 0.38)
  }
}

/** El navegador solo deja sonar después de un gesto. Se llama en el primer clic o tecla. */
export function unlockStockChime(): void {
  const ctx = context()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    void ctx.resume().then(() => {
      if (ctx.state === 'running') flush(ctx)
    })
    return
  }
  flush(ctx)
}

/** Campana corta. Si el audio aún no está desbloqueado, queda en cola hasta el primer gesto. */
export function playStockChime(): void {
  const ctx = context()
  if (!ctx || ctx.state !== 'running') {
    pending = Math.min(pending + 1, 4)
    return
  }
  ring(ctx, ctx.currentTime)
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}
