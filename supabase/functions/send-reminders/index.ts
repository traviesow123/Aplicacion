import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? 'whatsapp:+14155238886'
const TWILIO_SMS_FROM = Deno.env.get('TWILIO_SMS_FROM') ?? '+14155238886'
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''

/**
 * Enviar mensaje por WhatsApp con Twilio
 */
async function sendWhatsApp(to: string, body: string): Promise<boolean> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.warn('[WhatsApp] Twilio credentials no configuradas. Simulando envío a:', to)
    return true
  }

  let formattedTo = to.replace(/\D/g, '')
  if (formattedTo.length === 8) formattedTo = '506' + formattedTo
  if (!formattedTo.startsWith('506') && formattedTo.length === 8) formattedTo = '506' + formattedTo

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  const params = new URLSearchParams({
    From: TWILIO_WHATSAPP_FROM,
    To: `whatsapp:+${formattedTo}`,
    Body: body,
  })

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
    return response.ok
  } catch (e) {
    console.error('[WhatsApp] Error en envío:', e)
    return false
  }
}

/**
 * Enviar correo de recordatorio (vía Resend) si se especificó email
 */
async function sendEmailReminder(to: string, name: string, service: string, timeStr: string, dateStr: string): Promise<boolean> {
  if (!RESEND_API_KEY || !to) return false

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Calendario Inteligente <citas@resend.dev>',
        to: [to],
        subject: `Recordatorio: Tu cita para ${service} es mañana`,
        html: `
          <div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:24px;border-radius:12px;background:#1C1917;color:#FAF9F6;">
            <h2 style="color:#D4A853;margin-top:0;">Recordatorio de Cita</h2>
            <p>Hola <strong>${name}</strong>,</p>
            <p>Te recordamos que tienes una cita programada para <strong>${service}</strong>:</p>
            <div style="background:#292524;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid #D4A853;">
              <p style="margin:4px 0;">📅 <strong>Fecha:</strong> ${dateStr}</p>
              <p style="margin:4px 0;">⏰ <strong>Hora:</strong> ${timeStr}</p>
            </div>
            <p>Por favor confirma tu asistencia respondiendo a este correo o al WhatsApp.</p>
            <p style="color:#78716C;font-size:12px;margin-top:24px;">Enviado automáticamente por Calendario Inteligente</p>
          </div>
        `,
      }),
    })
    return res.ok
  } catch (e) {
    console.error('[Email] Error enviando correo:', e)
    return false
  }
}

serve(async (req) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const now = new Date()
    // Ventana de 24 horas antes: Citas entre 20h y 28h en el futuro que no hayan recibido recordatorio
    const windowStart = new Date(now.getTime() + 20 * 60 * 60 * 1000)
    const windowEnd = new Date(now.getTime() + 28 * 60 * 60 * 1000)

    console.log(`[send-reminders] Buscando citas entre ${windowStart.toISOString()} y ${windowEnd.toISOString()}`)

    const { data: appointments, error } = await supabaseClient
      .from('user_appointments')
      .select('*')
      .eq('estado', 'pendiente')
      .or('reminder_sent.is.null,reminder_sent.eq.false')
      .gte('fecha_hora', windowStart.toISOString())
      .lte('fecha_hora', windowEnd.toISOString())

    if (error) throw error

    if (!appointments || appointments.length === 0) {
      return new Response(JSON.stringify({ message: "No hay recordatorios pendientes en esta ventana de 24h", processed: 0 }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })
    }

    const results = []

    for (const appt of appointments) {
      const dt = new Date(appt.fecha_hora)
      const timeStr = dt.toLocaleTimeString('es-CR', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true
      })
      const dateStr = dt.toLocaleDateString('es-CR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      })

      // Mensaje estructurado con Keywords SI / NO claros
      const message = `Hola ${appt.nombre}, te recordamos tu cita para *${appt.servicio}* mañana (${timeStr}).\n\n¿Confirmás tu asistencia?\n👉 Responde *SI* para confirmar\n👉 Responde *NO* para cancelar`

      let waOk = false
      if (appt.telefono) {
        waOk = await sendWhatsApp(appt.telefono, message)
      }

      let emailOk = false
      if (appt.email) {
        emailOk = await sendEmailReminder(appt.email, appt.nombre, appt.servicio, timeStr, dateStr)
      }

      // Marcar cita como recordatorio enviado
      await supabaseClient
        .from('user_appointments')
        .update({
          reminder_sent: true,
          reminder_sent_at: new Date().toISOString()
        })
        .eq('id', appt.id)

      results.push({
        id: appt.id,
        nombre: appt.nombre,
        whatsapp_sent: waOk,
        email_sent: emailOk
      })
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Se procesaron ${results.length} recordatorios automáticos`,
      results
    }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })

  } catch (error) {
    console.error('[send-reminders] Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    })
  }
})
