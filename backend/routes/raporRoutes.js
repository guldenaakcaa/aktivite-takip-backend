const express = require('express');
const router = express.Router();
const pool = require('../db');  // veritabnına bağlanan poolu dosyaya çekiyoruz
const authMiddleware = require('../middleware/authMiddleware');

// 11. CANLI DURUM RAPORU 
router.get('/canli/:ders_id', authMiddleware, async (req, res) => {  /// kısmındaki iki nokta (:) node.jse şunu der buraya bir numara gelecek
    try {
        const { ders_id } = req.params;
        //Yani Flutter'dan istek atarken postacı doğrudan http://localhost:3000/rapor/canli/12 adresine gider.
        //  Node.js o adresteki 12'yi alır ve req.params sayesinde ders_id değişkenine atar.
        const sql = `
            SELECT 
                k.ad_soyad,
                CASE 
                    WHEN m.mola_id IS NOT NULL THEN 'MOLADA' 
                    WHEN a.aktivite_id IS NOT NULL THEN 'DERSTE'
                    ELSE 'YOK'
                END as durum,
                m.sebep as mola_sebebi
            FROM OgrenciDers od
            JOIN Kullanicilar k ON od.ogrenci_id = k.kullanici_id
            LEFT JOIN Aktiviteler a ON a.ogrenci_id = k.kullanici_id AND a.ders_id = $1 AND a.cikis_zamani IS NULL
            LEFT JOIN Molalar m ON m.ogrenci_id = k.kullanici_id AND m.ders_id = $1 AND m.bitis_zamani IS NULL
            WHERE od.ders_id = $1
        `;
        // LEFT JOIN ile öğretmen ekranında sadece dersteki 5 kişiyi değil, derse kayıtlı olan 40 
        // kişinin 40'ını da görebilir ve gelmeyenleri anında tespit edebilir.

        const sonuc = await pool.query(sql, [ders_id]);
        res.json(sonuc.rows);
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// 12. DETAYLI RAPOR 
router.get('/detayli/:ders_id', authMiddleware, async (req, res) => {
    try {
        const { ders_id } = req.params;
        const sql = `
            SELECT 
                k.ad_soyad,
                MIN(a.giris_zamani) as ilk_giris,
                MAX(a.cikis_zamani) as son_cikis,
                SUM(EXTRACT(EPOCH FROM (COALESCE(a.cikis_zamani, NOW()) - a.giris_zamani))) as toplam_ders_saniye,
                COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(m2.bitis_zamani, NOW()) - m2.baslangic_zamani))) 
                          FROM Molalar m2 WHERE m2.ogrenci_id = k.kullanici_id AND m2.ders_id = $1), 0) as toplam_mola_saniye,
                MAX(CASE 
                    WHEN a.giris_zamani IS NOT NULL AND a.cikis_zamani IS NULL THEN 1 
                    ELSE 0 
                END) as aktif_mi
            FROM OgrenciDers od
            JOIN Kullanicilar k ON od.ogrenci_id = k.kullanici_id
            LEFT JOIN Aktiviteler a ON a.ogrenci_id = k.kullanici_id AND a.ders_id = $1
            WHERE od.ders_id = $1
            GROUP BY k.kullanici_id, k.ad_soyad
            ORDER BY k.ad_soyad ASC
        `;
        // COALESCE(..., NOW()) Sistem çıkış zamanından giriş zamanını çıkararak süreyi bulur. 
        // Peki ya çocuk o an hala dersteyse ve çıkış yapmamışsa (cikis_zamani NULL ise)? 
        // COALESCE devreye girer: "Eğer çıkış zamanı yoksa, süreyi o anki sunucu saatiyle (NOW()) hesapla.

        // MAX(CASE WHEN ... as aktif_mi: Öğrencinin birden fazla gir-çık kaydı olabilir.
        // Bu kayıtların herhangi birinde "Giriş yapılmış ama henüz Çıkış yapılmamış" bir durum var mı? 
        // Varsa bu çocuğun durumu şu an aktiftir (1 döner), hepsi kapanmışsa aktif değildir (0 döner).
        const result = await pool.query(sql, [ders_id]);
        res.json(result.rows);
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// 28. Dinamik Çalışma Raporu API (Günlük/Haftalık/Aylık)
router.get('/haftalik-rapor', authMiddleware, async (req, res) => {
    // URL'den ders_id ve aralik (gunluk, haftalik, aylik) parametrelerini alıyoruz
    const { ders_id, aralik } = req.query;
    const ogrenci_id = req.user.id;

    try {
        // Varsayılan olarak Haftalık (Son 7 gün) ayarları
        let zamanKisitlamasi = "NOW() - INTERVAL '7 days'";
        let secim = "TO_CHAR(giris_zamani, 'DD/MM') as tarih"; // Örn: 21/05 gibi gün formatı

        if (aralik === 'gunluk') {
            zamanKisitlamasi = "CURRENT_DATE"; // Sadece bugünün verileri
            secim = "TO_CHAR(giris_zamani, 'HH24:00') as tarih"; // Örn: 14:00 gibi saat formatı
        } else if (aralik === 'aylik') {
            zamanKisitlamasi = "NOW() - INTERVAL '30 days'";
            secim = "TO_CHAR(giris_zamani, 'DD/MM') as tarih";
        }

        let query = `
          SELECT 
            ${secim}, 
            SUM(EXTRACT(EPOCH FROM (COALESCE(cikis_zamani, NOW()) - giris_zamani))) as toplam_saniye 
          FROM Aktiviteler 
          WHERE ogrenci_id = $1 AND giris_zamani >= ${zamanKisitlamasi}
        `;
        let params = [ogrenci_id];

        if (ders_id && ders_id !== '0') {
            query += ` AND ders_id = $2`;
            params.push(ders_id);
        }

        // Gruplamayı 'tarih' etiketine göre yapıyoruz
        query += ` GROUP BY tarih ORDER BY tarih ASC`;

        const result = await pool.query(query, params);

        // Dakikaya yuvarla
        const rapor = result.rows.map(row => ({
            tarih: row.tarih,
            sure: Math.round(row.toplam_saniye / 60)
        }));

        res.json(rapor);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ hata: "Sunucu hatası oluştu." });
    }
});

module.exports = router;
