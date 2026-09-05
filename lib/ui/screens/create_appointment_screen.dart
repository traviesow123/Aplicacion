import 'package:flutter/material.dart';
import '../widgets/voice_magic_button.dart';
import '../../services/ai_parser_service.dart';
import '../../services/device_contacts_service.dart';
import '../../services/whatsapp_validation_service.dart';
import 'dart:async';

class CreateAppointmentScreen extends StatefulWidget {
  const CreateAppointmentScreen({Key? key}) : super(key: key);

  @override
  _CreateAppointmentScreenState createState() => _CreateAppointmentScreenState();
}

class _CreateAppointmentScreenState extends State<CreateAppointmentScreen> {
  final _formKey = GlobalKey<FormState>();
  
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _serviceController = TextEditingController();
  final TextEditingController _phoneController = TextEditingController();
  DateTime _selectedDate = DateTime.now();

  bool _isProcessingVoice = false;
  
  // WhatsApp Validation State
  bool _isCheckingWhatsApp = false;
  bool? _isWhatsAppValid;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    DeviceContactsService.requestPermission();
  }

  void _onVoiceProcessed(Map<String, dynamic> parsedData) {
    setState(() {
      _nameController.text = parsedData['name'] ?? _nameController.text;
      _serviceController.text = parsedData['service'] ?? _serviceController.text;
      if (parsedData['date'] != null) {
        _selectedDate = parsedData['date'] as DateTime;
      }
      _isProcessingVoice = false;
    });
    
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Formulario autocompletado con éxito ✨'),
        backgroundColor: Colors.greenAccent,
      ),
    );
  }

  void _onPhoneChanged(String value) {
    if (_debounce?.isActive ?? false) _debounce!.cancel();
    
    setState(() {
      _isWhatsAppValid = null;
      if (value.length < 5) return;
      _isCheckingWhatsApp = true;
    });

    _debounce = Timer(const Duration(milliseconds: 800), () async {
      bool isValid = await WhatsAppValidationService.verifyWhatsAppAccount(value);
      setState(() {
        _isWhatsAppValid = isValid;
        _isCheckingWhatsApp = false;
      });
    });
  }

  Future<void> _saveNewContact() async {
    final name = _nameController.text;
    final phone = _phoneController.text;
    if (name.isEmpty || phone.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Por favor, ingresa nombre y teléfono primero.')),
      );
      return;
    }

    bool saved = await DeviceContactsService.saveNewContact(name, phone);
    if (saved) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Contacto guardado en tu agenda 📱'), backgroundColor: Colors.cyan),
      );
    }
  }

  Future<void> _selectDateTime(BuildContext context) async {
    // ... [código del selector de fecha omitido para brevedad, usando la versión anterior]
    final DateTime? pickedDate = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime.now(),
      lastDate: DateTime(2101),
    );
    if (pickedDate != null) {
      setState(() {
        _selectedDate = pickedDate;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0F13), 
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Nueva Cita', style: TextStyle(fontWeight: FontWeight.w600)),
        centerTitle: true,
      ),
      body: Stack(
        children: [
          Positioned(
            top: -100,
            left: -100,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.cyanAccent.withOpacity(0.1),
                backgroundBlendMode: BlendMode.screen,
              ),
            ),
          ),
          
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
              child: Form(
                key: _formKey,
                child: ListView(
                  children: [
                    _buildGlassCard(
                      child: Column(
                        children: [
                          _buildAutocompleteNameField(),
                          const SizedBox(height: 16),
                          _buildTextField(_serviceController, 'Servicio (ej. Corte)', Icons.content_cut),
                          const SizedBox(height: 16),
                          _buildPhoneField(),
                          const SizedBox(height: 16),
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: const Icon(Icons.calendar_today_outlined, color: Colors.cyanAccent),
                            title: const Text('Fecha y Hora', style: TextStyle(color: Colors.white70)),
                            subtitle: Text(
                              "${_selectedDate.toLocal()}".split('.')[0].substring(0, 16),
                              style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                            ),
                            trailing: TextButton(
                              onPressed: () => _selectDateTime(context),
                              child: const Text('Cambiar', style: TextStyle(color: Colors.cyanAccent)),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 120),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerFloat,
      floatingActionButton: VoiceMagicButton(
        onVoiceStart: () => setState(() => _isProcessingVoice = true),
        onVoiceResult: _onVoiceProcessed,
        onSave: () {
          if (_formKey.currentState!.validate()) {
            if (_isWhatsAppValid == false) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('No se puede guardar: Número sin WhatsApp.'), backgroundColor: Colors.redAccent),
              );
              return;
            }
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Cita guardada correctamente.')),
            );
          }
        },
      ),
    );
  }

  Widget _buildGlassCard({required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white.withOpacity(0.1), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.2),
            blurRadius: 15,
            spreadRadius: 5,
          )
        ],
      ),
      child: child,
    );
  }

  Widget _buildAutocompleteNameField() {
    return Autocomplete<DeviceContact>(
      optionsBuilder: (TextEditingValue textEditingValue) async {
        if (textEditingValue.text.length < 2) return const Iterable<DeviceContact>.empty();
        return await DeviceContactsService.searchContacts(textEditingValue.text);
      },
      displayStringForOption: (DeviceContact option) => option.displayName,
      onSelected: (DeviceContact selection) {
        _nameController.text = selection.displayName;
        if (selection.phoneNumber != null) {
          _phoneController.text = selection.phoneNumber!;
          _onPhoneChanged(selection.phoneNumber!);
        }
      },
      fieldViewBuilder: (context, controller, focusNode, onFieldSubmitted) {
        // Sincronizar controlador interno de Autocomplete con el nuestro
        controller.addListener(() { _nameController.text = controller.text; });
        return _buildTextField(controller, 'Nombre del Cliente', Icons.person_outline, focusNode: focusNode);
      },
      optionsViewBuilder: (context, onSelected, options) {
        return Align(
          alignment: Alignment.topLeft,
          child: Material(
            elevation: 4.0,
            color: const Color(0xFF1E1E1E),
            borderRadius: BorderRadius.circular(16),
            child: SizedBox(
              width: 300,
              height: 200,
              child: ListView.builder(
                padding: const EdgeInsets.all(8.0),
                itemCount: options.length,
                itemBuilder: (BuildContext context, int index) {
                  final DeviceContact option = options.elementAt(index);
                  return ListTile(
                    leading: const Icon(Icons.person, color: Colors.cyanAccent),
                    title: Text(option.displayName, style: const TextStyle(color: Colors.white)),
                    subtitle: Text(option.phoneNumber ?? '', style: const TextStyle(color: Colors.white54)),
                    onTap: () => onSelected(option),
                  );
                },
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildPhoneField() {
    return TextFormField(
      controller: _phoneController,
      style: const TextStyle(color: Colors.white),
      keyboardType: TextInputType.phone,
      onChanged: _onPhoneChanged,
      decoration: InputDecoration(
        labelText: 'Teléfono',
        labelStyle: TextStyle(color: Colors.white.withOpacity(0.6)),
        prefixIcon: Icon(Icons.phone_outlined, color: Colors.cyanAccent.withOpacity(0.8)),
        suffixIcon: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            // WhatsApp Validation Indicator
            if (_isCheckingWhatsApp)
              const Padding(
                padding: EdgeInsets.all(12.0),
                child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.cyanAccent)),
              )
            else if (_isWhatsAppValid == true)
              const Icon(Icons.check_circle, color: Colors.greenAccent)
            else if (_isWhatsAppValid == false)
              const Icon(Icons.error_outline, color: Colors.redAccent),
            
            // Add Contact Button
            IconButton(
              icon: const Icon(Icons.person_add_alt_1, color: Colors.white70),
              tooltip: 'Guardar en agenda',
              onPressed: _saveNewContact,
            ),
          ],
        ),
        filled: true,
        fillColor: Colors.white.withOpacity(0.05),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(
            color: _isWhatsAppValid == false ? Colors.redAccent : Colors.cyanAccent, 
            width: 1
          ),
        ),
      ),
      validator: (value) {
        if (value == null || value.isEmpty) return 'Requerido';
        if (_isWhatsAppValid == false) return 'Este número no tiene WhatsApp';
        return null;
      },
    );
  }

  Widget _buildTextField(TextEditingController controller, String label, IconData icon, {FocusNode? focusNode}) {
    return TextFormField(
      controller: controller,
      focusNode: focusNode,
      style: const TextStyle(color: Colors.white),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: TextStyle(color: Colors.white.withOpacity(0.6)),
        prefixIcon: Icon(icon, color: Colors.cyanAccent.withOpacity(0.8)),
        filled: true,
        fillColor: Colors.white.withOpacity(0.05),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: Colors.cyanAccent, width: 1),
        ),
      ),
      validator: (value) => value == null || value.isEmpty ? 'Requerido' : null,
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _serviceController.dispose();
    _phoneController.dispose();
    _debounce?.cancel();
    super.dispose();
  }
}
