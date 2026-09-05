import 'package:flutter/material.dart';
import '../../services/ai_parser_service.dart';

class VoiceMagicButton extends StatefulWidget {
  final VoidCallback onVoiceStart;
  final Function(Map<String, dynamic>) onVoiceResult;
  final VoidCallback onSave;

  const VoiceMagicButton({
    Key? key,
    required this.onVoiceStart,
    required this.onVoiceResult,
    required this.onSave,
  }) : super(key: key);

  @override
  _VoiceMagicButtonState createState() => _VoiceMagicButtonState();
}

class _VoiceMagicButtonState extends State<VoiceMagicButton> with SingleTickerProviderStateMixin {
  bool _isListening = false;
  bool _isReadyToSave = false;
  late AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  void _handlePress() async {
    if (_isReadyToSave) {
      widget.onSave();
      setState(() => _isReadyToSave = false);
      return;
    }

    if (!_isListening) {
      // Iniciar escucha
      setState(() => _isListening = true);
      widget.onVoiceStart();
      
      // Simulación de reconocimiento de voz y procesamiento por IA
      // En producción, aquí se usaría el paquete `speech_to_text`
      await Future.delayed(const Duration(seconds: 3)); // Simulando 3 segundos de audio hablado
      
      // Simulación del texto reconocido
      String spokenText = "Corte para Juan mañana a las 4 de la tarde";
      
      // Procesar texto con IA local o API
      Map<String, dynamic> parsed = await AIParserService.parseAppointmentText(spokenText);
      
      widget.onVoiceResult(parsed);
      
      setState(() {
        _isListening = false;
        _isReadyToSave = true;
      });
    } else {
      // Detener escucha manualmente
      setState(() => _isListening = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: _handlePress,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
        width: _isReadyToSave ? 200 : 80,
        height: 80,
        decoration: BoxDecoration(
          color: _isReadyToSave 
              ? Colors.greenAccent 
              : (_isListening ? Colors.pinkAccent : Colors.cyanAccent),
          borderRadius: BorderRadius.circular(40),
          boxShadow: [
            BoxShadow(
              color: (_isReadyToSave ? Colors.greenAccent : Colors.cyanAccent).withOpacity(0.5),
              blurRadius: _isListening ? 30 : 15,
              spreadRadius: _isListening ? 10 : 2,
            )
          ],
        ),
        child: Center(
          child: _isReadyToSave
              ? const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.check, color: Colors.black, size: 30),
                    SizedBox(width: 8),
                    Text(
                      'Confirmar',
                      style: TextStyle(
                        color: Colors.black,
                        fontWeight: FontWeight.bold,
                        fontSize: 18,
                      ),
                    ),
                  ],
                )
              : FadeTransition(
                  opacity: _isListening ? _pulseController : const AlwaysStoppedAnimation(1.0),
                  child: Icon(
                    _isListening ? Icons.graphic_eq : Icons.mic,
                    color: Colors.black,
                    size: 36,
                  ),
                ),
        ),
      ),
    );
  }
}
