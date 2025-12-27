import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'dart:async'; 
import 'package:record/record.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart'; // [EKLE] pubspec.yaml'a eklemelisin
import 'rapor_ekrani.dart';
import 'main.dart'; // Sabitler için

class DersEkrani extends StatefulWidget {
  final String token;
  final String dersAdi;
  final int dersId;
  final String kullaniciRol;

  const DersEkrani({
    super.key,
    required this.token,
    required this.dersAdi,
    required this.dersId,
    required this.kullaniciRol,
  });

  @override
  State<DersEkrani> createState() => _DersEkraniState();
}

class _DersEkraniState extends State<DersEkrani> {
  bool _dersteMi = false;
  bool _moladaMi = false;
  bool _yukleniyor = true;
  
  // SAYAÇ DEĞİŞKENLERİ
  Timer? _timer;
  Duration _gecenSure = Duration.zero;
  DateTime? _baslangicZamani; // Gerçek başlangıç zamanını tutmak için
  
  // Ses Kayıt
  late AudioRecorder _audioRecorder;
  bool _kayitYapiliyor = false;

  @override
  void initState() {
    super.initState();
    _audioRecorder = AudioRecorder();
    _durumKontrol();
    
    // Timer her saniye çalışsın ama hesabı 'fark' üzerinden yapsın
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if ((_dersteMi || _moladaMi) && _baslangicZamani != null) {
        setState(() {
          // Doğrusu bu: Her saniye şimdiki zaman ile başlangıç arasındaki farkı al
          _gecenSure = DateTime.now().difference(_baslangicZamani!);
        });
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel(); 
    _audioRecorder.dispose();
    super.dispose();
  }

  String _sureFormatla(Duration duration) {
    String ikiHane(int n) => n.toString().padLeft(2, "0");
    String saat = ikiHane(duration.inHours);
    String dakika = ikiHane(duration.inMinutes.remainder(60));
    String saniye = ikiHane(duration.inSeconds.remainder(60));
    return "$saat:$dakika:$saniye";
  }

  Future<void> _durumKontrol() async {
    final url = Uri.parse('${Sabitler.baseUrl}/aktivite/durum/${widget.dersId}');
    try {
      final response = await http.get(url, headers: {"Authorization": "Bearer ${widget.token}"});
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        
        DateTime? gelenBaslangic;
        if (data['baslangic'] != null) {
          gelenBaslangic = DateTime.parse(data['baslangic']).toLocal();
        }

        setState(() {
          _dersteMi = data['durum'] == 'DERSTE' || data['durum'] == 'MOLADA';
          _moladaMi = data['durum'] == 'MOLADA';
          _baslangicZamani = gelenBaslangic; // Başlangıç zamanını globale ata

          if (_baslangicZamani != null) {
            _gecenSure = DateTime.now().difference(_baslangicZamani!);
          } else {
            _gecenSure = Duration.zero;
          }
          
          _yukleniyor = false;
        });
      }
    } catch (e) { print(e); }
  }

  Future<void> _derseGirCikis() async {
    setState(() => _yukleniyor = true);
    String endpoint = _dersteMi ? '/aktivite/cikis' : '/aktivite/giris';
    final url = Uri.parse('${Sabitler.baseUrl}$endpoint');
    try {
      final response = await http.post(url, headers: {"Authorization": "Bearer ${widget.token}", "Content-Type": "application/json"}, body: jsonEncode({"ders_id": widget.dersId}));
      if (response.statusCode == 200) {
        await _durumKontrol();
      }
    } catch (_) {}
    setState(() => _yukleniyor = false);
  }

  Future<void> _molaIslemi() async {
    if (!_dersteMi) return;
    setState(() => _yukleniyor = true);
    // URL Düzeltmesi
    final endpoint = _moladaMi ? '/mola/bitir' : '/mola/baslat';
    final method = _moladaMi ? 'PUT' : 'POST'; // Backend'e göre mola bitir PUT olabilir
    
    final url = Uri.parse('${Sabitler.baseUrl}$endpoint');
    final headers = {"Authorization": "Bearer ${widget.token}", "Content-Type": "application/json"};
    final body = jsonEncode(_moladaMi ? {} : {"ders_id": widget.dersId, "sebep": "Kısa Mola"});

    try {
      http.Response response;
      if (_moladaMi) {
        // PUT İsteği
        response = await http.put(url, headers: headers, body: body);
      } else {
        // POST İsteği
        response = await http.post(url, headers: headers, body: body);
      }
      
      await _durumKontrol();
    } catch(e) { print(e); }
    setState(() => _yukleniyor = false);
  }

