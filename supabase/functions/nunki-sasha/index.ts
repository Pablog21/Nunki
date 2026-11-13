// Nunki · Sasha: proxy seguro a Gemini.
// Solo usuarios logueados de Nunki con un salón asignado pueden usarlo.
// Secretos necesarios: GEMINI_API_KEY (y opcional GEMINI_MODEL, NUNKI_ALLOWED_ORIGIN).
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('NUNKI_ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!apiKey || !supabaseUrl || !anonKey) return json({ error: 'Sasha no está configurada' }, 500)

    // 1. Validar sesión y pertenencia a un salón de Nunki
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      db: { schema: 'nunki' },
    })
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return json({ error: 'Sesión inválida' }, 401)

    const { data: perfil } = await supabase.from('usuarios').select('id, empresa_id').eq('id', user.id).maybeSingle()
    if (!perfil) return json({ error: 'Usuario sin salón asignado' }, 403)

    // 2. Armar la consulta con límites de tamaño
    const { prompt, systemInstruction, temperature = 0.2, history = [] } = await req.json()
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8000) {
      return json({ error: 'Consulta inválida' }, 400)
    }

    const contents: unknown[] = []
    if (Array.isArray(history)) {
      for (const m of history.slice(-12)) {
        if (!m?.text) continue
        contents.push({ role: m.sender === 'user' ? 'user' : 'model', parts: [{ text: String(m.text).slice(0, 2000) }] })
      }
    }
    contents.push({ role: 'user', parts: [{ text: prompt }] })

    const payload: Record<string, unknown> = {
      contents,
      generationConfig: { temperature: Math.min(Math.max(Number(temperature) || 0.2, 0), 1), responseMimeType: 'application/json' },
    }
    if (systemInstruction) payload.systemInstruction = { parts: [{ text: String(systemInstruction).slice(0, 20000) }] }

    const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash'
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      console.error('Gemini error', response.status, await response.text())
      return json({ error: 'Sasha no pudo responder' }, 502)
    }

    const result = await response.json()
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    try {
      return json(JSON.parse(text))
    } catch {
      return json({ raw: text })
    }
  } catch (err) {
    console.error(err)
    return json({ error: 'Error inesperado' }, 500)
  }
})
