-- ============================================
-- Migración: Tablas multi-usuario con RLS
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- 1. Tabla de Citas vinculada a auth.users
CREATE TABLE IF NOT EXISTS user_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre VARCHAR(255) NOT NULL,
  servicio VARCHAR(255) NOT NULL,
  telefono VARCHAR(50),
  fecha_hora TIMESTAMPTZ NOT NULL,
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente','confirmado','cancelado')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de Clientes vinculada a auth.users
CREATE TABLE IF NOT EXISTS user_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre VARCHAR(255) NOT NULL,
  telefono VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, nombre)
);

-- 3. Tabla de Servicios vinculada a auth.users
CREATE TABLE IF NOT EXISTS user_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  emoji VARCHAR(10) DEFAULT '⭐',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- 4. Tabla de Configuración del Usuario
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_enabled BOOLEAN DEFAULT false,
  reminder_template TEXT DEFAULT 'Hola {nombre}, te recordamos tu cita para *{servicio}* mañana a las {hora}. ¿Confirmás tu asistencia?',
  reminded_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Row Level Security (RLS)
-- Cada usuario solo accede a sus propios datos
-- ============================================

ALTER TABLE user_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Políticas para user_appointments
CREATE POLICY "Users can view own appointments" ON user_appointments
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own appointments" ON user_appointments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own appointments" ON user_appointments
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own appointments" ON user_appointments
  FOR DELETE USING (auth.uid() = user_id);

-- Políticas para user_clients
CREATE POLICY "Users can view own clients" ON user_clients
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own clients" ON user_clients
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own clients" ON user_clients
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own clients" ON user_clients
  FOR DELETE USING (auth.uid() = user_id);

-- Políticas para user_services
CREATE POLICY "Users can view own services" ON user_services
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own services" ON user_services
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own services" ON user_services
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own services" ON user_services
  FOR DELETE USING (auth.uid() = user_id);

-- Políticas para user_settings
CREATE POLICY "Users can view own settings" ON user_settings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON user_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON user_settings
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- Índices de rendimiento
-- ============================================
CREATE INDEX IF NOT EXISTS idx_appointments_user_date 
  ON user_appointments(user_id, fecha_hora);
CREATE INDEX IF NOT EXISTS idx_appointments_user_estado 
  ON user_appointments(user_id, estado);
CREATE INDEX IF NOT EXISTS idx_clients_user 
  ON user_clients(user_id);
CREATE INDEX IF NOT EXISTS idx_services_user 
  ON user_services(user_id);