  // --- SES KAYIT İŞLEMLERİ ---
  Future<void> _sesKaydi() async {
    if (_kayitYapiliyor) {
      // Kaydı durdur
      final path = await _audioRecorder.stop();
      setState(() => _kayitYapiliyor = false);
      if (path != null) _sesDosyasiniYukle(path);
    } else {
      // Kaydı Başlat
      // ÖNCE İZİN KONTROLÜ
      var status = await Permission.microphone.request();
      if (status != PermissionStatus.granted) {
         ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Mikrofon izni gerekli!")));
         return;
      }

      if (await _audioRecorder.hasPermission()) {
        final dir = await getApplicationDocumentsDirectory();
        // Dosya ismini benzersiz yap
        String path = '${dir.path}/kayit_${DateTime.now().millisecondsSinceEpoch}.m4a';
        
        // Hata yakalama ekleyelim
        try {
          await _audioRecorder.start(const RecordConfig(), path: path);
          setState(() => _kayitYapiliyor = true);
        } catch (e) {
          print("Kayıt hatası: $e");
        }
      }
    }
  }

  Future<void> _sesDosyasiniYukle(String filePath) async {
    var request = http.MultipartRequest('POST', Uri.parse('${Sabitler.baseUrl}/sesli-not/yukle'));
    request.headers['Authorization'] = "Bearer ${widget.token}";
    request.fields['ders_id'] = widget.dersId.toString();
    request.files.add(await http.MultipartFile.fromPath('ses_dosyasi', filePath));
    
    var res = await request.send();
    if(mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res.statusCode == 201 ? "Ses Kaydedildi" : "Hata"), backgroundColor: res.statusCode == 201 ? Colors.green : Colors.red));
    }
  }

  @override
  Widget build(BuildContext context) {
    bool hocaMi = widget.kullaniciRol == 'ogretmen';
    
    Color durumRenk = Colors.grey;
    String durumYazi = "Beklemede";
    IconData durumIkon = Icons.school_outlined;

    if (_moladaMi) { durumRenk = Colors.orange; durumYazi = "Mola Süresi"; durumIkon = Icons.coffee; }
    else if (_dersteMi) { durumRenk = Colors.green; durumYazi = "Ders Süresi"; durumIkon = Icons.laptop_mac; }

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: Text(widget.dersAdi, style: const TextStyle(fontSize: 18)),
        backgroundColor: Colors.white,
        foregroundColor: Colors.black,
        elevation: 1,
        actions: [
          // Rapor ekranına giderken de token taşıyoruz
          if (hocaMi) IconButton(icon: const Icon(Icons.bar_chart, color: Colors.indigo), onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (context) => RaporEkrani(dersAdi: widget.dersAdi, dersId: widget.dersId, token: widget.token))))
        ],
      ),
      body: _yukleniyor ? const Center(child: CircularProgressIndicator()) : Padding(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          children: [
            // SAYAÇ KARTI
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 15),
              decoration: BoxDecoration(
                color: durumRenk.withOpacity(0.1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: durumRenk.withOpacity(0.5)),
              ),
              child: Row(
                children: [
                  Icon(durumIkon, color: durumRenk, size: 30),
                  const SizedBox(width: 15),
                  Expanded( 
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(durumYazi, style: const TextStyle(fontSize: 12, color: Colors.grey)),
                        Text(
                          _dersteMi ? _sureFormatla(_gecenSure) : "--:--:--",
                          style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: durumRenk, fontFamily: "Courier New"), 
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            
            const SizedBox(height: 30),

            // BUTONLAR
            if (!hocaMi) ...[
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton.icon(
                  onPressed: _derseGirCikis,
                  icon: Icon(_dersteMi ? Icons.exit_to_app : Icons.login),
                  label: Text(_dersteMi ? "Dersi Sonlandır" : "Derse Başla"),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _dersteMi ? Colors.red[50] : Colors.indigo,
                    foregroundColor: _dersteMi ? Colors.red : Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                ),
              ),

              const SizedBox(height: 15),

              if (_dersteMi)
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _molaIslemi,
                      icon: Icon(_moladaMi ? Icons.play_arrow : Icons.coffee, size: 18),
                      label: Text(_moladaMi ? "Dön" : "Mola"),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.orange[50],
                        foregroundColor: Colors.orange[800],
                        elevation: 0,
                        padding: const EdgeInsets.symmetric(vertical: 15),
                      ),
                    ),
                  ),
                  const SizedBox(width: 15),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _sesKaydi,
                      icon: Icon(_kayitYapiliyor ? Icons.stop : Icons.mic, size: 18),
                      label: Text(_kayitYapiliyor ? "Bitir" : "Kayıt"),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _kayitYapiliyor ? Colors.red[50] : Colors.blue[50], // Kayıt sırasında kırmızı ton
                        foregroundColor: _kayitYapiliyor ? Colors.red : Colors.blue[800],
                        elevation: 0,
                        padding: const EdgeInsets.symmetric(vertical: 15),
                      ),
                    ),
                  ),
                ],
              ),
            ] else 
              const Center(child: Text("Öğrenci aktivitelerini takip etmek için\nsağ üstteki rapor ikonunu kullanın.", textAlign: TextAlign.center, style: TextStyle(color: Colors.grey))),
          ],
        ),
      ),
    );
  }
}