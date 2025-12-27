import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'package:fl_chart/fl_chart.dart'; // Grafik Paketi
import 'package:audioplayers/audioplayers.dart'; // Ses Oynatma
import 'package:intl/intl.dart'; // Tarih Formatı
import 'main.dart'; // Sabitler sınıfı için

class RaporEkrani extends StatefulWidget {
  final String dersAdi;
  final int dersId;
  final String token;

  const RaporEkrani({super.key, required this.dersAdi, required this.dersId, required this.token});

  @override
  State<RaporEkrani> createState() => _RaporEkraniState();
}

class _RaporEkraniState extends State<RaporEkrani> with SingleTickerProviderStateMixin {
  late TabController _tabCtrl;
  bool _yukleniyor = true;

  // Veri Listeleri
  List _canliDurum = [];
  List _detayliRapor = [];
  List _sesliNotlar = [];

  // İstatistikler
  int _dersteSayisi = 0;
  int _moladaSayisi = 0;
  int _yokSayisi = 0;

  // Ses Oynatıcı
  final AudioPlayer _audioPlayer = AudioPlayer();
  String? _calanDosya; 

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 3, vsync: this);
    _verileriGetir();

    _audioPlayer.onPlayerComplete.listen((event) {
      if (mounted) setState(() => _calanDosya = null);
    });
  }

  @override
  void dispose() {
    _audioPlayer.dispose();
    _tabCtrl.dispose(); // <--- KRİTİK: TabController kapatılmazsa hafıza sızıntısı yapar!
    super.dispose();
  }

  // --- VERİ ÇEKME ---
  Future<void> _verileriGetir() async {
    if (!mounted) return;
    setState(() => _yukleniyor = true);
    
    // ARTIK SABİT URL KULLANIYORUZ
    final headers = {"Authorization": "Bearer ${widget.token}"};

    try {
      // 1. Canlı Durum
      final res1 = await http.get(Uri.parse('${Sabitler.baseUrl}/rapor/canli/${widget.dersId}'), headers: headers);
      if (res1.statusCode == 200) {
        _canliDurum = jsonDecode(res1.body);
        _istatistikHesapla();
      }

      // 2. Detaylı Rapor
      final res2 = await http.get(Uri.parse('${Sabitler.baseUrl}/rapor/detayli/${widget.dersId}'), headers: headers);
      if (res2.statusCode == 200) {
        _detayliRapor = jsonDecode(res2.body);
      }

      // 3. Sesli Notlar
      final res3 = await http.get(Uri.parse('${Sabitler.baseUrl}/sesli-notlar/${widget.dersId}'), headers: headers);
      if (res3.statusCode == 200) {
        _sesliNotlar = jsonDecode(res3.body);
      }

    } catch (e) {
      debugPrint("Hata: $e");
    } finally {
      if (mounted) setState(() => _yukleniyor = false);
    }
  }

  void _istatistikHesapla() {
    int d = 0, m = 0, y = 0;
    for (var ogr in _canliDurum) {
      String durum = ogr['durum'] ?? 'YOK';
      if (durum == 'DERSTE') d++;
      else if (durum == 'MOLADA') m++;
      else y++;
    }
    setState(() { _dersteSayisi = d; _moladaSayisi = m; _yokSayisi = y; });
  }

  // --- YARDIMCI METOTLAR ---
  String _tarihFormatla(String? tarih) {
    if (tarih == null) return "-";
    try {
      final dt = DateTime.parse(tarih).toLocal();
      return DateFormat('HH:mm').format(dt);
    } catch (_) { return "-"; }
  }

  String _sureFormatla(dynamic saniyeRaw) {
    if (saniyeRaw == null) return "0 dk";
    double saniye = double.tryParse(saniyeRaw.toString()) ?? 0;
    int dk = (saniye / 60).floor();
    return "$dk dk";
  }

  Future<void> _sesOynat(String dosyaYolu) async {
    try {
      if (_calanDosya == dosyaYolu) {
        await _audioPlayer.stop();
        setState(() => _calanDosya = null);
      } else {
        // DÜZELTME: Ses dosyası yolu da Sabitler'den gelmeli
        String url = "${Sabitler.baseUrl}/$dosyaYolu";
        // Windows/macOS için backend statik dosya sunuyor olmalı
        await _audioPlayer.play(UrlSource(url));
        setState(() => _calanDosya = dosyaYolu);
      }
    } catch (e) {
      if(mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Oynatılamadı")));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text("${widget.dersAdi} Analizi"),
        backgroundColor: Colors.indigo,
        foregroundColor: Colors.white,
        bottom: TabBar(
          controller: _tabCtrl,
          indicatorColor: Colors.white,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          tabs: const [
            Tab(icon: Icon(Icons.pie_chart), text: "Canlı"),
            Tab(icon: Icon(Icons.table_chart), text: "Çizelge"),
            Tab(icon: Icon(Icons.mic), text: "Sesler"),
          ],
        ),
      ),
      body: _yukleniyor
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabCtrl,
              children: [
                _buildCanliTab(),
                _buildCizelgeTab(),
                _buildSeslerTab(),
              ],
            ),
    );
  }

  // 1. SEKME: GRAFİK
  Widget _buildCanliTab() {
    // Veri yoksa boş ekran göster (Hata almamak için)
    if (_canliDurum.isEmpty && _dersteSayisi == 0 && _moladaSayisi == 0 && _yokSayisi == 0) {
      return const Center(child: Text("Henüz veri yok."));
    }

    return Column(
      children: [
        const SizedBox(height: 20),
        SizedBox(
          height: 250,
          child: PieChart(
            PieChartData(
              sectionsSpace: 2,
              centerSpaceRadius: 40,
              sections: [
                PieChartSectionData(
                  value: _dersteSayisi.toDouble(),
                  title: "$_dersteSayisi",
                  color: Colors.green,
                  radius: 60,
                  titleStyle: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                ),
                PieChartSectionData(
                  value: _moladaSayisi.toDouble(),
                  title: "$_moladaSayisi",
                  color: Colors.orange,
                  radius: 60,
                  titleStyle: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                ),
                PieChartSectionData(
                  value: _yokSayisi.toDouble(),
                  title: "$_yokSayisi",
                  color: Colors.grey,
                  radius: 60,
                  titleStyle: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _chip(Colors.green, "Derste"),
            _chip(Colors.orange, "Molada"),
            _chip(Colors.grey, "Yok"),
          ],
        ),
        const Divider(),
        Expanded(
          child: ListView.builder(
            itemCount: _canliDurum.length,
            itemBuilder: (context, index) {
              final o = _canliDurum[index];
              final durum = o['durum'];
              return ListTile(
                leading: Icon(Icons.person, 
                  color: durum == 'DERSTE' ? Colors.green : (durum == 'MOLADA' ? Colors.orange : Colors.grey)),
                title: Text(o['ad_soyad'], style: const TextStyle(fontWeight: FontWeight.bold)),
                subtitle: Text(durum == 'MOLADA' ? "Mola Sebebi: ${o['mola_sebebi'] ?? 'Belirtilmedi'}" : durum),
              );
            },
          ),
        )
      ],
    );
  }

  Widget _chip(Color c, String text) => Container(
    margin: const EdgeInsets.symmetric(horizontal: 8),
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
    decoration: BoxDecoration(color: c.withOpacity(0.2), borderRadius: BorderRadius.circular(20), border: Border.all(color: c)),
    child: Row(children: [CircleAvatar(backgroundColor: c, radius: 4), const SizedBox(width: 6), Text(text, style: TextStyle(color: c, fontWeight: FontWeight.bold))]),
  );

  // 2. SEKME: DETAYLI TABLO
  Widget _buildCizelgeTab() {
    if (_detayliRapor.isEmpty) return const Center(child: Text("Veri yok."));
    
    return SingleChildScrollView(
      scrollDirection: Axis.vertical,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: DataTable(
          headingRowColor: MaterialStateProperty.all(Colors.grey[200]),
          columns: const [
            DataColumn(label: Text("Öğrenci")),
            DataColumn(label: Text("İlk Giriş")),
            DataColumn(label: Text("Durum / Çıkış")),
            DataColumn(label: Text("Ders Süresi")),
            DataColumn(label: Text("Mola Süresi")),
          ],
          rows: _detayliRapor.map((k) {
            bool aktif = k['aktif_mi'] == 1;
            // Backend null gönderebilir, güvenli kontrol:
            bool molaAktif = (k['mola_aktif_mi'] != null && int.tryParse(k['mola_aktif_mi'].toString())! > 0);

            return DataRow(cells: [
              DataCell(Text(k['ad_soyad'] ?? '', style: const TextStyle(fontWeight: FontWeight.bold))),
              DataCell(Text(_tarihFormatla(k['ilk_giris']))),
              
              DataCell(
                molaAktif 
                ? Container(padding: const EdgeInsets.all(4), decoration: BoxDecoration(color: Colors.orange[100], borderRadius: BorderRadius.circular(4)), child: const Text("MOLADA", style: TextStyle(color: Colors.orange, fontWeight: FontWeight.bold, fontSize: 12)))
                : (aktif 
                    ? Container(padding: const EdgeInsets.all(4), decoration: BoxDecoration(color: Colors.green[100], borderRadius: BorderRadius.circular(4)), child: const Text("DERSTE", style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold, fontSize: 12)))
                    : Text(_tarihFormatla(k['son_cikis']))
                  )
              ),

              DataCell(Text(_sureFormatla(k['toplam_ders_saniye']))),
              DataCell(Text(_sureFormatla(k['toplam_mola_saniye']))),
            ]);
          }).toList(),
        ),
      ),
    );
  }

  // 3. SEKME: SES DOSYALARI
  Widget _buildSeslerTab() {
    if (_sesliNotlar.isEmpty) return const Center(child: Text("Ses kaydı yok."));

    return ListView.builder(
      padding: const EdgeInsets.all(10),
      itemCount: _sesliNotlar.length,
      itemBuilder: (context, index) {
        final ses = _sesliNotlar[index];
        bool isPlaying = _calanDosya == ses['dosya_yolu'];

        return Card(
          elevation: 2,
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: isPlaying ? Colors.red : Colors.indigo,
              child: Icon(isPlaying ? Icons.stop : Icons.play_arrow, color: Colors.white),
            ),
            title: Text(ses['ad_soyad'] ?? 'Bilinmiyor'),
            subtitle: Text("Tarih: ${_tarihFormatla(ses['olusturulma_zamani'])}"),
            trailing: const Icon(Icons.mic, color: Colors.grey),
            onTap: () => _sesOynat(ses['dosya_yolu']),
          ),
        );
      },
    );
  }
}