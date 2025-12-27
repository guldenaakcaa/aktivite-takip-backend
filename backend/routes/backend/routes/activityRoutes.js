const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/auth'); // JWT Middleware'i

// 1. DERS OLUŞTURMA - Öğretmen
router.post('/dersler/olustur', authMiddleware, async (req, res) => {
    if (req.user.rol !== 'ogretmen') return res.status(403).json({ hata: 'Yetkisiz işlem.' });
    try {
        const { ders_adi, aciklama } = req.body;
        await pool.query('INSERT INTO Dersler (ders_adi, aciklama, ogretmen_id) VALUES ($1, $2, $3)', [ders_adi, aciklama, req.user.id]);
        res.status(201).json({ mesaj: 'Ders oluşturuldu.' });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

// 2. DERSLERİ GETİR (Öğrenci)
router.get('/dersler/benim', authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT d.*, k.ad_soyad as ogretmen_adi FROM OgrenciDers od 
             JOIN Dersler d ON od.ders_id = d.ders_id 
             JOIN Kullanicilar k ON d.ogretmen_id = k.kullanici_id 
             WHERE od.ogrenci_id = $1`, [req.user.id]);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

// 3. MOLA BAŞLAT
router.post('/mola/baslat', authMiddleware, async (req, res) => {
    try {
        const { ders_id, sebep } = req.body;
        const kayit = await pool.query('SELECT * FROM OgrenciDers WHERE ogrenci_id = $1 AND ders_id = $2', [req.user.id, ders_id]);
        if (kayit.rows.length === 0) return res.status(403).json({ hata: 'Bu derse kayıtlı değilsiniz.' });

        const mola = await pool.query(
            'INSERT INTO Molalar (ogrenci_id, ders_id, sebep, baslangic_zamani) VALUES ($1, $2, $3, NOW()) RETURNING *',
            [req.user.id, ders_id, sebep]
        );
        res.json({ mesaj: 'Mola başladı.', mola: mola.rows[0] });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

// 4. MOLA BİTİR
router.put('/mola/bitir', authMiddleware, async (req, res) => {
    try {
        const { mola_id } = req.body;
        const mola = await pool.query(
            `UPDATE Molalar SET bitis_zamani = NOW(), toplam_sure = NOW() - baslangic_zamani 
             WHERE mola_id = $1 AND ogrenci_id = $2 RETURNING *`, [mola_id, req.user.id]);
        res.json({ mesaj: 'Mola bitti.', mola: mola.rows[0] });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

module.exports = router;