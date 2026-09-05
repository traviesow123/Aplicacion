import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? 'whatsapp:+14155238886'
const TWILIO_SMS_FROM = Deno.env.get('TWILIO_SMS_FROM') ?? '+14155238886'

// --- Funciones de envío con Retry y Fallback ---

/**
 * Envía un mensaje por WhatsApp usando Twilio.
 * Retorna true si fue exitoso, false si falló.
 */
async function sendWhatsApp(to: string, body: string): Promise<boolean> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  const params = new URLSearchParams({
    From: TWILIO_WHATSAPP_FROM,
    To: `whatsapp:${to}`,
    Body: body,
  })

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  return response.ok
}

/**
 * Envía un SMS de respaldo usando Twilio.
 */
async function sendSMS(to: string, body: string): Promise<boolean> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  const params = new URLSearchParams({
    From: TWILIO_SMS_FROM,
    To: to,
    Body: body,
  })

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  return response.ok
}

/**
 * Estrategia de envío con reintentos exponenciales y fallback automático a SMS.
 * 
 * Flujo:
 * 1. Intenta enviar por WhatsApp (hasta MAX_RETRIES con backoff exponencial).
 * 2. Si todos los intentos de WhatsApp fallan, cambia a SMS como respaldo.
 * 3. Si el SMS también falla, marca como 'fallido_critico'.
 */
async function sendWithRetryAndFallback(
  phone: string,
  message: string,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<{ canal: string; estado: string }> {

  // --- Fase 1: Intentar WhatsApp con reintentos ---
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[WhatsApp] Intento ${attempt}/${maxRetries} para ${phone}`)
      const success = await sendWhatsApp(phone, message)
      
      if (success) {
        console.log(`[WhatsApp] ✅ Mensaje enviado exitosamente a ${phone}`)
        return { canal: 'whatsapp', estado: 'enviado' }
      }
    } catch (err) {
      console.error(`[WhatsApp] ❌ Error en intento ${attempt}: ${err.message}`)
    }

    // Backoff exponencial: 1s, 2s, 4s...
    if (attempt < maxRetries) {
      const delay = baseDelayMs * Math.pow(2, attempt - 1)
      console.log(`[WhatsApp] Reintentando en ${delay}ms...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  // --- Fase 2: Fallback a SMS ---
  console.log(`[Fallback] WhatsApp falló tras ${maxRetries} intentos. Cambiando a SMS para ${phone}`)
  try {
    const smsSuccess = await sendSMS(phone, message)
    if (smsSuccess) {
      console.log(`[SMS] ✅ SMS de respaldo enviado exitosamente a ${phone}`)
      return { canal: 'whatsapp', estado: 'enviado_sms' }
    }
  } catch (err) {
    console.error(`[SMS] ❌ Error crítico al enviar SMS: ${err.message}`)
  }

  // --- Fase 3: Todo falló ---
  console.error(`[CRITICO] ⚠️ No se pudo contactar a ${phone} por ningún canal.`)
  return { canal: 'whatsapp', estado: 'fallido_critico' }
}

// --- Handler principal de la Edge Function ---

serve(async (req) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Calcular el rango de 24 horas desde ahora
    const now = new Date()
    const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000) // 23h desde ahora
    const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000)   // 25h desde ahora

    // Obtener citas pendientes dentro de la ventana de 24h (±1h de margen)
    const { data: appointments, error } = await supabaseClient
      .from('appointments')
      .select('*, clients(*), businesses(*)')
      .eq('estado', 'pendiente')
      .gte('fecha_hora', windowStart.toISOString())
      .lte('fecha_hora', windowEnd.toISOString())

    if (error) throw error

    if (!appointments || appointments.length === 0) {
      return new Response(JSON.stringify({ message: "No reminders to send" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })
    }

    const results = []

    for (const appt of appointments) {
      const client = appt.clients
      const business = appt.businesses
      const timeStr = new Date(appt.fecha_hora).toLocaleTimeString('es-MX', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true
      })
      
      const message = `Hola ${client.nombre}, te recordamos tu cita para *${appt.servicio}* en *${business.nombre}* mañana a las ${timeStr}.\n\n¿Confirmas tu asistencia?\n(Responde "Sí", "No", o sugiere otra fecha)`

      // Enviar con reintentos y fallback automático
      const result = await sendWithRetryAndFallback(client.telefono, message)

      // Registrar en la base de datos
      await supabaseClient
        .from('reminder_logs')
        .insert({
          appointment_id: appt.id,
          canal: result.canal,
          estado_envio: result.estado
        })

      results.push({
        appointment_id: appt.id,
        client: client.nombre,
        ...result
      })
    }

    return new Response(JSON.stringify({ 
      message: `Processed ${appointments.length} reminders`,
      results
    }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })
  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    })
  }
})
