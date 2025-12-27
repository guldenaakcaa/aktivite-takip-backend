import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'main.dart';

class DersOlusturmaEkrani extends StatefulWidget {
  final String token; // Öğretmen token'ı
  final Function onDersOlusturuldu; // Ders oluşturulunca paneli yenilemek için

  const DersOlusturmaEkrani({
    super.key,
    required this.token,
    required this.onDersOlusturuldu,
  });

  @override
  State<DersOlusturmaEkrani> createState() => _DersOlusturmaEkraniState();
}

class _DersOlusturmaEkraniState extends State<DersOlusturmaEkrani> {
  final TextEditingController _adController = TextEditingController();
  final TextEditingController _aciklamaController = TextEditingController();

  bool _yukleniyor = false;

  Future<void> dersOlustur() async {
    final ad = _adController.text.trim();
    final aciklama = _aciklamaController.text.trim();

    if (ad.isEmpty || aciklama.isEmpty) {
      _mesajGoster("Lütfen tüm alanları doldurun.", false);
      return;
    }

    setState(() => _yukleniyor = true);

// dersOlustur() fonksiyonu içinde:
// dersOlustur() fonksiyonu içinde:
final url = Uri.parse('${Sabitler.baseUrl}/dersler/olustur');   try {
      final response = await http.post(
        url,
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer ${widget.token}",
        },
        body: jsonEncode({
          "ders_adi": ad,
          "aciklama": aciklama,
        }),
      );

      setState(() => _yukleniyor = false);

      if (response.statusCode == 201) {
        _mesajGoster("Ders başarıyla oluşturuldu.", true);

        widget.onDersOlusturuldu(); // Ana sayfa listesini yenile

        Future.delayed(const Duration(milliseconds: 800), () {
          Navigator.pop(context);
        });
      } else {
        var err = jsonDecode(response.body);
        _mesajGoster("Hata: ${err['hata'] ?? 'Ders oluşturulamadı.'}", false);
      }
    } catch (e) {
      setState(() => _yukleniyor = false);
      _mesajGoster("Sunucuya bağlanılamadı. Backend çalışıyor mu?", false);
    }
  }

  void _mesajGoster(String mesaj, bool ok) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(mesaj),
        backgroundColor: ok ? Colors.green : Colors.red,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("Yeni Ders Oluştur"),
        backgroundColor: Colors.blueAccent,
        foregroundColor: Colors.white,
      ),
      body: Center(
        child: Container(
          width: 500,
          padding: const EdgeInsets.all(30),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.1),
                blurRadius: 10,
              )
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _adController,
                decoration: const InputDecoration(
                  labelText: "Ders Adı",
                  prefixIcon: Icon(Icons.class_),
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 20),

              TextField(
                controller: _aciklamaController,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: "Açıklama",
                  prefixIcon: Icon(Icons.description),
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 30),

              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton.icon(
                  onPressed: _yukleniyor ? null : dersOlustur,
                  icon: _yukleniyor
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        )
                      : const Icon(Icons.add_box),
                  label: Text(
                    _yukleniyor ? "Oluşturuluyor..." : "Ders Oluştur",
                    style: const TextStyle(fontSize: 18),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green,
                    foregroundColor: Colors.white,
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
