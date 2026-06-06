const express = require('express');
const router = express.Router();
const pool = require('../db');  // veritabnına bağlanan poolu dosyaya çekiyoruz
const authMiddleware = require('../middleware/authMiddleware');


//  25. SEANS DEĞERLENDİRMESİ (Zorluk ve Stres) ---
router.post('/degerlendirme/kaydet', authMiddleware, async (req, res) => {
    const { ders_id, zorluk, stres } = req.body;
    const ogrenci_id = req.user.id;

    try {
        // 1. Öğrencinin o dersteki EN SON aktivitesini (ders seansını) bul
        const sonAktivite = await pool.query(
            `SELECT aktivite_id FROM Aktiviteler 
             WHERE ogrenci_id = $1 AND ders_id = $2 
             ORDER BY cikis_zamani DESC NULLS LAST LIMIT 1`,
            [ogrenci_id, ders_id]
        );

        if (sonAktivite.rows.length === 0) {
            return res.status(404).json({ hata: "Değerlendirilecek bir aktivite bulunamadı." });
        }

        const aktivite_id = sonAktivite.rows[0].aktivite_id;

        // 2. Bulduğumuz aktivite_id ile zorluk ve stres verilerini yeni tabloya yaz
        await pool.query(
            `INSERT INTO degerlendirmeler (aktivite_id, zorluk, stres) 
             VALUES ($1, $2, $3)`,
            [aktivite_id, zorluk, stres]
        );

        res.status(200).json({ mesaj: "Değerlendirme başarıyla kaydedildi!" });
    } catch (err) {
        console.error("Değerlendirme kaydetme hatası:", err.message);
        res.status(500).json({ hata: "Sunucu hatası" });
    }
});



// 29. Ders Hedeflerini ve Stratejilerini Kaydetme API
router.post('/hedef-ekle', authMiddleware, async (req, res) => {
    const { ders_id, hedef_not, strateji_metni } = req.body;
    const ogrenci_id = req.user.id;
    try {
        // Eğer o ders için daha önce strateji girilmişse UPDATE yapar, girilmemişse INSERT yapar (UPSERT mantığı)
        const yeniHedef = await pool.query(`
            INSERT INTO OgrenciHedefleri (ogrenci_id,ders_id, hedef_not, strateji_metni)
            VALUES ($1, $2, $3)
            ON CONFLICT (ders_id) 
            DO UPDATE SET hedef_not = $2, strateji_metni = $3 RETURNING *`,
            [ogrenci_id, ders_id, hedef_not, strateji_metni]
        );
        res.status(201).json(yeniHedef.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Sunucu hatası");
    }
});

// 30. Ders Stratejisini Kaydetme veya Güncelleme API'si
router.post('/strateji-kaydet', authMiddleware, async (req, res) => {
    const { ders_id, hedef_not, strateji_metni } = req.body;
    try {
        // Eğer o ders için daha önce strateji girilmişse UPDATE yapar, girilmemişse INSERT yapar (UPSERT mantığı)
        const sonuc = await pool.query(`
            INSERT INTO OgrenciHedefleri (ders_id, hedef_not, strateji_metni)
            VALUES ($1, $2, $3)
            ON CONFLICT (ders_id) 
            DO UPDATE SET hedef_not = $2, strateji_metni = $3 
            RETURNING *`,
            [ders_id, hedef_not, strateji_metni]
        );
        res.status(201).json({ mesaj: "Strateji başarıyla kaydedildi", veri: sonuc.rows[0] });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ hata: "Sunucu hatası oluştu." });
    }
});

// 31. Seçilen Dersin Kayıtlı Stratejisini Getirme API'si
router.get('/strateji-getir/:dersId', authMiddleware, async (req, res) => {
    const { dersId } = req.params;
    const ogrenci_id = req.user.id;
    try {
        const strateji = await pool.query(
            'SELECT * FROM OgrenciHedefleri WHERE ders_id = $1 AND ogrenci_id = $2',
            [dersId, ogrenci_id]
        );

        if (strateji.rows.length > 0) {
            res.json(strateji.rows[0]);
        } else {
            // Eğer henüz bir şey kaydedilmediyse boş şablon dönüyoruz
            res.json({ hedef_not: "AA", strateji_metni: "" });
        }
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ hata: "Sunucu hatası oluştu." });
    }
});

// 35. AKILLI KOÇ (YAPAY ZEKA) BAĞLANTISI [4]
router.post('/akilli-koc', authMiddleware, async (req, res) => {
    try {
        const { calisma_saati, zorluk, stres, hedef_not, ders_bilgileri } = req.body;

        // Python sunucusuna (api.py) veri gönderiyoruz
        res.status(200).json({
            badi_yanit: "Değerlendirmelerini aldım! Olasılık hesaplamalarımızı şimdilik rafa kaldırdık ama girdiğin verilere bakılırsa hedeflerine adım adım yaklaşıyorsun. Çalışmaya tam gaz devam!",
            tahmini_not: hedef_not || "Hedefin yolda",
            durum: "basarili"
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ hata: "Yapay zeka asistanına ulaşılamadı." });
    }
});

module.exports = router;