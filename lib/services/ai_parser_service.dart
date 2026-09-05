class AIParserService {
  /// Procesa el texto hablado y extrae las entidades.
  /// En un entorno real, esto haría una llamada a una API (ej. Supabase Edge Function conectada a OpenAI).
  /// Para este prototipo, utilizamos una simulación basada en reglas básicas.
  static Future<Map<String, dynamic>> parseAppointmentText(String text) async {
    // Simulando latencia de red para la API de IA
    await Future.delayed(const Duration(milliseconds: 800));

    String lowerText = text.toLowerCase();
    
    // Resultados por defecto
    String? name;
    String? service;
    DateTime? date;

    // 1. Extraer nombre rudimentariamente (muy básico para simulación)
    if (lowerText.contains("para")) {
      final parts = lowerText.split("para");
      if (parts.length > 1) {
        final afterPara = parts[1].trim().split(" ");
        if (afterPara.isNotEmpty) {
          name = afterPara[0]; // ej. "juan"
          // Capitalizar la primera letra
          name = name[0].toUpperCase() + name.substring(1);
        }
      }
    }

    // 2. Extraer servicio
    if (lowerText.contains("corte")) {
      service = "Corte";
    } else if (lowerText.contains("limpieza") || lowerText.contains("dental")) {
      service = "Limpieza Dental";
    } else if (lowerText.contains("tinte")) {
      service = "Tinte";
    }

    // 3. Extraer fecha/hora (Mañana a las 4)
    DateTime now = DateTime.now();
    int dayOffset = 0;
    
    if (lowerText.contains("mañana")) {
      dayOffset = 1;
    } else if (lowerText.contains("pasado mañana")) {
      dayOffset = 2;
    }
    
    int hour = now.hour;
    if (lowerText.contains("a las 4") || lowerText.contains("4 de la tarde") || lowerText.contains("4 pm")) {
      hour = 16;
    } else if (lowerText.contains("a las 10") || lowerText.contains("10 am") || lowerText.contains("10 de la mañana")) {
      hour = 10;
    }

    date = DateTime(now.year, now.month, now.day + dayOffset, hour, 0);

    return {
      "name": name,
      "service": service,
      "date": date,
    };
  }
}
