import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:jwt_decoder/jwt_decoder.dart';
import 'ders_ekrani.dart';
import 'ders_olustur.dart'; 
import 'main.dart'; // Sabitler sınıfı için
import 'profil_ekrani.dart'; 

class AnaSayfa extends StatefulWidget {
  final String token;
  const AnaSayfa({super.key, required this.token});

  @override
  State<AnaSayfa> createState() => _AnaSayfaState();
}

class _AnaSayfaState extends State<AnaSayfa> {
  int _seciliSayfaIndex = 0; 
  String _adSoyad = "Kullanıcı";
  String _rol = "ogrenci";
  List _dersler = [];
  bool _yukleniyor = true;

  @override
  void initState() {
    super.initState();
    _kullaniciBilgisiCoz();
    _dersleriGetir();
  }

  void _kullaniciBilgisiCoz() {
    try {
      Map<String, dynamic> decodedToken = JwtDecoder.decode(widget.token);
      setState(() {
        _adSoyad = decodedToken['ad_soyad'] ?? "Kullanıcı";
        _rol = decodedToken['rol'] ?? "ogrenci";
      });
    } catch (e) {
      print("Token hatası: $e");
    }
  }

  Future<void> _dersleriGetir() async {
    // ✅ URL DÜZELTİLDİ
    final url = Uri.parse('${Sabitler.baseUrl}/dersler/benim');
    try {
      final response = await http.get(url, headers: {"Authorization": "Bearer ${widget.token}"});
      if (response.statusCode == 200) {
        if (mounted) {
          setState(() {
            _dersler = jsonDecode(response.body);
            _yukleniyor = false;
          });
        }
      } else {
         if (mounted) setState(() => _yukleniyor = false);
      }
    } catch (e) { 
      print("Hata: $e"); 
      if (mounted) setState(() => _yukleniyor = false);
    }
  }

