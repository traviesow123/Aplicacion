import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? 'whatsapp:+14155238886'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * Normaliza el texto de respuesta del cliente para detectar SI o NO.
 * Soporta variaciones en español, con/sin tildes, abreviaciones y emojis.
 */
function parseKeywordIntent(rawText: string): 'SI' | 'NO' | 'UNKNOWN' {
  const normalized = rawText
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quitar tildes: SÍ -> SI
    .replace(/[^\w\s]/gi, '')        // Quitar signos de puntuación y emojis
    .trim()

  // Patrones afirmativos (español + inglés + coloquial)
  const affirmativePatterns = [
    'SI', 'S', 'SIP', 'SIPI', 'SEP',
    'CONFIRMO', 'CONFIRMAR', 'CONFIRMADO', 'CONFIRMADA', 'CONFIRM',
    'OK', 'OKEY', 'OKAY', 'OKI',
    'DALE', 'DALE QUE SI', 'DALE SI',
    'CLARO', 'CLARO QUE SI',
    'POR SUPUESTO', 'SEGURO',
    'PERFECTO', 'LISTO', 'LISTA',
    'BUENO', 'BUENISIMO',
    'VA', 'VALE', 'VAMOS',
    'AHI ESTARE', 'AHI VOY', 'AHI ESTAREMOS',
    'CORRECTO', 'EXACTO',
    'YES', 'Y', 'YEP', 'YEAH', 'YA',
    '1',
  ]

  // Patrones negativos
  const negativePatterns = [
    'NO', 'N', 'NEL', 'NOPE', 'NAH',
    'CANCELO', 'CANCELAR', 'CANCELADO', 'CANCELADA', 'CANCEL',
    'NO PUEDO', 'NO VOY', 'NO LLEGO',
    'IMPOSIBLE', 'ME ES IMPOSIBLE',
    'REAGENDAR', 'REPROGRAMAR', 'CAMBIAR FECHA',
    'OTRO DIA', 'OTRA FECHA', 'OTRO HORARIO',
    '2',
  ]

  if (affirmativePatterns.includes(normalized)) return 'SI'
  if (negativePatterns.includes(normalized)) return 'NO'

  // Búsqueda parcial para frases más largas
  if (normalized.startsWith('SI ') || normalized.includes(' CONFIRMO') || normalized.includes('CONFIRMO ')) return 'SI'
  if (normalized.startsWith('NO ') || normalized.includes(' CANCELO') || normalized.includes('CANCELO ')) return 'NO'
  if (normalized.includes('NO PUEDO') || normalized.includes('NO VOY') || normalized.includes('CANCELAR')) return 'NO'
  if (normalized.includes('AHI ESTARE') || normalized.includes('CUENTEN CONMIGO')) return 'SI'

  return 'UNKNOWN'
}

/**
 * Formatea un número de teléfono para Costa Rica
 */
function formatPhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 8) return '506' + digits
  if (digits.length > 8 && !digits.startsWith('506')) return '506' + digits
  return digits
}

/**
 * Enviar mensaje de respuesta por WhatsApp
 */
