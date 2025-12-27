import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'dart:async'; // Zamanlayıcı için gerekli

// Kendi sayfalarını import et
import 'ana_sayfa.dart'; 
import 'kayit_ekrani.dart'; 

void main() {
  runApp(const OgrenciTakipUygulamasi());
}

// lib/sabitler.dart
class Sabitler {
  static const String baseUrl = "http://127.0.0.1:3000";
}

class OgrenciTakipUygulamasi extends StatelessWidget {
  const OgrenciTakipUygulamasi({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Öğrenci Takip Sistemi',
      theme: ThemeData(
        primarySwatch: Colors.blue, // Mavi tema
        useMaterial3: true,
      ),
     
     home: const GirisEkrani(),
    );
  }
}

// --- 1. ÖZEL SPLASH EKRANI (Logo Gösterme Kısmı) ---
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    // 3 Saniye Sonra Giriş Ekranına Git
    Timer(const Duration(seconds: 3), () {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (context) => const GirisEkrani()),
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white, // Arka plan beyaz
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // LOGOYU BURADA GÖSTERİYORUZ
            Image.asset(
              'assets/app_icon.png', 
              width: 250, 
              height: 250,
              // Eğer resim yüklenemezse hata vermesin, ikon göstersin:
              errorBuilder: (context, error, stackTrace) {
                return const Icon(Icons.school, size: 100, color: Colors.blueAccent);
              },
            ),
 
             const SizedBox(height: 20), // Logo ile Yazı arasındaki boşluk

            // 2. YENİ EKLENEN KISIM: UYGULAMA ADI
            const Text(
              "Öğrenci Takip Sistemi",
              style: TextStyle(
                fontSize: 28,                 // Yazı büyüklüğü
                fontWeight: FontWeight.bold,  // Kalın yazı
                color: Colors.black87,        // Koyu gri/siyah renk
                letterSpacing: 1.5,           // Harfler arası hafif boşluk (Modern durur)
              ),
            ),

            const SizedBox(height: 30),
            const CircularProgressIndicator(color: Colors.blueAccent), // Dönen çember
          ],
        ),
      ),
    );
  }
}

// --- 2. SENİN GİRİŞ EKRANIN (Aynen Korundu) ---
class GirisEkrani extends StatefulWidget {
  const GirisEkrani({super.key});

  @override
  State<GirisEkrani> createState() => _GirisEkraniState();
}

class _GirisEkraniState extends State<GirisEkrani> {
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _sifreController = TextEditingController();
  bool _yukleniyor = false; // Butonda dönen çember için

  // --- GİRİŞ YAP FONKSİYONU ---
  Future<void> girisYap() async {
    if (_emailController.text.isEmpty || _sifreController.text.isEmpty) {
      mesajGoster("Lütfen tüm alanları doldurun!", false);
      return;
    }

    setState(() => _yukleniyor = true); // Yükleniyor başlat

    final url = Uri.parse('${Sabitler.baseUrl}/giris');

    try {
      final response = await http.post(
        url,
        headers: {"Content-Type": "application/json"},
        body: jsonEncode({
          "email": _emailController.text,
          "sifre": _sifreController.text,
        }),
      );

      if (response.statusCode == 200) {
        var data = jsonDecode(response.body);
        String token = data['token'];

        mesajGoster("Giriş Başarılı! Yönlendiriliyorsunuz...", true);

        if (mounted) {
          Future.delayed(const Duration(seconds: 1), () {
            Navigator.pushReplacement(
              context,
              MaterialPageRoute(builder: (context) => AnaSayfa(token: token)),
            );
          });
        }
      } else {
        var errorData = jsonDecode(response.body);
        mesajGoster("Hata: ${errorData['hata'] ?? 'Giriş sırasında hata oluştu.'}", false);
      }
    } catch (e) {
      print("Hata oluştu: $e");
      mesajGoster("Sunucuya bağlanılamadı! Backend çalışıyor mu?", false);
    } finally {
      if (mounted) setState(() => _yukleniyor = false); // Yükleniyor bitir
    }
  }

