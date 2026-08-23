import { NextResponse, type NextRequest } from 'next/server'
import { currentUser } from '@/lib/session'

/**
 * Natural speech via Gemini TTS. Returns a playable WAV; the client falls
 * back to the browser's speechSynthesis when this route is unavailable.
 */
const MODEL = 'gemini-2.5-flash-preview-tts'
const VOICE = process.env.TTS_VOICE ?? 'Kore'

/** Gemini returns raw 16-bit PCM at 24 kHz; browsers want a WAV header on it. */
function pcmToWav(pcm: Buffer, sampleRate = 24_000): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

export async function POST(request: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const key = process.env.GEMINI_API_KEY
  if (!key) return NextResponse.json({ error: 'tts not configured' }, { status: 503 })

  const { text } = (await request.json()) as { text?: string }
  if (!text?.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 })

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Say this as a warm, natural phone receptionist: ${text.slice(0, 600)}` }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
      },
    }),
  })

  if (!res.ok) return NextResponse.json({ error: `tts failed (${res.status})` }, { status: 502 })
  const json = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[] }
  const b64 = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
  if (!b64) return NextResponse.json({ error: 'no audio returned' }, { status: 502 })

  return new NextResponse(new Uint8Array(pcmToWav(Buffer.from(b64, 'base64'))), {
    headers: { 'content-type': 'audio/wav', 'cache-control': 'no-store' },
  })
}
