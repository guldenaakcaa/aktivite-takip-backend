const express = require('express');
const router = express.Router();
const pool = require('../db');  // veritabnına bağlanan poolu dosyaya çekiyoruz
const bcrypt = require('bcrypt');  // şifre gizleme
const authMiddleware = require('../middleware/authMiddleware');

// 18. PROFİL: ŞİFRE DEĞİŞTİR (Giriş Yapmış Kullanıcı İçin)
router.post('/profil/sifre-degistir', authMiddleware, async (req, res) => {
    try {
        const { eski_sifre, yeni_sifre } = req.body;
        const userId = req.user.id;  // doğrudan authMiddleware tarafından onaylanan şifreli token'dan (req.user) okunur.

        const user = await pool.query('SELECT * FROM Kullanicilar WHERE kullanici_id = $1', [userId]);
        if (user.rows.length === 0) return res.status(404).json({ hata: 'Kullanıcı bulunamadı.' });

        const validPassword = await bcrypt.compare(eski_sifre, user.rows[0].sifre);
        // şifre değişirken eski şifreyi de soruyoruz
        if (!validPassword) return res.status(400).json({ hata: 'Eski şifreniz hatalı.' });

        const hashedPassword = await bcrypt.hash(yeni_sifre, 10);
        await pool.query('UPDATE Kullanicilar SET sifre = $1 WHERE kullanici_id = $2', [hashedPassword, userId]);

        res.json({ mesaj: 'Şifreniz başarıyla güncellendi. 🎉' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Sunucu Hatası');
    }
});


// 19. PROFİL BİLGİLERİNİ GETİR 
router.get('/profil/bilgi', authMiddleware, async (req, res) => {
    try {
        const user = await pool.query('SELECT ad_soyad, email, rol FROM Kullanicilar WHERE kullanici_id = $1', [req.user.id]);
        // veritabanından herşeyi değil sadece lazım olanları getiriyoruz
        if (user.rows.length === 0) return res.status(404).json({ hata: 'Kullanıcı bulunamadı.' });
        res.json(user.rows[0]);
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// 20. PROFİL BİLGİLERİNİ GÜNCELLE 
router.put('/profil/guncelle', authMiddleware, async (req, res) => {
    try {
        const { ad_soyad, email } = req.body;
        // Email başkasında var mı kontrol et (kendi emaili hariç)
        const check = await pool.query('SELECT * FROM Kullanicilar WHERE email = $1 AND kullanici_id != $2', [email, req.user.id]);
        // Bu e-posta adresini bir ara, ama ararken benim kendi hesabımı (req.user.id) görmezden gel. 
        // Benden BAŞKA biri bu maili kullanıyor mu ona bak.
        if (check.rows.length > 0) return res.status(400).json({ hata: 'Bu e-posta adresi kullanımda.' });

        await pool.query('UPDATE Kullanicilar SET ad_soyad = $1, email = $2 WHERE kullanici_id = $3', [ad_soyad, email, req.user.id]);
        res.json({ mesaj: 'Profil bilgileri güncellendi.' });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

module.exports = router;