  // --- ŞİFREMİ UNUTTUM (SAYAÇLI & URL DÜZELTİLMİŞ) ---
  void _sifremiUnuttumPenceresi() {
    TextEditingController emailCtrl = TextEditingController();
    
    // Sayaç için değişkenler
    int kalanSure = 0; 
    Timer? zamanlayici;

    showDialog(
      context: context,
      barrierDismissible: false, // Dışarı tıklayınca kapanmasın
      builder: (context) {
        // Dialog içinde ekranı yenilemek için StatefulBuilder şart!
        return StatefulBuilder(
          builder: (context, setStateDialog) {
            
            void sayaciBaslat() {
              setStateDialog(() => kalanSure = 60); // 60 saniye
              zamanlayici = Timer.periodic(const Duration(seconds: 1), (timer) {
                if (kalanSure > 0) {
                  setStateDialog(() => kalanSure--);
                } else {
                  zamanlayici?.cancel();
                }
              });
            }

            return AlertDialog(
              title: const Text("Şifre Sıfırlama"),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text("Lütfen kayıtlı e-posta adresinizi girin."),
                  const SizedBox(height: 10),
                  TextField(
                    controller: emailCtrl, 
                    keyboardType: TextInputType.emailAddress, // @ klavyesi açılır
                    decoration: const InputDecoration(labelText: "E-Posta Adresi", border: OutlineInputBorder())
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: () {
                    zamanlayici?.cancel(); // Sayacı durdur
                    Navigator.pop(context);
                  }, 
                  child: const Text("İptal")
                ),
                
                ElevatedButton(
                  // Eğer süre bitmediyse butonu pasif yap (null ver)
                  onPressed: kalanSure > 0 ? null : () async {
                    if (emailCtrl.text.isEmpty) return;
                    
                    // Sayacı başlat
                    sayaciBaslat();

                    try {
                      final res = await http.post(
                        Uri.parse('${Sabitler.baseUrl}/forgot-password'), // ✅ Sabit URL
                        headers: {"Content-Type": "application/json"}, 
                        body: jsonEncode({"email": emailCtrl.text})
                      );
                      
                      if (res.statusCode == 200) {
                        // Dialog kapanmasın, kullanıcı isterse tekrar kod isteyebilsin diye bekletiyoruz
                        // Ama başarılı olduğu için kod ekranına yönlendiriyoruz:
                        zamanlayici?.cancel();
                        Navigator.pop(context); 
                        _kodDogrulamaPenceresi(emailCtrl.text); 
                        mesajGoster("Kod gönderildi. Lütfen mailinizi kontrol edin.", true);
                      } else {
                        mesajGoster("Hata: ${jsonDecode(res.body)['hata']}", false);
                      }
                    } catch (e) { 
                      mesajGoster("Bağlantı Hatası", false); 
                    }
                  },
                  child: Text(kalanSure > 0 ? "$kalanSure sn bekleyin" : "Kod Gönder"),
                )
              ],
            );
          },
        );
      },
    );
  }

  // --- KOD DOĞRULAMA (KLAVYE & ŞİFRE KONTROLÜ) ---
  void _kodDogrulamaPenceresi(String email) {
    TextEditingController kodCtrl = TextEditingController();
    TextEditingController passCtrl = TextEditingController();

    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text("Yeni Şifre Belirle"),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text("Gelen 6 haneli kodu girin:"),
            const SizedBox(height: 10),
            
            // 1. İYİLEŞTİRME: SADECE SAYI KLAVYESİ
            TextField(
              controller: kodCtrl, 
              keyboardType: TextInputType.number, // <--- Sadece rakamlar açılır
              maxLength: 6, // En fazla 6 karakter
              decoration: const InputDecoration(labelText: "Gelen Kod", border: OutlineInputBorder(), counterText: "")
            ),
            
            const SizedBox(height: 10),
            TextField(controller: passCtrl, obscureText: true, decoration: const InputDecoration(labelText: "Yeni Şifre", border: OutlineInputBorder())),
          ],
        ),
        actions: [
          ElevatedButton(
            onPressed: () async {
              // 2. İYİLEŞTİRME: ŞİFRE UZUNLUK KONTROLÜ
              if (passCtrl.text.length < 6) {
                mesajGoster("Şifre en az 6 karakter olmalıdır!", false);
                return;
              }

              try {
                final res = await http.post(
                  Uri.parse('${Sabitler.baseUrl}/sifre-sifirla'), // ✅ Sabit URL
                  headers: {"Content-Type": "application/json"}, 
                  body: jsonEncode({
                    "email": email, 
                    "kod": kodCtrl.text, 
                    "yeni_sifre": passCtrl.text
                  })
                );
                
                if (res.statusCode == 200) {
                   Navigator.pop(context); 
                  mesajGoster("Şifre Başarıyla Değiştirildi! Giriş Yapabilirsin.", true);
                } else {
                  mesajGoster("Hata: ${jsonDecode(res.body)['hata']}", false);
                }
              } catch (e) { mesajGoster("Bağlantı Hatası", false); }
            },
            child: const Text("Şifreyi Güncelle"),
          )
        ],
      ),
    );
  }
  void mesajGoster(String mesaj, bool basarili) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(mesaj), backgroundColor: basarili ? Colors.green : Colors.red, behavior: SnackBarBehavior.floating));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[100],
      body: Center(
        child: Container(
          width: 400,
          padding: const EdgeInsets.all(40),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 20, offset: const Offset(0, 10))],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.school, size: 80, color: Colors.blueAccent),
              const SizedBox(height: 20),
              const Text("Öğrenci Takip Sistemi", style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
              const SizedBox(height: 40),
              TextField(controller: _emailController, decoration: InputDecoration(labelText: "E-Posta Adresi", prefixIcon: const Icon(Icons.email), border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)))),
              const SizedBox(height: 20),
              TextField(controller: _sifreController, obscureText: true, decoration: InputDecoration(labelText: "Şifre", prefixIcon: const Icon(Icons.lock), border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)))),
              const SizedBox(height: 10),
              Align(alignment: Alignment.centerRight, child: TextButton(onPressed: _sifremiUnuttumPenceresi, child: const Text("Şifremi Unuttum?", style: TextStyle(color: Colors.grey)))),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: _yukleniyor ? null : girisYap,
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.blueAccent, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
                  child: _yukleniyor ? const CircularProgressIndicator(color: Colors.white) : const Text("Giriş Yap", style: TextStyle(fontSize: 18)),
                ),
              ),
              const SizedBox(height: 20),
              TextButton(onPressed: () { Navigator.push(context, MaterialPageRoute(builder: (context) => const KayitEkrani())); }, child: const Text("Hesabın yok mu? Kayıt Ol")),
            ],
          ),
        ),
      ),
    );
  }
}