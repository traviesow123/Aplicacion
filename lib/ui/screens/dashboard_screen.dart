import 'package:flutter/material.dart';
// Para usar launchUrl se requeriría el paquete 'url_launcher'
// import 'package:url_launcher/url_launcher.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({Key? key}) : super(key: key);

  @override
  _DashboardScreenState createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  // Simulación de base de datos de citas del día
  final List<Map<String, dynamic>> _appointments = [
    {
      'id': '1',
      'clientName': 'Juan Pérez',
      'service': 'Corte Clásico',
      'time': '10:00 AM',
      'phone': '5551234567',
      'status': 'confirmado', // verde
    },
    {
      'id': '2',
      'clientName': 'María García',
      'service': 'Tinte y Peinado',
      'time': '12:30 PM',
      'phone': '5559876543',
      'status': 'pendiente', // amarillo
    },
    {
      'id': '3',
      'clientName': 'Carlos López',
      'service': 'Limpieza Facial',
      'time': '04:00 PM',
      'phone': '5554443333',
      'status': 'cancelado', // rojo
    },
  ];

  Future<void> _openWhatsApp(String phone, String clientName) async {
    // Eliminar caracteres no numéricos
    final cleanPhone = phone.replaceAll(RegExp(r'\D'), '');
    final text = Uri.encodeComponent("Hola $clientName, te escribo desde la agenda...");
    final urlString = 'whatsapp://send?phone=$cleanPhone&text=$text';
    
    // Simulación de url_launcher
    // final Uri url = Uri.parse(urlString);
    // if (await canLaunchUrl(url)) {
    //   await launchUrl(url);
    // } else { ... }
    
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Abriendo WhatsApp para $clientName...')),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'confirmado':
        return Colors.greenAccent;
      case 'pendiente':
        return Colors.amberAccent;
      case 'cancelado':
        return Colors.redAccent;
      default:
        return Colors.white54;
    }
  }

  IconData _getStatusIcon(String status) {
    switch (status) {
      case 'confirmado':
        return Icons.check_circle_outline;
      case 'pendiente':
        return Icons.access_time;
      case 'cancelado':
        return Icons.cancel_outlined;
      default:
        return Icons.help_outline;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0F13), // Premium Dark
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Agenda de Hoy', style: TextStyle(fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_circle_outline, color: Colors.cyanAccent),
            onPressed: () {
              // Navegar a CreateAppointmentScreen
            },
          )
        ],
      ),
      body: Stack(
        children: [
          // Ambient Glow
          Positioned(
            top: 50,
            right: -100,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.blueAccent.withOpacity(0.05),
                backgroundBlendMode: BlendMode.screen,
              ),
            ),
          ),
          
          SafeArea(
            child: ListView.builder(
              padding: const EdgeInsets.all(16.0),
              itemCount: _appointments.length,
              itemBuilder: (context, index) {
                final appt = _appointments[index];
                return _buildAppointmentCard(appt);
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAppointmentCard(Map<String, dynamic> appt) {
    final statusColor = _getStatusColor(appt['status']);
    
    return Container(
      margin: const EdgeInsets.only(bottom: 16.0),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: statusColor.withOpacity(0.3), 
          width: 1.5
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.2),
            blurRadius: 10,
            offset: const Offset(0, 5),
          )
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: IntrinsicHeight(
          child: Row(
            children: [
              // Indicador de color lateral
              Container(
                width: 6,
                color: statusColor,
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Row(
                    children: [
                      // Hora de la cita
                      SizedBox(
                        width: 70,
                        child: Text(
                          appt['time'],
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 15,
                          ),
                        ),
                      ),
                      // Separador vertical
                      Container(
                        width: 1,
                        height: 40,
                        color: Colors.white24,
                        margin: const EdgeInsets.symmetric(horizontal: 12),
                      ),
                      // Detalles del cliente
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              appt['clientName'],
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              appt['service'],
                              style: TextStyle(
                                color: Colors.white.withOpacity(0.6),
                                fontSize: 14,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Icon(_getStatusIcon(appt['status']), size: 14, color: statusColor),
                                const SizedBox(width: 4),
                                Text(
                                  appt['status'].toString().toUpperCase(),
                                  style: TextStyle(
                                    color: statusColor,
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ],
                            )
                          ],
                        ),
                      ),
                      // Acción: Abrir WhatsApp
                      IconButton(
                        icon: const Icon(Icons.chat_bubble_outline),
                        color: Colors.greenAccent,
                        iconSize: 28,
                        tooltip: 'Abrir Chat',
                        onPressed: () => _openWhatsApp(appt['phone'], appt['clientName']),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
