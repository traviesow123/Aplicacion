-- ============================================
-- Migración: Tablas multi-usuario con RLS
-- Calendario Inteligente (Automatización 24h WhatsApp & Correo)
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- 1. Tabla de Citas vinculada a auth.users
CREATE TABLE IF NOT EXISTS user_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre VARCHAR(255) NOT NULL,
  servicio VARCHAR(255) NOT NULL,
  telefono VARCHAR(50),
  email VARCHAR(255),
  fecha_hora TIMESTAMPTZ NOT NULL,
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente','confirmado','cancelado')),
  reminder_sent BOOLEAN DEFAULT false,
  reminder_sent_at TIMESTAMPTZ,
  reminder_response TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Si la tabla ya existía, asegurar que las nuevas columnas existan
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_appointments' AND column_name='email') THEN
    ALTER TABLE user_appointments ADD COLUMN email VARCHAR(255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_appointments' AND column_name='reminder_sent') THEN
    ALTER TABLE user_appointments ADD COLUMN reminder_sent BOOLEAN DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_appointments' AND column_name='reminder_sent_at') THEN
    ALTER TABLE user_appointments ADD COLUMN reminder_sent_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_appointments' AND column_name='reminder_response') THEN
    ALTER TABLE user_appointments ADD COLUMN reminder_response TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_appointments' AND column_name='notas') THEN
    ALTER TABLE user_appointments ADD COLUMN notas TEXT;
  END IF;
END $$;

-- 2. Tabla de Clientes vinculada a auth.users
CREATE TABLE IF NOT EXISTS user_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre VARCHAR(255) NOT NULL,
  telefono VARCHAR(50),
  email VARCHAR(255),
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, nombre)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_clients' AND column_name='email') THEN
    ALTER TABLE user_clients ADD COLUMN email VARCHAR(255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_clients' AND column_name='notas') THEN
    ALTER TABLE user_clients ADD COLUMN notas TEXT;
  END IF;
END $$;

-- 3. Tabla de Servicios vinculada a auth.users
CREATE TABLE IF NOT EXISTS user_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  emoji VARCHAR(10) DEFAULT '⭐',
  duracion_min INTEGER DEFAULT 30,
  precio NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_services' AND column_name='duracion_min') THEN
    ALTER TABLE user_services ADD COLUMN duracion_min INTEGER DEFAULT 30;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_services' AND column_name='precio') THEN
    ALTER TABLE user_services ADD COLUMN precio NUMERIC(10,2);
  END IF;
END $$;

-- 4. Tabla de Configuración del Usuario
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_enabled BOOLEAN DEFAULT true,
  reminder_template TEXT DEFAULT 'Hola {nombre}, te recordamos tu cita para *{servicio}* mañana a las {hora}. ¿Confirmás tu asistencia? Respondé *SI* para confirmar o *NO* para cancelar.',
  email_reminder_enabled BOOLEAN DEFAULT true,
  reminder_minutes_before INTEGER DEFAULT 15,
  reminder_24h_enabled BOOLEAN DEFAULT true,
  push_subscription JSONB,
  push_enabled BOOLEAN DEFAULT true,
  business_name VARCHAR(255),
  reminded_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='email_reminder_enabled') THEN
    ALTER TABLE user_settings ADD COLUMN email_reminder_enabled BOOLEAN DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='reminder_minutes_before') THEN
    ALTER TABLE user_settings ADD COLUMN reminder_minutes_before INTEGER DEFAULT 15;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='reminder_24h_enabled') THEN
    ALTER TABLE user_settings ADD COLUMN reminder_24h_enabled BOOLEAN DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='push_subscription') THEN
    ALTER TABLE user_settings ADD COLUMN push_subscription JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='push_enabled') THEN
    ALTER TABLE user_settings ADD COLUMN push_enabled BOOLEAN DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_settings' AND column_name='business_name') THEN
    ALTER TABLE user_settings ADD COLUMN business_name VARCHAR(255);
  END IF;
END $$;

-- ============================================
-- Row Level Security (RLS)
-- Cada usuario solo accede a sus propios datos
-- ============================================

ALTER TABLE user_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Políticas para user_appointments
DROP POLICY IF EXISTS "Users can view own appointments" ON user_appointments;
CREATE POLICY "Users can view own appointments" ON user_appointments FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own appointments" ON user_appointments;
CREATE POLICY "Users can insert own appointments" ON user_appointments FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own appointments" ON user_appointments;
CREATE POLICY "Users can update own appointments" ON user_appointments FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own appointments" ON user_appointments;
CREATE POLICY "Users can delete own appointments" ON user_appointments FOR DELETE USING (auth.uid() = user_id);

-- Service role bypass para cron jobs (recordatorios automáticos)
DROP POLICY IF EXISTS "Service role full access appointments" ON user_appointments;
CREATE POLICY "Service role full access appointments" ON user_appointments
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Políticas para user_clients
DROP POLICY IF EXISTS "Users can view own clients" ON user_clients;
CREATE POLICY "Users can view own clients" ON user_clients FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own clients" ON user_clients;
CREATE POLICY "Users can insert own clients" ON user_clients FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own clients" ON user_clients;
CREATE POLICY "Users can update own clients" ON user_clients FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own clients" ON user_clients;
CREATE POLICY "Users can delete own clients" ON user_clients FOR DELETE USING (auth.uid() = user_id);

-- Políticas para user_services
DROP POLICY IF EXISTS "Users can view own services" ON user_services;
CREATE POLICY "Users can view own services" ON user_services FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own services" ON user_services;
CREATE POLICY "Users can insert own services" ON user_services FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own services" ON user_services;
CREATE POLICY "Users can update own services" ON user_services FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own services" ON user_services;
CREATE POLICY "Users can delete own services" ON user_services FOR DELETE USING (auth.uid() = user_id);

-- Políticas para user_settings
DROP POLICY IF EXISTS "Users can view own settings" ON user_settings;
CREATE POLICY "Users can view own settings" ON user_settings FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
CREATE POLICY "Users can insert own settings" ON user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;
CREATE POLICY "Users can update own settings" ON user_settings FOR UPDATE USING (auth.uid() = user_id);

-- Service role bypass para settings (leer templates de recordatorio)
DROP POLICY IF EXISTS "Service role full access settings" ON user_settings;
CREATE POLICY "Service role full access settings" ON user_settings
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- Índices de rendimiento
-- ============================================
CREATE INDEX IF NOT EXISTS idx_appointments_user_date ON user_appointments(user_id, fecha_hora);
CREATE INDEX IF NOT EXISTS idx_appointments_user_estado ON user_appointments(user_id, estado);
CREATE INDEX IF NOT EXISTS idx_appointments_auto_reminder ON user_appointments(estado, fecha_hora, reminder_sent);
CREATE INDEX IF NOT EXISTS idx_appointments_phone ON user_appointments(telefono);
CREATE INDEX IF NOT EXISTS idx_appointments_email ON user_appointments(email);
CREATE INDEX IF NOT EXISTS idx_clients_user ON user_clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON user_clients(user_id, telefono);
CREATE INDEX IF NOT EXISTS idx_services_user ON user_services(user_id);
