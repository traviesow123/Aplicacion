-- Habilitar la extensión pg_cron (necesaria en Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net; -- Necesaria para hacer requests HTTP a nuestras Edge Functions

-- Crear una función en la BD que invoca la Edge Function de recordatorios
CREATE OR REPLACE FUNCTION invoke_send_reminders()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  edge_function_url text := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders';
  anon_key text := current_setting('app.settings.anon_key', true); -- Reemplazar en config real
BEGIN
  -- Llamada HTTP usando pg_net
  PERFORM net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key
    )
  );
END;
$$;

-- Programar el job para que se ejecute en el minuto 0 de cada hora
SELECT cron.schedule(
  'send_hourly_reminders',
  '0 * * * *',
  'SELECT invoke_send_reminders()'
);