async function sendWhatsAppReply(toPhone: string, message: string): Promise<boolean> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.log('[Webhook Reply Simulado]:', { to: toPhone, message })
    return true
  }

  const formattedTo = formatPhoneNumber(toPhone)
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  const params = new URLSearchParams({
    From: TWILIO_WHATSAPP_FROM,
    To: `whatsapp:+${formattedTo}`,
    Body: message,
  })

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!res.ok) {
      console.error(`[Webhook Reply] Error ${res.status}: ${await res.text()}`)
    }
    return res.ok
  } catch (e) {
    console.error('[Webhook Reply] Error de red:', e)
    return false
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let senderPhone = ''
    let messageBody = ''

    const contentType = req.headers.get('content-type') || ''

    if (contentType.includes('application/x-www-form-urlencoded')) {
      // Formato Twilio Webhook
      const formData = await req.formData()
      senderPhone = formData.get('From')?.toString() || ''
      messageBody = formData.get('Body')?.toString() || ''
    } else {
      // Formato JSON (Meta Cloud API, Evolution API, test requests)
      const bodyText = await req.text()
      try {
        const json = JSON.parse(bodyText || '{}')

        // Meta Cloud API format
        if (json.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
          const msg = json.entry[0].changes[0].value.messages[0]
          senderPhone = msg.from || ''
          messageBody = msg.text?.body || ''
        }
        // Evolution API format
        else if (json.data?.key?.remoteJid) {
          senderPhone = json.data.key.remoteJid.replace('@s.whatsapp.net', '')
          messageBody = json.data.message?.conversation || json.data.message?.extendedTextMessage?.text || ''
        }
        // Generic format
        else {
          senderPhone = json.From || json.phone || json.from || ''
          messageBody = json.Body || json.message || json.text || ''
        }
      } catch {
        console.warn('[Webhook] Could not parse JSON body')
      }
    }

    // Extraer solo dígitos — últimos 8 para Costa Rica
    const digitsOnly = senderPhone.replace(/\D/g, '')
    const localPhone = digitsOnly.slice(-8)

    console.log(`[Webhook] ${new Date().toISOString()} — De: ${senderPhone} (local: ${localPhone}), Mensaje: "${messageBody}"`)

    if (!localPhone || !messageBody) {
      return new Response(JSON.stringify({ error: 'Missing phone or message' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    const intent = parseKeywordIntent(messageBody)
    console.log(`[Webhook] Intención detectada: ${intent}`)

    // Buscar la cita pendiente más próxima para este teléfono
    const { data: appointments, error } = await supabaseClient
      .from('user_appointments')
      .select('*')
      .ilike('telefono', `%${localPhone}%`)
      .in('estado', ['pendiente'])
      .eq('reminder_sent', true)   // Solo citas que ya recibieron recordatorio
      .order('fecha_hora', { ascending: true })
      .limit(1)

    if (error) {
      console.error('[Webhook] Error en consulta:', error)
      return new Response(JSON.stringify({ error: 'Database error' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    if (!appointments || appointments.length === 0) {
      console.log(`[Webhook] No se encontró cita pendiente para ${localPhone}`)
      await sendWhatsAppReply(senderPhone,
        '👋 Hola. No encontramos una cita pendiente asociada a este número. Si crees que es un error, contacta directamente a tu negocio.'
      )
      return new Response(JSON.stringify({ status: 'no_pending_appointment' }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const appt = appointments[0]
    const dt = new Date(appt.fecha_hora)
    const timeStr = dt.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: true })
    const dateStr = dt.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })

    if (intent === 'SI') {
      await supabaseClient
        .from('user_appointments')
        .update({
          estado: 'confirmado',
          reminder_response: `SI: "${messageBody}"`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appt.id)

      const replyMsg = `✅ ¡Perfecto ${appt.nombre}!\n\nTu cita ha sido *CONFIRMADA*:\n📋 *${appt.servicio}*\n📅 ${dateStr}\n⏰ ${timeStr}\n\n¡Te esperamos con gusto!`
      await sendWhatsAppReply(senderPhone, replyMsg)

      console.log(`[Webhook] ✅ Cita ${appt.id} CONFIRMADA por ${appt.nombre}`)

      return new Response(JSON.stringify({
        success: true,
        action: 'confirmed',
        appointment_id: appt.id,
        nombre: appt.nombre,
      }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        status: 200,
      })
    } else if (intent === 'NO') {
      await supabaseClient
        .from('user_appointments')
        .update({
          estado: 'cancelado',
          reminder_response: `NO: "${messageBody}"`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appt.id)

      const replyMsg = `❌ Entendido ${appt.nombre}.\n\nTu cita para *${appt.servicio}* el ${dateStr} ha sido *CANCELADA*.\n\nSi deseas reagendar en otro horario, no dudes en contactarnos. 📞`
      await sendWhatsAppReply(senderPhone, replyMsg)

      console.log(`[Webhook] ❌ Cita ${appt.id} CANCELADA por ${appt.nombre}`)

      return new Response(JSON.stringify({
        success: true,
        action: 'cancelled',
        appointment_id: appt.id,
        nombre: appt.nombre,
      }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        status: 200,
      })
    } else {
      const replyMsg = `Hola ${appt.nombre} 👋\n\nPara gestionar tu cita de *${appt.servicio}* (${dateStr}, ${timeStr}), por favor responde:\n\n👉 *SI* — para confirmar\n👉 *NO* — para cancelar\n\nSolo necesitamos una de esas dos palabras. 😊`
      await sendWhatsAppReply(senderPhone, replyMsg)

      console.log(`[Webhook] ⚠️ Respuesta no reconocida de ${appt.nombre}: "${messageBody}"`)

      return new Response(JSON.stringify({
        success: false,
        action: 'unrecognized_intent',
        raw_message: messageBody,
      }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

  } catch (error) {
    console.error('[Webhook] Error fatal:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
