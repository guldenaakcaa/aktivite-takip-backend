const express = require('express');
const router = express.Router();  // bu işlemleri index.js yığmak yerine düzenli bir şekilde ayırdık
const pool = require('../db');
const authMiddleware = require('../middleware/auth'); // JWT Middleware'i


// router.post = Sisteme yepyeni, sıfırdan bir kayıt eklemek istediğimizde kullanırız.
// router.put = Veritabanında zaten var olan bir kaydı değiştirmek veya güncellemek istediğimizde kullanırız.
// router.get = sadece veri okumak/getirmek -Read- içindir
 
// 1. DERS OLUŞTURMA - Öğretmen
router.post('/dersler/olustur', authMiddleware, async (req, res) => {  // authMiddleware kişinin tokene güvenli ise bu işlemi yapar
    if (req.user.rol !== 'ogretmen') return res.status(403).json({ hata: 'Yetkisiz işlem.' });
    try {
        const { ders_adi, aciklama } = req.body;
        await pool.query('INSERT INTO Dersler (ders_adi, aciklama, ogretmen_id) VALUES ($1, $2, $3)', [ders_adi, aciklama, req.user.id]);
  //PostgreSQL veritabanına "Dersler tablosuna yeni bir satır ekle" emrini veriyoruz
 //güvenlik için dışarıdan gelen verileri doğrudan SQL'in içine yazmayıp $1, $2, $3 parametrelerini kullanıyoruz.
 // [] parantez içindeki yer flutetrdan aldığımız yer güvenlik gereği ıd yı ordan almadık requser dan aldık başta kontrol etmişti
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
             WHERE od.ogrenci_id = $1`, [req.user.id]);  // sistem veritabnından donen satırları result değişkenine koyar
        res.json(result.rows);  
// koduyla da bu kutunun içindeki satırları alır, temiz bir JSON formatına çevirir ve Flutter tarafına gönderir.
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

// 3. MOLA BAŞLAT
router.post('/mola/baslat', authMiddleware, async (req, res) => {
    try {
        const { ders_id, sebep } = req.body;
        const kayit = await pool.query('SELECT * FROM OgrenciDers WHERE ogrenci_id = $1 AND ders_id = $2', [req.user.id, ders_id]);
        if (kayit.rows.length === 0) return res.status(403).json({ hata: 'Bu derse kayıtlı değilsiniz.' });
// içeri aldığımız öğrencinin ıd si mola almaya çalıştığı derste kayıtlı mı değil mi diye baktık
        const mola = await pool.query(
            'INSERT INTO Molalar (ogrenci_id, ders_id, sebep, baslangic_zamani) VALUES ($1, $2, $3, NOW()) RETURNING *', 
            [req.user.id, ders_id, sebep]
        );
// RETURNING * = Bu yeni molayı kaydet ve kaydettiğin bu yepyeni satırı tüm bilgileriyle birlikte bana hemen geri ver.
// Bu sayede, az önce oluşturulan molanın numarasını öğrenmek için veritabanına ikinci bir SELECT sorgusu atmıyorz
        res.json({ mesaj: 'Mola başladı.', mola: mola.rows[0] });
// mola.rows = returning sayesinde dönen o yeni mola risini buna gönderiyoruz ki ekranda mola süresi akmaya başlasın
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

// now() = sunucu saatine bakar ve oraya salisesine kadar o anın tarihini ve saatini yazar
// WHERE mola_id = $1 AND ogrenci_id = $2 burda başka birisi başka bir öğrencinin molasını bitirmesin diye koyduk 

module.exports = router;