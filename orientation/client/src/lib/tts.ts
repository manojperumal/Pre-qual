/**
 * Read-aloud for every content segment (FR-3, NFR accessibility) using the
 * device's speech engine — no download, works on low-end Android.
 */
const VOICE_LANG: Record<string, string> = { en: 'en-US', es: 'es-US' }

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  const want = VOICE_LANG[lang] ?? lang
  return voices.find((v) => v.lang === want) ?? voices.find((v) => v.lang.startsWith(lang))
}

export function speak(text: string, lang: string, onEnd?: () => void) {
  if (!ttsSupported() || !text) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = VOICE_LANG[lang] ?? lang
  const voice = pickVoice(lang)
  if (voice) u.voice = voice
  u.rate = 0.95
  if (onEnd) u.onend = onEnd
  window.speechSynthesis.speak(u)
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel()
}
