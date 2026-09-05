-- ============================================================
-- Programación Automática de Recordatorios (pg_cron + pg_net)
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Habilitar extensiones requeridas
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Función que llama a la Edge Function de recordatorios
CREATE OR REPLACE FUNCTION invoke_send_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  edge_function_url text := 'https://tyzdjkazimkzthvfaglt.supabase.co/functions/v1/send-reminders';
  anon_key text := 'sb_publishable_dyp1_RiEW2w1pvB6YgDPmQ_CK5wYJVz';
BEGIN
  -- Llamada HTTP asíncrona a la Edge Function cada hora
  PERFORM net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key
    )
  );
END;
$$;

-- 3. Desprogramar cualquier cron anterior con el mismo nombre (idempotente)
DO $$
BEGIN
  PERFORM cron.unschedule('send_hourly_reminders');
EXCEPTION WHEN OTHERS THEN
  -- Ignorar si no existía
END $$;

-- 4. Programar la ejecución automática en el minuto 0 de cada hora
-- (Busca citas exactamente 24 horas antes y envía WhatsApp/Email con Keywords SI/NO)
SELECT cron.schedule(
  'send_hourly_reminders',
  '0 * * * *',
  'SELECT invoke_send_reminders()'
);
