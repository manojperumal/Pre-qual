import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { Camera, CameraOff } from 'lucide-react'

/** Camera QR scanner: native BarcodeDetector where available, jsQR otherwise. */
export function QrScanner({ onScan }: { onScan: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [on, setOn] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const last = useRef<{ text: string; at: number }>({ text: '', at: 0 })

  useEffect(() => {
    if (!on) return
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    const Detector = (window as any).BarcodeDetector
    const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null

    const emit = (text: string) => {
      const now = Date.now()
      if (text === last.current.text && now - last.current.at < 4000) return
      last.current = { text, at: now }
      onScan(text)
    }

    const tick = async () => {
      if (stopped || !video.current) return
      const v = video.current
      if (v.readyState >= 2) {
        try {
          if (detector) {
            const codes = await detector.detect(v)
            if (codes[0]?.rawValue) emit(codes[0].rawValue)
          } else if (canvas.current) {
            const c = canvas.current
            c.width = v.videoWidth
            c.height = v.videoHeight
            const ctx = c.getContext('2d', { willReadFrequently: true })!
            ctx.drawImage(v, 0, 0)
            const img = ctx.getImageData(0, 0, c.width, c.height)
            const code = jsQR(img.data, img.width, img.height)
            if (code?.data) emit(code.data)
          }
        } catch {
          /* keep scanning */
        }
      }
      raf = requestAnimationFrame(() => setTimeout(tick, 150))
    }

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s
        if (video.current) {
          video.current.srcObject = s
          video.current.play().catch(() => {})
        }
        tick()
      })
      .catch(() => {
        setErr('Camera not available. Use the name search or paste the code instead.')
        setOn(false)
      })
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [on, onScan])

  return (
    <div className="space-y-2">
      {on ? (
        <div className="relative overflow-hidden rounded-lg bg-black">
          <video ref={video} className="aspect-video w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-8 rounded-lg border-4 border-white/70" />
        </div>
      ) : null}
      <canvas ref={canvas} className="hidden" />
      <button type="button" className="btn-secondary w-full" onClick={() => setOn((v) => !v)}>
        {on ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />} {on ? 'Stop camera' : 'Scan site pass QR'}
      </button>
      {err && <p className="text-sm text-amber-800">{err}</p>}
    </div>
  )
}
