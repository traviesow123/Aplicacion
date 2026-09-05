import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')

serve(async (req) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Twilio/Meta usualmente envían los datos como form-urlencoded o JSON
    const bodyText = await req.text()
    // Parche simple para extraer el teléfono y mensaje, asumiendo JSON de ejemplo
    // En prod dependría del proveedor exacto
    const data = JSON.parse(bodyText || "{}")
    const fromPhone = data.From || data.phone
    const incomingMsg = data.Body || data.message

    if (!fromPhone || !incomingMsg) {
      return new Response("Missing parameters", { status: 400 })
    }

    // 1. Encontrar al cliente por teléfono
    const { data: clients, error: clientError } = await supabaseClient
      .from('clients')
      .select('id')
      .eq('telefono', fromPhone)
    
    if (clientError || !clients || clients.length === 0) {
      return new Response("Client not found", { status: 200 })
    }
    
    const clientId = clients[0].id

    // 2. Encontrar la cita más reciente pendiente de este cliente
    const { data: appts, error: apptError } = await supabaseClient
      .from('appointments')
      .select('*')
      .eq('client_id', clientId)
      .eq('estado', 'pendiente')
      .order('fecha_hora', { ascending: true })
      .limit(1)

    if (apptError || !appts || appts.length === 0) {
      return new Response("No pending appointments", { status: 200 })
    }

    const appointment = appts[0]

    // 3. Consultar a GPT-4o-mini para entender la intención
    const prompt = `
      Eres un asistente de reservas. El cliente ha respondido a un recordatorio de cita.
      Su mensaje es: "${incomingMsg}"
      Clasifica su intención estrictamente en formato JSON con dos campos:
      - "intent": "CONFIRMADO", "CANCELADO" o "REPROGRAMACION"
      - "suggested_date": String con la fecha/hora que sugiere, o null si no sugiere ninguna.
    `

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      })
    })

    const aiResult = await aiResponse.json()
    const parsedIntent = JSON.parse(aiResult.choices[0].message.content)

    // 4. Actualizar la base de datos según la intención
    let newStatus = 'pendiente'
    if (parsedIntent.intent === 'CONFIRMADO') newStatus = 'confirmado'
    else if (parsedIntent.intent === 'CANCELADO') newStatus = 'cancelado'
    else if (parsedIntent.intent === 'REPROGRAMACION') newStatus = 'reprogramando'

    await supabaseClient
      .from('appointments')
      .update({ estado: newStatus })
      .eq('id', appointment.id)

    // 5. Registrar la interacción
    await supabaseClient
      .from('reminder_logs')
      .update({ respuesta_cliente: incomingMsg })
      .eq('appointment_id', appointment.id)
      .eq('canal', 'whatsapp')

    // 6. Notificar al negocio (simulado)
    if (newStatus === 'reprogramando') {
      console.log(`Alertar al negocio: el cliente quiere reprogramar para ${parsedIntent.suggested_date}`)
      // Aquí se enviaría un email o push notification
    }

    return new Response(JSON.stringify({ success: true, intent: parsedIntent.intent }), {
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
