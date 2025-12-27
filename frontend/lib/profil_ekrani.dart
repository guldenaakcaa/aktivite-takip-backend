import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:jwt_decoder/jwt_decoder.dart';
import 'main.dart'; 

class ProfilEkrani extends StatefulWidget {
  final String token;
  const ProfilEkrani({super.key, required this.token});

  @override
  State<ProfilEkrani> createState() => _ProfilEkraniState();
}

class _ProfilEkraniState extends State<ProfilEkrani> {
  // Kullanıcı Durumu
  String _rol = "ogrenci";
  bool _yukleniyor = true;

  // Form Kontrolcüleri (Kişisel Bilgi)
  final TextEditingController _adSoyadCtrl = TextEditingController();
  final TextEditingController _emailCtrl = TextEditingController();
  
  // Form Kontrolcüleri (Şifre)
  final TextEditingController _eskiSifreCtrl = TextEditingController();
  final TextEditingController _yeniSifreCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _guncelBilgileriGetir();
  }

  // Backend'den en güncel veriyi çek
  Future<void> _guncelBilgileriGetir() async {
    try {
      final res = await http.get(
   Uri.parse('${Sabitler.baseUrl}/profil/bilgi'),
        headers: {"Authorization": "Bearer ${widget.token}"},
      );

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        setState(() {
          _adSoyadCtrl.text = data['ad_soyad'];
          _emailCtrl.text = data['email'];
          _rol = data['rol'];
          _yukleniyor = false;
        });
      }
    } catch (e) {
      print("Hata: $e");
      setState(() => _yukleniyor = false);
    }
  }

  // --- İSİM VE EMAIL GÜNCELLE ---
  Future<void> _bilgileriGuncelle() async {
    setState(() => _yukleniyor = true);
    try {
      final res = await http.put(
        Uri.parse('${Sabitler.baseUrl}/profil/guncelle'),
        headers: {"Authorization": "Bearer ${widget.token}", "Content-Type": "application/json"},
        body: jsonEncode({
          "ad_soyad": _adSoyadCtrl.text,
          "email": _emailCtrl.text
        }),
      );
      
      final data = jsonDecode(res.body);
      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Bilgiler güncellendi! ✅"), backgroundColor: Colors.green));
      } else {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(data['hata'] ?? "Hata"), backgroundColor: Colors.red));
      }
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Bağlantı hatası."), backgroundColor: Colors.red));
    }
    setState(() => _yukleniyor = false);
  }

  // --- ŞİFRE DEĞİŞTİR ---
  Future<void> _sifreDegistir() async {
    if (_eskiSifreCtrl.text.isEmpty || _yeniSifreCtrl.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Şifre alanları boş olamaz.")));
      return;
    }
    
    setState(() => _yukleniyor = true);
    try {
      final res = await http.post(
       Uri.parse('${Sabitler.baseUrl}/profil/sifre-degistir'),
        headers: {"Authorization": "Bearer ${widget.token}", "Content-Type": "application/json"},
        body: jsonEncode({
          "eski_sifre": _eskiSifreCtrl.text,
          "yeni_sifre": _yeniSifreCtrl.text
        }),
      );
      final data = jsonDecode(res.body);
      
      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(data['mesaj']), backgroundColor: Colors.green));
        _eskiSifreCtrl.clear();
        _yeniSifreCtrl.clear();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(data['hata']), backgroundColor: Colors.red));
      }
    } catch (_) {}
    setState(() => _yukleniyor = false);
  }

  void _cikisYap() {
    Navigator.pushAndRemoveUntil(context, MaterialPageRoute(builder: (c) => const GirisEkrani()), (r) => false);
  }

  @override
  Widget build(BuildContext context) {
    if (_yukleniyor && _adSoyadCtrl.text.isEmpty) return const Scaffold(body: Center(child: CircularProgressIndicator()));

    return Scaffold(
      backgroundColor: Colors.grey[50],
      appBar: AppBar(
        title: const Text("Profil Ayarları", style: TextStyle(color: Colors.black)),
        backgroundColor: Colors.white,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.black),
      ),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(20.0),
          child: Column(
            children: [
              // --- BAŞLIK KISMI ---
              Center(
                child: Column(
                  children: [
                    CircleAvatar(
                      radius: 40,
                      backgroundColor: Colors.indigo.shade100,
                      child: Text(
                        _adSoyadCtrl.text.isNotEmpty ? _adSoyadCtrl.text[0].toUpperCase() : "?",
                        style: const TextStyle(fontSize: 30, fontWeight: FontWeight.bold, color: Colors.indigo),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(_rol.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.grey)),
                  ],
                ),
              ),
              const SizedBox(height: 30),

              // --- KART 1: KİŞİSEL BİLGİLER ---
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(15), boxShadow: [BoxShadow(color: Colors.grey.withOpacity(0.1), blurRadius: 10)]),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text("Kişisel Bilgiler", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 15),
                    TextField(controller: _adSoyadCtrl, decoration: const InputDecoration(labelText: "Ad Soyad", prefixIcon: Icon(Icons.person_outline), border: OutlineInputBorder())),
                    const SizedBox(height: 15),
                    TextField(controller: _emailCtrl, decoration: const InputDecoration(labelText: "E-Posta", prefixIcon: Icon(Icons.email_outlined), border: OutlineInputBorder())),
                    const SizedBox(height: 15),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _bilgileriGuncelle,
                        style: ElevatedButton.styleFrom(backgroundColor: Colors.blueAccent, foregroundColor: Colors.white),
                        child: const Text("Bilgileri Güncelle"),
                      ),
                    )
                  ],
                ),
              ),

              const SizedBox(height: 20),

              // --- KART 2: GÜVENLİK ---
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(15), boxShadow: [BoxShadow(color: Colors.grey.withOpacity(0.1), blurRadius: 10)]),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text("Şifre Değiştir", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.redAccent)),
                    const SizedBox(height: 15),
                    TextField(controller: _eskiSifreCtrl, obscureText: true, decoration: const InputDecoration(labelText: "Eski Şifre", prefixIcon: Icon(Icons.lock_outline), border: OutlineInputBorder())),
                    const SizedBox(height: 15),
                    TextField(controller: _yeniSifreCtrl, obscureText: true, decoration: const InputDecoration(labelText: "Yeni Şifre", prefixIcon: Icon(Icons.vpn_key_outlined), border: OutlineInputBorder())),
                    const SizedBox(height: 15),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _sifreDegistir,
                        style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent, foregroundColor: Colors.white),
                        child: const Text("Şifreyi Değiştir"),
                      ),
                    )
                  ],
                ),
              ),

              const SizedBox(height: 30),
              TextButton.icon(
                onPressed: _cikisYap,
                icon: const Icon(Icons.logout, color: Colors.red),
                label: const Text("Çıkış Yap", style: TextStyle(color: Colors.red)),
              ),
              const SizedBox(height: 30),
            ],
          ),
        ),
      ),
    );
  }
}