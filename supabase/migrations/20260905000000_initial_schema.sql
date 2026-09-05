-- Enum para el estado de las citas
CREATE TYPE appointment_status AS ENUM ('pendiente', 'confirmado', 'cancelado', 'reprogramando');

-- Enum para los canales de recordatorio
CREATE TYPE reminder_channel AS ENUM ('whatsapp', 'email');

-- 1. Tabla de Negocios
CREATE TABLE businesses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(255) NOT NULL,
    tipo_negocio VARCHAR(100) NOT NULL, -- ej. 'barberia', 'dentista'
    configuracion_recordatorios JSONB DEFAULT '{}', -- Permite configuraciones flexibles (ej. {"whatsapp_enabled": true, "horas_previas": 24})
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabla de Clientes
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    nombre VARCHAR(255) NOT NULL,
    telefono VARCHAR(50),
    email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Un cliente no debería estar duplicado en el mismo negocio con el mismo teléfono/email
    UNIQUE(business_id, telefono) 
);

-- 3. Tabla de Citas (Appointments)
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    servicio VARCHAR(255) NOT NULL,
    fecha_hora TIMESTAMP WITH TIME ZONE NOT NULL,
    estado appointment_status DEFAULT 'pendiente',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabla de Registro de Recordatorios (Reminder Logs)
CREATE TABLE reminder_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    canal reminder_channel NOT NULL,
    estado_envio VARCHAR(50) NOT NULL, -- ej. 'enviado', 'entregado', 'leido', 'fallido'
    respuesta_cliente TEXT, -- Respuesta del cliente si aplica (ej. "Confirmo", "Cancelar")
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
