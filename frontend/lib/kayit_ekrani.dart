import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'main.dart'; // Sabitler sınıfına erişmek için

class KayitEkrani extends StatefulWidget {
  const KayitEkrani({super.key});

  @override
  State<KayitEkrani> createState() => _KayitEkraniState();
}

class _KayitEkraniState extends State<KayitEkrani> {
  // Form Anahtarı (Validation için gerekli)
  final _formKey = GlobalKey<FormState>();

  final TextEditingController _adSoyadCtrl = TextEditingController();
  final TextEditingController _emailCtrl = TextEditingController();
  final TextEditingController _sifreCtrl = TextEditingController();
  
  String _secilenRol = 'ogrenci'; // Varsayılan rol
  bool _yukleniyor = false;

  // --- KAYIT OL BUTONU ---
  Future<void> kayitOl() async {
    // 1. Önce Formu Kontrol Et (Validation)
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() => _yukleniyor = true);

    // ✅ DOĞRU ADRES KULLANIMI
    final url = Uri.parse('${Sabitler.baseUrl}/kayit');
    
    try {
      final response = await http.post(
        url,
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({
          "ad_soyad": _adSoyadCtrl.text,
          "email": _emailCtrl.text,
          "sifre": _sifreCtrl.text,
          "rol": _secilenRol
        }),
      );

      if (response.statusCode == 201) {
        mesajGoster("Kayıt Başarılı! Giriş yapabilirsin.", true);
        Navigator.pop(context); // Giriş ekranına dön
      } else {
        var hata = jsonDecode(response.body);
        mesajGoster("Hata: ${hata['hata'] ?? 'Kayıt başarısız.'}", false);
      }
    } catch (e) {
      // Debug print'i kaldırdık, temiz kod.
      mesajGoster("Sunucuya bağlanılamadı. İnternetinizi kontrol edin.", false);
    } finally {
      if (mounted) setState(() => _yukleniyor = false);
    }
  }

  void mesajGoster(String mesaj, bool basarili) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(mesaj),
      backgroundColor: basarili ? Colors.green : Colors.red,
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Yeni Hesap Oluştur"),
        backgroundColor: Colors.blueAccent, // Başlık rengi eklendi
        foregroundColor: Colors.white,
      ),
      body: Center(
        child: SingleChildScrollView( // Klavye açılınca taşmayı önler
          child: Container(
            width: 400,
            padding: const EdgeInsets.all(30),
            child: Form( // Validation için Form widget'ı şart
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.person_add, size: 60, color: Colors.blue),
                  const SizedBox(height: 20),
                  
                  // AD SOYAD
                  TextFormField(
                    controller: _adSoyadCtrl,
                    decoration: const InputDecoration(labelText: "Ad Soyad", border: OutlineInputBorder(), prefixIcon: Icon(Icons.person)),
                    validator: (value) {
                      if (value == null || value.isEmpty) return "Ad Soyad boş olamaz";
                      if (value.length < 3) return "En az 3 harf girin";
                      return null;
                    },
                  ),
                  const SizedBox(height: 15),

                  // E-POSTA
                  TextFormField(
                    controller: _emailCtrl,
                    keyboardType: TextInputType.emailAddress, // Klavye e-posta modu
                    decoration: const InputDecoration(labelText: "E-Posta", border: OutlineInputBorder(), prefixIcon: Icon(Icons.email)),
                    validator: (value) {
                      if (value == null || value.isEmpty) return "E-Posta boş olamaz";
                      if (!value.contains('@') || !value.contains('.')) return "Geçerli bir mail adresi girin";
                      return null;
                    },
                  ),
                  const SizedBox(height: 15),

                // ŞİFRE ALANI
                  TextFormField(
                    controller: _sifreCtrl,
                    obscureText: true,
                    decoration: const InputDecoration(labelText: "Şifre", border: OutlineInputBorder(), prefixIcon: Icon(Icons.lock)),
                    validator: (value) {
                      if (value == null || value.isEmpty) return "Şifre boş olamaz";
                      if (value.length < 6) return "Şifre en az 6 karakter olmalı"; // <--- Kontrol
                      return null;
                    },
                 ),
                  const SizedBox(height: 15),

                  // ROL SEÇİMİ
                  DropdownButtonFormField<String>(
                    value: _secilenRol,
                    decoration: const InputDecoration(labelText: "Rolünüz", border: OutlineInputBorder(), prefixIcon: Icon(Icons.work)),
                    items: const [
                      DropdownMenuItem(value: "ogrenci", child: Text("Öğrenci")),
                      DropdownMenuItem(value: "ogretmen", child: Text("Öğretmen")),
                    ],
                    onChanged: (val) => setState(() => _secilenRol = val!),
                  ),
                  const SizedBox(height: 25),

                  // KAYIT BUTONU
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      onPressed: _yukleniyor ? null : kayitOl,
                      style: ElevatedButton.styleFrom(backgroundColor: Colors.blue, foregroundColor: Colors.white),
                      child: _yukleniyor 
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)) 
                        : const Text("Kayıt Ol", style: TextStyle(fontSize: 18)),
                    ),
                  )
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}