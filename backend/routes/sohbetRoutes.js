const express = require('express');
const router = express.Router();
const pool = require('./db');  // veritabnına bağlanan poolu dosyaya çekiyoruz
const authMiddleware = require('../middleware/authMiddleware');

// 13. SOHBET MESAJI GÖNDERME
router.post('/ders/gonder', authMiddleware, async (req, res) => {
    try {
        const { ders_id, mesaj_metni } = req.body;
        if (!mesaj_metni || mesaj_metni.trim() === '') return res.status(400).json({ hata: 'Mesaj boş.' });

        const yeni = await pool.query(
            'INSERT INTO DersSohbeti (ders_id, gonderen_id, mesaj_metni, kayit_zamani) VALUES ($1, $2, $3, NOW()) RETURNING *',
            [ders_id, req.user.id, mesaj_metni]
        );
        res.status(201).json(yeni.rows[0]);
    } catch (err) { console.error(err); res.status(500).send('Hata'); }
});

// 14. DERS SOHBETİNİ GETİR
router.get('/ders/:ders_id', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT s.*, k.ad_soyad, k.rol
            FROM DersSohbeti s
            JOIN Kullanicilar k ON s.gonderen_id = k.kullanici_id
            WHERE s.ders_id = $1
            ORDER BY s.kayit_zamani ASC
        `, [req.params.ders_id]);
        res.json(result.rows);
    } catch (err) { console.error(err); res.status(500).send('Hata'); }
});

// 32. Rehber (Kişiler) Listesi - Sohbet sekmesi için
router.get('/rehber', authMiddleware, async (req, res) => {
    try {
        // req.user.id'yi hariç tutuyoruz ki kullanıcı rehberde kendini görmesin
        const kullanicilar = await pool.query(
            'SELECT kullanici_id, ad_soyad, rol FROM Kullanicilar WHERE kullanici_id != $1 ORDER BY ad_soyad ASC',
            [req.user.id]
        );
        res.json(kullanicilar.rows);
    } catch (err) {
        console.error("Rehber Hatası:", err.message);
        res.status(500).json({ hata: "Sunucu hatası oluştu." });
    }
});

// 34. ÖZEL MESAJLAŞMA SİSTEMİ API'LERİ
// A) Özel Mesaj Gönder
router.post('/ozel/gonder', authMiddleware, async (req, res) => {
    const { alici_id, mesaj_metni } = req.body;
    try {
        const yeniMesaj = await pool.query(
            'INSERT INTO OzelMesajlar (gonderen_id, alici_id, mesaj_metni, gonderim_zamani) VALUES ($1, $2, $3, NOW()) RETURNING *',
            [req.user.id, alici_id, mesaj_metni]
        );
        res.status(201).json(yeniMesaj.rows[0]);
    } catch (err) {
        console.error("Mesaj Gönderme Hatası:", err);
        res.status(500).json({ hata: "Mesaj gönderilemedi." });
    }
});

// B) İki Kişi Arasındaki Mesaj Geçmişini Getir (Baloncuklar için)
router.get('/ozel/gecmis/:karsi_id', authMiddleware, async (req, res) => {
    const { karsi_id } = req.params;
    try {
        const mesajlar = await pool.query(`
            SELECT * FROM OzelMesajlar 
            WHERE (gonderen_id = $1 AND alici_id = $2) 
               OR (gonderen_id = $2 AND alici_id = $1)
            ORDER BY gonderim_zamani ASC
        `, [req.user.id, karsi_id]);

        // Karşı tarafın mesajlarını "okundu" olarak işaretle (İsteğe bağlı güzel bir detay)
        await pool.query(
            'UPDATE OzelMesajlar SET okundu_mu = TRUE WHERE gonderen_id = $1 AND alici_id = $2 AND okundu_mu = FALSE',
            [karsi_id, req.user.id]
        );

        res.json(mesajlar.rows);
    } catch (err) {
        console.error("Geçmiş Çekme Hatası:", err);
        res.status(500).json({ hata: "Mesajlar getirilemedi." });
    }
});

// C) Aktif Sohbet Listesini Getir (Gelen Kutusu / En Son Mesajlaşılanlar)
router.get('/ozel/aktif-liste', authMiddleware, async (req, res) => {
    try {
        // En son kiminle konuşulmuşsa onu ve son mesajını getiren gelişmiş SQL
        const sql = `
            SELECT DISTINCT ON (diger_id)
                diger_id as kullanici_id,
                k.ad_soyad,
                k.rol,
                m.mesaj_metni as son_mesaj,
                m.gonderim_zamani,
                m.okundu_mu,
                (m.gonderen_id = $1) as ben_mi_gonderdim
            FROM (
                SELECT 
                    CASE WHEN gonderen_id = $1 THEN alici_id ELSE gonderen_id END as diger_id,
                    mesaj_metni, gonderim_zamani, okundu_mu, gonderen_id
                FROM OzelMesajlar
                WHERE gonderen_id = $1 OR alici_id = $1
                ORDER BY gonderim_zamani DESC
            ) m
            JOIN Kullanicilar k ON k.kullanici_id = m.diger_id
            ORDER BY diger_id, gonderim_zamani DESC
        `;

        const liste = await pool.query(sql, [req.user.id]);

        // Tarihe göre yeniden sıralayalım (En yeni mesaj en üstte)
        const siraliListe = liste.rows.sort((a, b) => new Date(b.gonderim_zamani) - new Date(a.gonderim_zamani));

        res.json(siraliListe);
    } catch (err) {
        console.error("Aktif Liste Hatası:", err);
        res.status(500).json({ hata: "Liste getirilemedi." });
    }
});

module.exports = router;