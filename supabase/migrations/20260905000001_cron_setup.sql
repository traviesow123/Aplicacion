-- ============================================================
-- Programación Automática de Recordatorios (pg_cron + pg_net)
-- Calendario Inteligente — Ejecución cada 15 minutos
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Habilitar extensiones requeridas
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Función que llama a la Edge Function de recordatorios
--    IMPORTANTE: Usa service_role_key para bypasear RLS y poder
--    leer/actualizar citas de TODOS los usuarios.
CREATE OR REPLACE FUNCTION invoke_send_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  edge_function_url text;
  service_key text;
BEGIN
  -- Obtener la URL y key desde las variables de configuración de Supabase
  -- En producción, estas se configuran como secrets en el dashboard.
  -- Fallback a los valores directos si no están configurados.
  edge_function_url := coalesce(
    nullif(current_setting('app.settings.edge_function_url', true), ''),
    'https://tyzdjkazimkzthvfaglt.supabase.co/functions/v1/send-reminders'
  );
  service_key := current_setting('app.settings.service_role_key', true);

  IF service_key IS NULL OR service_key = '' THEN
    RAISE WARNING '[Calendario IA] app.settings.service_role_key no configurado. Configura con: ALTER DATABASE postgres SET "app.settings.service_role_key" = ''tu_key'';';
    RETURN;
  END IF;

  -- Llamada HTTP asíncrona a la Edge Function
  -- Usa service_role_key (NO anon_key) para poder leer todas las citas
  PERFORM net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object(
      'triggered_at', now()::text,
      'source', 'pg_cron'
    )
  );

  RAISE LOG '[Calendario IA] Recordatorios invocados a las %', now();
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[Calendario IA] Error invocando recordatorios: %', SQLERRM;
END;
$$;

-- 3. Desprogramar cualquier cron anterior con el mismo nombre (idempotente)
DO $$
BEGIN
  PERFORM cron.unschedule('send_reminder_check');
EXCEPTION WHEN OTHERS THEN
  -- Ignorar si no existía
END $$;

-- Limpiar el nombre viejo también
DO $$
BEGIN
  PERFORM cron.unschedule('send_hourly_reminders');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 4. Programar la ejecución automática cada 15 minutos
--    Esto busca citas en ventana de ~24h y envía WhatsApp/Email
--    Frecuencia de 15 min garantiza que ninguna cita se pierda
SELECT cron.schedule(
  'send_reminder_check',
  '*/15 * * * *',
  'SELECT invoke_send_reminders()'
);
