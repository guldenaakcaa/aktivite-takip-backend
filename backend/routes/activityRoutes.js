const express = require('express');
const router = express.Router();  // bu işlemleri index.js yığmak yerine düzenli bir şekilde ayırdık
const pool = require('../db');  // veritabnına bağlanan poolu dosyaya çekiyoruz
const authMiddleware = require('../middleware/authMiddleware'); // JWT Middleware'i


// router.post = Sisteme yepyeni, sıfırdan bir kayıt eklemek istediğimizde kullanırız.
// router.put = Veritabanında zaten var olan bir kaydı değiştirmek veya güncellemek istediğimizde kullanırız.
// router.get = sadece veri okumak/getirmek -Read- içindir

// 3. MOLA BAŞLAT
router.post('/mola/baslat', authMiddleware, async (req, res) => {
    try {
        const { ders_id, sebep } = req.body;
        const kayit = await pool.query('SELECT * FROM OgrenciDers WHERE ogrenci_id = $1 AND ders_id = $2', [req.user.id, ders_id]);
        if (kayit.rows.length === 0) return res.status(403).json({ hata: 'Bu derse kayıtlı değilsiniz.' });

        const aktif = await pool.query('SELECT * FROM Molalar WHERE ogrenci_id = $1 AND ders_id = $2 AND bitis_zamani IS NULL',
            [req.user.id, ders_id]);
        if (aktif.rows.length > 0) return res.json({ mesaj: 'Zaten moladasınız.', mola: aktif.rows[0] });

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
        const mola = await pool.query( //Veritabanından bize bir cevap(const result). pool db köprüsü query sorgu
            `UPDATE Molalar 
             SET bitis_zamani = NOW(), toplam_sure = EXTRACT(EPOCH FROM (NOW() - baslangic_zamani ))::INTEGER
             WHERE mola_id = $1 AND ogrenci_id = $2 RETURNING *`, [mola_id, req.user.id]);

        if (mola.rows.length === 0) {
            return res.status(404).json({ hata: "Kapatılacak açık bir mola bulunamadı." });
        }
        res.json({ mesaj: 'Mola bitti.', mola: mola.rows[0] });
    } catch (err) {
        console.error("Mola Bitirme Hatası:", err);
        res.status(500).send('Sunucu Hatası');
    }
});

// now() = sunucu saatine bakar ve oraya salisesine kadar o anın tarihini ve saatini yazar
// WHERE mola_id = $1 AND ogrenci_id = $2 burda başka birisi başka bir öğrencinin molasını bitirmesin diye koyduk 

// 9. AKTİVİTE GİRİŞ 
router.post('/giris', authMiddleware, async (req, res) => {
    try {
        const { ders_id } = req.body;
        await pool.query('UPDATE Aktiviteler SET cikis_zamani = NOW(), toplam_sure = EXTRACT(EPOCH FROM (NOW() - giris_zamani))::INTEGER WHERE ogrenci_id = $1 AND cikis_zamani IS NULL', [req.user.id]);
        /// Bu öğrenci yeni bir derse girmek istiyor. Eğer sistemde çıkış yapmayı unuttuğu eski ve açık bir dersi varsa,
        //  o eski dersi o anki saatle (NOW()) hemen otomatik olarak kapat.
        await pool.query('INSERT INTO Aktiviteler (ogrenci_id, ders_id, giris_zamani) VALUES ($1, $2, NOW())', [req.user.id, ders_id]);
        // Eski hesaplar temizlendikten ve öğrencinin üstünde hiçbir açık ders kalmadıktan sonra,
        //  güvenli bir şekilde yeni dersin girişi veritabanına işlenir.
        res.json({ mesaj: 'Derse girildi.' });
    } catch (error) {
        // 1. Hatayı siyah terminale kırmızı kırmızı yazdıracak!
        console.error("🚨 DERS BAŞLATMA HATASI:", error);

        // 2. Flutter'ın jsonDecode ile patlamaması için düz metin değil, JSON dönecek.
        res.status(500).json({
            mesaj: "Sunucu hatası oluştu",
            detay: error.message
        });
    }
});

// 10. AKTİVİTE ÇIKIŞ
router.post('/cikis', authMiddleware, async (req, res) => {
    try {
        await pool.query('UPDATE Aktiviteler SET cikis_zamani = NOW(), toplam_sure = EXTRACT(EPOCH FROM (NOW() - giris_zamani))::INTEGER WHERE ogrenci_id = $1 AND cikis_zamani IS NULL', [req.user.id]);

        await pool.query('UPDATE Molalar SET bitis_zamani = NOW(), toplam_sure = EXTRACT(EPOCH FROM (NOW() - baslangic_zamani))::INTEGER WHERE ogrenci_id = $1 AND bitis_zamani IS NULL', [req.user.id]);
        // Öğrenci sistemi/dersi terk ediyorsa, açık kalmış molası varsa onu da hemen kapat" 
        // diyerek olası bir mantık hatasını (bug) kökünden çözüyor.
        res.json({ mesaj: 'Çıkış yapıldı.' });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// 15. ÖĞRENCİ AKTİVİTE DURUMU KONTROL 
router.get('/durum/:ders_id', authMiddleware, async (req, res) => {
    try {
        const { ders_id } = req.params;  // ders.id yi yukarı yazar
        const ogrenci_id = req.user.id;  // öğrenci ıd yı alır 

        // Eğer önce Aktiviteler tablosuna baksaydık, sistem derste olduğunu görüp hemen DERSTE cevabını dönerdi ve 
        // alt satırlardaki mola kontrolüne hiç ulaşamazdı.Önce molayı kontrol ederek, "Evet bu çocuk derste
        // ama şu an o dersin içindeki bir molada" diyerek önceliği (hiyerarşiyi) doğru kurmuş oluyorsun.

        const mola = await pool.query(
            "SELECT * FROM Molalar WHERE ogrenci_id = $1 AND ders_id = $2 AND bitis_zamani IS NULL",
            [ogrenci_id, ders_id]
        );

        if (mola.rows.length > 0) {
            return res.json({
                durum: 'MOLADA',
                baslangic: mola.rows[0].baslangic_zamani  // Flutter tarafındaki kronometrenin sıfırlanmadan kaldığı yerden 
                // devam edebilmesi için, veritabanındaki kesin başlama saatini telefona gönderiyoruz.
            });
        }

        const aktivite = await pool.query(
            "SELECT * FROM Aktiviteler WHERE ogrenci_id = $1 AND ders_id = $2 AND cikis_zamani IS NULL",
            [ogrenci_id, ders_id]
        );

        if (aktivite.rows.length > 0) {
            return res.json({
                durum: 'DERSTE',
                baslangic: aktivite.rows[0].giris_zamani  // Flutter tarafındaki ders süresi kronometresinin doğru 
                // akabilmesi için, öğrencinin derse girdiği kesin saati telefona gönderiyoruz.
            });
        }

        res.json({ durum: 'BOSTA', baslangic: null });
    } catch (err) {
        console.error(err);
        res.status(500).send('Sunucu Hatası');
    }
});



module.exports = router;   