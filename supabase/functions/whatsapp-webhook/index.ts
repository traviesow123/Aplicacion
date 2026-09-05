import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? 'whatsapp:+14155238886'

/**
 * Normaliza el texto de respuesta del cliente para detectar SI o NO
 */
function parseKeywordIntent(rawText: string): 'SI' | 'NO' | 'UNKNOWN' {
  const normalized = rawText
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quitar tildes: SÍ -> SI
    .replace(/[^\w\s]/gi, '')        // Quitar signos de puntuación

  // Patrones afirmativos
  const affirmativeWords = ['SI', 'S', 'CONFIRMO', 'CONFIRMAR', 'CONFIRMADO', 'OK', 'DALE', 'CLARO', '1', 'YES', 'Y']
  if (affirmativeWords.includes(normalized) || normalized.startsWith('SI ') || normalized.includes('CONFIRMO')) {
    return 'SI'
  }

  // Patrones negativos
  const negativeWords = ['NO', 'N', 'CANCELO', 'CANCELAR', 'CANCELADO', '2', 'NO PUEDO', 'NOT']
  if (negativeWords.includes(normalized) || normalized.startsWith('NO ') || normalized.includes('CANCELO')) {
    return 'NO'
  }

  return 'UNKNOWN'
}

/**
 * Enviar mensaje de respuesta por WhatsApp
 */
async function sendWhatsAppReply(toPhone: string, message: string) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.log('[Webhook Reply Simulado]:', { to: toPhone, message })
    return
  }

  let formattedTo = toPhone.replace(/\D/g, '')
  if (formattedTo.length === 8) formattedTo = '506' + formattedTo

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  const params = new URLSearchParams({
    From: TWILIO_WHATSAPP_FROM,
    To: `whatsapp:+${formattedTo}`,
    Body: message,
  })

  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })
}

serve(async (req) => {
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
      // Formato JSON (Meta Cloud API, test requests o Evolution API)
      const bodyText = await req.text()
      try {
        const json = JSON.parse(bodyText || '{}')
        // Meta Cloud API
        if (json.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
          const msg = json.entry[0].changes[0].value.messages[0]
          senderPhone = msg.from || ''
          messageBody = msg.text?.body || ''
        } else {
          // Genérico
          senderPhone = json.From || json.phone || json.from || ''
          messageBody = json.Body || json.message || json.text || ''
        }
      } catch {
        // Fallback
      }
    }

    // Extraer solo dígitos del teléfono (últimos 8 dígitos para Costa Rica o número completo)
    const digitsOnly = senderPhone.replace(/\D/g, '')
    const localPhone = digitsOnly.slice(-8)

    console.log(`[Webhook] Mensaje recibido de ${senderPhone} (${localPhone}): "${messageBody}"`)

    if (!localPhone || !messageBody) {
      return new Response("Missing phone or message", { status: 400 })
    }

    const intent = parseKeywordIntent(messageBody)
    console.log(`[Webhook] Intención detectada: ${intent}`)

    // Buscar la cita pendiente más próxima para este teléfono
    const { data: appointments, error } = await supabaseClient
      .from('user_appointments')
      .select('*')
      .ilike('telefono', `%${localPhone}%`)
      .eq('estado', 'pendiente')
      .order('fecha_hora', { ascending: true })
      .limit(1)

    if (error) {
      console.error('[Webhook] Error consultando citas:', error)
      return new Response("Database error", { status: 500 })
    }

    if (!appointments || appointments.length === 0) {
      console.log(`[Webhook] No se encontró cita pendiente para el número ${localPhone}`)
      await sendWhatsAppReply(senderPhone, "Hola. No encontramos una cita pendiente asociada a este número en Calendario Inteligente.")
      return new Response(JSON.stringify({ status: "no_pending_appointment" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })
    }

    const appt = appointments[0]
    const dt = new Date(appt.fecha_hora)
    const timeStr = dt.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: true })

    if (intent === 'SI') {
      // 1. CONFIRMAR LA CITA
      await supabaseClient
        .from('user_appointments')
        .update({
          estado: 'confirmado',
          reminder_response: `SI: "${messageBody}"`,
          updated_at: new Date().toISOString()
        })
        .eq('id', appt.id)

      const replyMsg = `¡Muchas gracias ${appt.nombre}! Tu cita para *${appt.servicio}* a las ${timeStr} ha sido CONFIRMADA con éxito. ✅ ¡Te esperamos!`
      await sendWhatsAppReply(senderPhone, replyMsg)

      return new Response(JSON.stringify({ success: true, action: "confirmed", appointment_id: appt.id }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })
    } else if (intent === 'NO') {
      // 2. CANCELAR LA CITA
      await supabaseClient
        .from('user_appointments')
        .update({
          estado: 'cancelado',
          reminder_response: `NO: "${messageBody}"`,
          updated_at: new Date().toISOString()
        })
        .eq('id', appt.id)

      const replyMsg = `Entendido ${appt.nombre}. Tu cita para *${appt.servicio}* ha sido CANCELADA. ❌ Si deseas reprogramar en otra fecha, avísanos con gusto.`
      await sendWhatsAppReply(senderPhone, replyMsg)

      return new Response(JSON.stringify({ success: true, action: "cancelled", appointment_id: appt.id }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })
    } else {
      // 3. RESPUESTA NO RECONOCIDA -> GUÍA AL CLIENTE
      const replyMsg = `Hola ${appt.nombre}, para gestionar tu cita de mañana para *${appt.servicio}*, responde por favor únicamente:\n👉 *SI* para confirmar tu asistencia\n👉 *NO* para cancelar tu cita`
      await sendWhatsAppReply(senderPhone, replyMsg)

      return new Response(JSON.stringify({ success: false, action: "unrecognized_intent" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })
    }

  } catch (error) {
    console.error('[Webhook] Error general:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    })
  }
})