  // --- DERS SİLME FONKSİYONU ---
  Future<void> _dersSil(int dersId) async {
    bool? eminMisiniz = await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("Dersi Sil"),
        content: const Text("Bu dersi ve içindeki tüm verileri silmek istediğine emin misin? Bu işlem geri alınamaz."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text("İptal")),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red, foregroundColor: Colors.white),
            onPressed: () => Navigator.pop(context, true), 
            child: const Text("Sil")
          ),
        ],
      ),
    );

    if (eminMisiniz == true) {
      setState(() => _yukleniyor = true);
      try {
        // ✅ URL DÜZELTİLDİ
        final res = await http.delete(
          Uri.parse('${Sabitler.baseUrl}/dersler/sil/$dersId'),
          headers: {"Authorization": "Bearer ${widget.token}"}
        );

        if (res.statusCode == 200) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Ders silindi."), backgroundColor: Colors.redAccent));
          _dersleriGetir(); // Listeyi yenile
        } else {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Silme işlemi başarısız.")));
          setState(() => _yukleniyor = false);
        }
      } catch (e) {
         setState(() => _yukleniyor = false);
      }
    }
  }

  Widget _buildDashboard() {
    return Column(
      children: [
        // MODERN HEADER
        Container(
          width: double.infinity,
          padding: const EdgeInsets.only(top: 60, left: 25, right: 25, bottom: 30),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: const BorderRadius.only(bottomLeft: Radius.circular(40), bottomRight: Radius.circular(40)),
            boxShadow: [BoxShadow(color: Colors.grey.withOpacity(0.05), blurRadius: 20, offset: const Offset(0, 10))],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text("Hoş Geldin,", style: TextStyle(color: Colors.grey[400], fontSize: 16)),
                      Text(_adSoyad, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold, color: Colors.black87)),
                    ],
                  ),
                  CircleAvatar(
                    radius: 25,
                    backgroundColor: Colors.indigo.shade50,
                    child: Text(_adSoyad.isNotEmpty ? _adSoyad[0].toUpperCase() : "K", style: const TextStyle(color: Colors.indigo, fontWeight: FontWeight.bold)),
                  )
                ],
              ),
            ],
          ),
        ),

        const SizedBox(height: 10),

        Expanded(
          child: _yukleniyor
              ? const Center(child: CircularProgressIndicator())
              : _dersler.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.note_alt_outlined, size: 80, color: Colors.grey[300]),
                          const SizedBox(height: 15),
                          Text("Henüz dersiniz yok.", style: TextStyle(color: Colors.grey[400], fontSize: 16)),
                          if (_rol == 'ogrenci')
                            Padding(
                              padding: const EdgeInsets.only(top: 10),
                              child: OutlinedButton(
                                onPressed: _dersBulVeKaydolPenceresi, 
                                child: const Text("Ders Bul ve Katıl")
                              ),
                            )
                        ],
                      ),
                    )
                  : GridView.builder(
                      padding: const EdgeInsets.all(25),
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2,
                        crossAxisSpacing: 20,
                        mainAxisSpacing: 20,
                        childAspectRatio: 0.9, // Kartların boyunu biraz uzattık
                      ),
                      itemCount: _dersler.length,
                      itemBuilder: (context, index) {
                        return _buildDersKarti(_dersler[index], index);
                      },
                    ),
        ),
      ],
    );
  }

  Widget _buildDersKarti(dynamic ders, int index) {
    List<Color> renkler = [Colors.blue.shade50, Colors.purple.shade50, Colors.orange.shade50, Colors.teal.shade50];
    List<Color> ikonRenkleri = [Colors.blue, Colors.purple, Colors.orange, Colors.teal];
    Color bgRenk = renkler[index % renkler.length];
    Color anaRenk = ikonRenkleri[index % ikonRenkleri.length];

    return Stack(
      children: [
        // DERS KARTI (Tıklanabilir Alan)
        GestureDetector(
          onTap: () {
            Navigator.push(context, MaterialPageRoute(builder: (context) => DersEkrani(
              token: widget.token, dersAdi: ders['ders_adi'], dersId: ders['ders_id'], kullaniciRol: _rol,
            )));
          },
          child: Container(
            width: double.infinity,
            height: double.infinity,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.grey.withOpacity(0.1)),
              boxShadow: [BoxShadow(color: Colors.grey.withOpacity(0.05), blurRadius: 10, offset: const Offset(0, 4))],
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.all(15),
                  decoration: BoxDecoration(color: bgRenk, shape: BoxShape.circle),
                  child: Icon(Icons.book_rounded, color: anaRenk, size: 32),
                ),
                const SizedBox(height: 15),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: Text(
                    ders['ders_adi'],
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: Colors.black87),
                    maxLines: 2, overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (ders['ogretmen_adi'] != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      "Öğr: ${ders['ogretmen_adi']}", 
                      style: TextStyle(fontSize: 12, color: Colors.grey[500]),
                      textAlign: TextAlign.center,
                    ),
                  )
              ],
            ),
          ),
        ),

        // SİLME BUTONU (Sadece Öğretmen İçin)
        if (_rol == 'ogretmen')
          Positioned(
            top: 8,
            right: 8,
            child: InkWell(
              onTap: () => _dersSil(ders['ders_id']),
              child: Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(color: Colors.red.shade50, shape: BoxShape.circle),
                child: const Icon(Icons.delete_outline, color: Colors.red, size: 18),
              ),
            ),
          ),
      ],
    );
  }

  // --- DERS OLUŞTURMA PENCERESİ ---
  void _dersOlusturPenceresi() {
    // Eğer ayrı bir dosya yaptıysak onu çağırmak daha temizdir.
    // Ama basitlik için burada Dialog olarak bırakıyorum.
    TextEditingController adCtrl = TextEditingController();
    TextEditingController aciklamaCtrl = TextEditingController();
    
    showDialog(context: context, builder: (c) => AlertDialog(
      title: const Text("Yeni Ders Oluştur"), 
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        TextField(controller: adCtrl, decoration: const InputDecoration(labelText: "Ders Adı *", border: OutlineInputBorder())), 
        const SizedBox(height: 10),
        TextField(controller: aciklamaCtrl, maxLines: 2, decoration: const InputDecoration(labelText: "Açıklama", border: OutlineInputBorder()))
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c), child: const Text("İptal")),
        ElevatedButton(onPressed: () async {
          if (adCtrl.text.trim().isEmpty) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Ders adı boş olamaz!"), backgroundColor: Colors.red));
            return;
          }

          // ✅ URL DÜZELTİLDİ
          final res = await http.post(
            Uri.parse('${Sabitler.baseUrl}/dersler/olustur'), 
            headers: {"Authorization": "Bearer ${widget.token}", "Content-Type": "application/json"}, 
            body: jsonEncode({"ders_adi": adCtrl.text, "aciklama": aciklamaCtrl.text})
          );
          
          if (res.statusCode == 201) {
            Navigator.pop(c); 
            _dersleriGetir();
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Ders başarıyla oluşturuldu"), backgroundColor: Colors.green));
          } else {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Hata oluştu"), backgroundColor: Colors.red));
          }
        }, child: const Text("Oluştur"))
      ],
    ));
  }

  // --- DERS BUL VE KAYDOL (ÖĞRENCİ İÇİN) ---
  Future<void> _dersBulVeKaydolPenceresi() async {
    List tumDersler = [];
    bool yukleniyor = true;

    // Dialog içinde state yönetmek zordur, o yüzden StatefulBuilder kullanırız
    showDialog(context: context, builder: (c) => StatefulBuilder(
      builder: (context, setStateDialog) {
        
        // İlk açılışta veriyi çek
        if (yukleniyor) {
          // ✅ URL DÜZELTİLDİ
          http.get(Uri.parse('${Sabitler.baseUrl}/dersler/tum'), headers: {"Authorization": "Bearer ${widget.token}"})
            .then((res) {
              if (res.statusCode == 200) {
                setStateDialog(() {
                  tumDersler = jsonDecode(res.body);
                  yukleniyor = false;
                });
              }
            });
        }

        return AlertDialog(
          title: const Text("Ders Seç"),
          content: SizedBox(
            width: double.maxFinite, 
            height: 400, 
            child: yukleniyor 
              ? const Center(child: CircularProgressIndicator())
              : tumDersler.isEmpty 
                ? const Center(child: Text("Kayıt olunacak ders yok."))
                : ListView.builder(
                    itemCount: tumDersler.length, 
                    itemBuilder: (ctx, i) {
                      final d = tumDersler[i];
                      return Card(
                        margin: const EdgeInsets.symmetric(vertical: 5),
                        child: ListTile(
                          leading: CircleAvatar(child: Text(d['ders_adi'][0])),
                          title: Text(d['ders_adi'], style: const TextStyle(fontWeight: FontWeight.bold)), 
                          subtitle: Text("Öğr: ${d['ogretmen_adi']}"), 
                          trailing: ElevatedButton(
                            style: ElevatedButton.styleFrom(backgroundColor: Colors.blueAccent, foregroundColor: Colors.white),
                            onPressed: () async {
                               // ✅ URL DÜZELTİLDİ
                               final res = await http.post(
                                 Uri.parse('${Sabitler.baseUrl}/dersler/kayit'), 
                                 headers: {"Authorization": "Bearer ${widget.token}", "Content-Type": "application/json"}, 
                                 body: jsonEncode({"ders_id": d['ders_id']})
                               );
                               
                               if (res.statusCode == 201) {
                                  Navigator.pop(c); 
                                  _dersleriGetir(); // Ana listeyi yenile
                                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Derse kayıt olundu!"), backgroundColor: Colors.green));
                               } else {
                                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Zaten kayıtlısın veya hata oluştu."), backgroundColor: Colors.orange));
                               }
                            }, 
                            child: const Text("Katıl")
                          ),
                        ),
                      );
                    }
                  ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c), child: const Text("Kapat"))
          ],
        );
      }
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[50],
      // Sayfa geçişi
      body: _seciliSayfaIndex == 0 ? _buildDashboard() : ProfilEkrani(token: widget.token),
      
      // Floating Action Button (Sadece Ana Sayfada Gözüksün)
      floatingActionButton: _seciliSayfaIndex == 0 
        ? FloatingActionButton(
            onPressed: _rol == 'ogretmen' ? _dersOlusturPenceresi : _dersBulVeKaydolPenceresi,
            backgroundColor: Colors.indigo, 
            child: Icon(_rol == 'ogretmen' ? Icons.add : Icons.search, color: Colors.white),
          ) 
        : null,
      
      // Alt Menü
      bottomNavigationBar: Container(
        decoration: BoxDecoration(color: Colors.white, boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 20)]),
        child: BottomNavigationBar(
          currentIndex: _seciliSayfaIndex,
          onTap: (index) => setState(() => _seciliSayfaIndex = index),
          backgroundColor: Colors.white,
          elevation: 0,
          selectedItemColor: Colors.indigo,
          unselectedItemColor: Colors.grey[400],
          showSelectedLabels: true,
          showUnselectedLabels: false,
          type: BottomNavigationBarType.fixed,
          items: const [
            BottomNavigationBarItem(icon: Icon(Icons.grid_view_rounded), label: "Derslerim"), 
            BottomNavigationBarItem(icon: Icon(Icons.person_rounded), label: "Profil")
          ],
        ),
      ),
    );
  }
}