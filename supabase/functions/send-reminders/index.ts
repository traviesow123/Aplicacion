import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''
const TWILIO_WHATSAPP_FROM = Deno.env.get('TWILIO_WHATSAPP_FROM') ?? 'whatsapp:+14155238886'
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * Formatea un número de teléfono para Costa Rica.
 * Acepta: 8888-1234, 88881234, 50688881234, +50688881234
 * Retorna: 50688881234 (sin +)
 */
function formatPhoneNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 8) return '506' + digits
  if (digits.length > 8 && !digits.startsWith('506')) return '506' + digits
  return digits
}

/**
 * Enviar mensaje por WhatsApp con Twilio
 */
async function sendWhatsApp(to: string, body: string): Promise<boolean> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.warn('[WhatsApp] Twilio credentials no configuradas. Simulando envío a:', to)
    return true // Simular éxito para desarrollo
  }

  const formattedTo = formatPhoneNumber(to)
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

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`[WhatsApp] Error ${response.status}: ${errorBody}`)
    }
    return response.ok
  } catch (e) {
    console.error('[WhatsApp] Error de red:', e)
    return false
  }
}

/**
 * Enviar correo de recordatorio vía Resend
 */
async function sendEmailReminder(
  to: string,
  name: string,
  service: string,
  timeStr: string,
  dateStr: string,
  businessName: string = 'Calendario Inteligente'
): Promise<boolean> {
  if (!RESEND_API_KEY || !to) return false

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${businessName} <citas@resend.dev>`,
        to: [to],
        subject: `📅 Recordatorio: Tu cita para ${service} es mañana`,
        html: `
          <div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;max-width:560px;margin:0 auto;background:#0C0A09;border-radius:16px;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#D4A853,#C88B2E);padding:24px 28px;">
              <h1 style="color:#0C0A09;font-size:22px;font-weight:800;margin:0;">📅 Recordatorio de Cita</h1>
              <p style="color:rgba(12,10,9,0.7);font-size:13px;margin:4px 0 0;font-weight:600;">${businessName}</p>
            </div>
            <div style="padding:28px;">
              <p style="color:#FAF9F6;font-size:15px;line-height:1.6;margin:0 0 20px;">
                Hola <strong>${name}</strong>,<br>
                Te recordamos que tienes una cita programada:
              </p>
              <div style="background:#1C1917;padding:20px;border-radius:12px;margin:0 0 20px;border-left:4px solid #D4A853;">
                <table style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td style="padding:6px 0;color:#78716C;font-size:13px;font-weight:600;width:80px;">Servicio</td>
                    <td style="padding:6px 0;color:#FAF9F6;font-size:14px;font-weight:700;">${service}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#78716C;font-size:13px;font-weight:600;">Fecha</td>
                    <td style="padding:6px 0;color:#FAF9F6;font-size:14px;font-weight:700;">${dateStr}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;color:#78716C;font-size:13px;font-weight:600;">Hora</td>
                    <td style="padding:6px 0;color:#FAF9F6;font-size:14px;font-weight:700;">${timeStr}</td>
                  </tr>
                </table>
              </div>
              <p style="color:#B8B0A8;font-size:14px;line-height:1.5;margin:0 0 16px;">
                Por favor confirma tu asistencia respondiendo a este correo o al WhatsApp con <strong>SI</strong> o <strong>NO</strong>.
              </p>
              <div style="text-align:center;margin:24px 0;">
                <a href="mailto:?subject=Confirmo%20mi%20cita&body=SI%2C%20confirmo%20mi%20cita" style="display:inline-block;background:linear-gradient(135deg,#D4A853,#C88B2E);color:#0C0A09;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:800;font-size:14px;">
                  ✅ Confirmar Asistencia
                </a>
              </div>
            </div>
            <div style="padding:16px 28px;background:#1C1917;border-top:1px solid rgba(255,255,255,0.07);">
              <p style="color:#78716C;font-size:11px;margin:0;text-align:center;font-weight:500;">
                Enviado automáticamente por ${businessName} · Calendario Inteligente
              </p>
            </div>
          </div>
        `,
      }),
    })

    if (!res.ok) {
      const errorBody = await res.text()
      console.error(`[Email] Error ${res.status}: ${errorBody}`)
    }
    return res.ok
  } catch (e) {
    console.error('[Email] Error enviando correo:', e)
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

    const now = new Date()
    // Ventana de búsqueda: citas entre 20h y 28h en el futuro
    // Esto cubre el rango de "aproximadamente 24h antes" con margen
    const windowStart = new Date(now.getTime() + 20 * 60 * 60 * 1000)
    const windowEnd = new Date(now.getTime() + 28 * 60 * 60 * 1000)

    console.log(`[send-reminders] ${now.toISOString()} — Buscando citas entre ${windowStart.toISOString()} y ${windowEnd.toISOString()}`)

    // Buscar citas pendientes que aún no tienen recordatorio enviado
    const { data: appointments, error } = await supabaseClient
      .from('user_appointments')
      .select('*, user_id')
      .in('estado', ['pendiente'])
      .or('reminder_sent.is.null,reminder_sent.eq.false')
      .gte('fecha_hora', windowStart.toISOString())
      .lte('fecha_hora', windowEnd.toISOString())

    if (error) throw error

    if (!appointments || appointments.length === 0) {
      console.log('[send-reminders] No hay recordatorios pendientes en esta ventana.')
      return new Response(JSON.stringify({
        success: true,
        message: 'No hay recordatorios pendientes en esta ventana de 24h',
        processed: 0,
        timestamp: now.toISOString(),
      }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Agrupar citas por user_id para obtener sus settings
    const userIds = [...new Set(appointments.map(a => a.user_id))]
    const { data: settingsData } = await supabaseClient
      .from('user_settings')
      .select('*')
      .in('user_id', userIds)

    const settingsMap = new Map()
    if (settingsData) {
      for (const s of settingsData) {
        settingsMap.set(s.user_id, s)
      }
    }

    const results = []

    for (const appt of appointments) {
      try {
        const userSettings = settingsMap.get(appt.user_id) || {}
        const isReminderEnabled = userSettings.reminder_enabled !== false
        const isEmailEnabled = userSettings.email_reminder_enabled !== false
        const businessName = userSettings.business_name || 'Calendario Inteligente'

        if (!isReminderEnabled) {
          console.log(`[send-reminders] Recordatorios desactivados para usuario ${appt.user_id}, saltando cita ${appt.id}`)
          continue
        }

        const dt = new Date(appt.fecha_hora)
        const timeStr = dt.toLocaleTimeString('es-CR', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
        const dateStr = dt.toLocaleDateString('es-CR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })

        // Usar la plantilla personalizada del usuario si existe
        const template = userSettings.reminder_template ||
          'Hola {nombre}, te recordamos tu cita para *{servicio}* mañana ({hora}).\n\n¿Confirmás tu asistencia?\n👉 Responde *SI* para confirmar\n👉 Responde *NO* para cancelar'

        const message = template
          .replace(/{nombre}/g, appt.nombre)
          .replace(/{servicio}/g, appt.servicio)
          .replace(/{hora}/g, timeStr)

        let waOk = false
        if (appt.telefono) {
          waOk = await sendWhatsApp(appt.telefono, message)
          console.log(`[send-reminders] WhatsApp ${waOk ? '✅' : '❌'} → ${appt.nombre} (${appt.telefono})`)
        }

        let emailOk = false
        if (appt.email && isEmailEnabled) {
          emailOk = await sendEmailReminder(appt.email, appt.nombre, appt.servicio, timeStr, dateStr, businessName)
          console.log(`[send-reminders] Email ${emailOk ? '✅' : '❌'} → ${appt.nombre} (${appt.email})`)
        }

        // Marcar como enviado (incluso si falló, para no reintentar infinitamente)
        await supabaseClient
          .from('user_appointments')
          .update({
            reminder_sent: true,
            reminder_sent_at: new Date().toISOString(),
          })
          .eq('id', appt.id)

        results.push({
          id: appt.id,
          nombre: appt.nombre,
          whatsapp_sent: waOk,
          email_sent: emailOk,
        })
      } catch (apptError) {
        // Error en una cita individual no debe detener el batch
        console.error(`[send-reminders] Error procesando cita ${appt.id}:`, apptError)
        results.push({
          id: appt.id,
          nombre: appt.nombre,
          error: apptError.message,
        })
      }
    }

    console.log(`[send-reminders] Procesados: ${results.length} recordatorios`)

    return new Response(JSON.stringify({
      success: true,
      message: `Se procesaron ${results.length} recordatorios automáticos`,
      timestamp: now.toISOString(),
      results,
    }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('[send-reminders] Error fatal:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
