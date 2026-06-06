const express = require('express');
const router = express.Router();
const pool = require('../db');  // veritabnına bağlanan poolu dosyaya çekiyoruz
const authMiddleware = require('../middleware/authMiddleware');
const crypto = require('crypto');  // idler aynı kaldığı sürece hep aynı karmaşık metni üretecek. 
// Canlı ders güvenliği için eklendi
require('dotenv').config();


//  3. DERS OLUŞTURMA 
router.post('/olustur', authMiddleware, async (req, res) => { // authMiddleware kişinin tokene güvenli ise bu işlemi yapar
    if (req.user.rol !== 'ogretmen') return res.status(403).json({ hata: 'Yetkisiz.' });
    try {
        const { ders_adi, aciklama } = req.body;

        //  Ders adı boş mu?
        if (!ders_adi || ders_adi.trim() === "") {
            return res.status(400).json({ hata: "Ders adı boş bırakılamaz!" });
        }

        const newDers = await pool.query(
            'INSERT INTO Dersler (ders_adi, aciklama, ogretmen_id) VALUES ($1, $2, $3) RETURNING *',
            [ders_adi, aciklama, req.user.id]
        );
        //PostgreSQL veritabanına "Dersler tablosuna yeni bir satır ekle" emrini veriyoruz
        //güvenlik için dışarıdan gelen verileri doğrudan SQL'in içine yazmayıp $1, $2, $3 parametrelerini kullanıyoruz.
        // [] parantez içindeki yer flutetrdan aldığımız yer güvenlik gereği ıd yı ordan almadık requser dan aldık başta kontrol etmişti

        res.status(201).json({ mesaj: 'Ders oluşturuldu.', ders: newDers.rows[0] });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// 4. TÜM DERSLERİ LİSTELE 
router.get('/tum', authMiddleware, async (req, res) => {
    try {
        const rows = await pool.query(`SELECT d.ders_id, d.ders_adi, d.aciklama, k.ad_soyad as ogretmen_adi 
            FROM Dersler d JOIN Kullanicilar k ON d.ogretmen_id = k.kullanici_id`);
        res.json(rows.rows);
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// 5. DERSE KAYIT OL 
router.post('/kayit', authMiddleware, async (req, res) => {
    if (req.user.rol !== 'ogrenci') return res.status(403).json({ hata: 'Sadece öğrenciler.' });
    try {
        const { ders_id } = req.body;
        // süslü parantez olunca  flutterdan gelen paketin (req.body) içinden sadecde ders_id olanları getir diyorum
        // olmazsa hepsini getirio
        const check = await pool.query('SELECT * FROM OgrenciDers WHERE ogrenci_id = $1 AND ders_id = $2', [req.user.id, ders_id]);
        if (check.rows.length > 0) return res.status(400).json({ hata: 'Zaten kayıtlısınız.' });

        await pool.query('INSERT INTO OgrenciDers (ogrenci_id, ders_id) VALUES ($1, $2)', [req.user.id, ders_id]);
        res.status(201).json({ mesaj: 'Kayıt olundu.' });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// 6. BENİM DERSLERİM 
router.get('/benim', authMiddleware, async (req, res) => {
    try {
        let query;   // kapıdan giren kişinin kim olduğuna göre birazdan değişecek. CONST ta sabitti
        if (req.user.rol === 'ogrenci') {
            query = `SELECT d.ders_id, d.ders_adi, d.aciklama, k.ad_soyad AS ogretmen_adi 
             FROM OgrenciDers od JOIN Dersler d ON od.ders_id = d.ders_id
             JOIN Kullanicilar k ON d.ogretmen_id = k.kullanici_id WHERE od.ogrenci_id = $1`;
        } else {
            query = `SELECT * FROM Dersler WHERE ogretmen_id = $1`;
        }
        const dersler = await pool.query(query, [req.user.id]);
        // esnek query cümlesini alır, güvenlik için $1 yazan yere kişinin ID'sini koyar ve veritabanına tek bir istek yapar.
        res.json(dersler.rows);  // Gelen sonucu Flutter'a gönderir.
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// yayin
router.get('/detay/:ders_id', authMiddleware, async (req, res) => {
    try {
        const { ders_id } = req.params;
        const result = await pool.query(
            'SELECT canli_yayin_aktif, jitsi_oda_linki FROM Dersler WHERE ders_id = $1',
            [ders_id]
        );

        if (result.rows.length === 0) return res.status(404).json({ hata: "Ders bulunamadı" });

        res.json(result.rows[0]);
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// 21. DERS SİLME (Öğretmen İçin)
router.delete('/sil/:ders_id', authMiddleware, async (req, res) => {
    if (req.user.rol !== 'ogretmen') return res.status(403).json({ hata: 'Yetkisiz.' });  // dersi sadece ogretmen siler
    try {
        const { ders_id } = req.params;

        // 1. Bu ders gerçekten bu hocaya mı ait?
        const check = await pool.query('SELECT * FROM Dersler WHERE ders_id = $1 AND ogretmen_id = $2', [ders_id, req.user.id]);
        // sadece o dersin ogretmeni silebilir

        if (check.rows.length === 0) return res.status(404).json({ hata: 'Ders bulunamadı veya silme yetkiniz yok.' });

        // 2. Dersi silmeden önce BAĞLI VERİLERİ temizle (Foreign Key Hatası almamak için)
        await pool.query('DELETE FROM OgrenciDers WHERE ders_id = $1', [ders_id]); // Öğrenci kayıtları
        await pool.query('DELETE FROM Molalar WHERE ders_id = $1', [ders_id]);     // Molalar
        await pool.query('DELETE FROM Aktiviteler WHERE ders_id = $1', [ders_id]); // Aktiviteler
        await pool.query('DELETE FROM SesliNotlar WHERE ders_id = $1', [ders_id]); // Ses kayıtları

        // 3. Artık dersi silebiliriz
        await pool.query('DELETE FROM Dersler WHERE ders_id = $1', [ders_id]);

        res.json({ mesaj: 'Ders başarıyla silindi.' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Sunucu Hatası');
    }
});

// --- 22. VİDEO DERS EKLE (Sadece Öğretmen) ---
router.post('/materyal-ekle', authMiddleware, async (req, res) => {
    if (req.user.rol !== 'ogretmen') return res.status(403).json({ hata: 'Yetkisiz.' });
    try {

        const { ders_id, baslik, video_url } = req.body;

        const yetkiKontrol = await pool.query(
            'SELECT ders_id FROM Dersler WHERE ders_id = $1 AND ogretmen_id = $2',
            [ders_id, req.user.id]
        );
        // başka birisi bir başka ogretmenin yerine materyal ekleyememesi için yetki kontrol kod bloğu ekledim        
        if (yetkiKontrol.rows.length === 0) {
            return res.status(403).json({ hata: 'Bu derse materyal ekleme yetkiniz yok.' });
        }

        const yeniMateryal = await pool.query(
            'INSERT INTO DersMateryalleri (ders_id, baslik, video_url) VALUES ($1, $2, $3) RETURNING *',
            [ders_id, baslik, video_url]
            // RETURNING * => Bu veriyi ekle ve eklediğin halini (ID'siyle birlikte) bana geri döndür.
            // Böylece yeniMateryal.rows[0] ile tek bir sorguda veriyi Flutter tarafına anında gönderebiliyorum

        );
        res.status(201).json({ mesaj: 'Video ders eklendi.', materyal: yeniMateryal.rows[0] });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// --- 23. DERS MATERYALLERİNİ GETİR ---
router.get('/materyaller/:ders_id', authMiddleware, async (req, res) => {
    try {

        const { ders_id } = req.params;
        const userId = req.user.id;
        const userRol = req.user.rol;

        let yetkiliMi = false;

        // 1. KONTROL: Eğer istek atan öğretmense, dersin sahibi o mu?

        if (userRol === 'ogretmen') {
            const hocaKontrol = await pool.query(
                'SELECT 1 FROM Dersler WHERE ders_id = $1 AND ogretmen_id = $2', // sadece böyle kayıt varmı diye bakıyoruz
                [ders_id, userId]
            );
            if (hocaKontrol.rows.length > 0) yetkiliMi = true;
        }
        // 2. KONTROL: Eğer istek atan öğrenciyse, bu derse kayıtlı mı?
        else if (userRol === 'ogrenci') {
            const ogrenciKontrol = await pool.query(
                'SELECT 1 FROM OgrenciDers WHERE ders_id = $1 AND ogrenci_id = $2',
                [ders_id, userId]
            );
            if (ogrenciKontrol.rows.length > 0) yetkiliMi = true;
        }

        // Eğer iki şarta da uymadıysa kapıdan geri çevir
        if (!yetkiliMi) {
            return res.status(403).json({ hata: 'Bu dersin materyallerini görme yetkiniz yok.' });
        }

        const materyaller = await pool.query(
            'SELECT * FROM DersMateryalleri WHERE ders_id = $1 ORDER BY eklenme_tarihi DESC',
            [req.params.ders_id]
            // en yeniden en eskiye doğru gelicek mateyaller
        );
        res.json(materyaller.rows);
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// --- 24. CANLI DERS LİNKİ OLUŞTUR / GETİR ---
router.get('/canli-ders/:ders_id', authMiddleware, async (req, res) => {
    try {
        const { ders_id } = req.params;
        const userId = req.user.id;
        const userRol = req.user.rol;

        let yetkiliMi = false;

        // 1. KONTROL: Öğretmense dersin sahibi o mu? Veya Öğrenciyse derse kayıtlı mı?
        if (userRol === 'ogretmen') {
            const hocaKontrol = await pool.query('SELECT 1 FROM Dersler WHERE ders_id = $1 AND ogretmen_id = $2', [ders_id, userId]);
            if (hocaKontrol.rows.length > 0) yetkiliMi = true;
        } else if (userRol === 'ogrenci') {
            const ogrenciKontrol = await pool.query('SELECT 1 FROM OgrenciDers WHERE ders_id = $1 AND ogrenci_id = $2', [ders_id, userId]);
            if (ogrenciKontrol.rows.length > 0) yetkiliMi = true;
        }

        // Yetkisi yoksa linki verme
        if (!yetkiliMi) return res.status(403).json({ hata: 'Bu canlı derse katılma yetkiniz yok.' });

        // 2. Yetkisi varsa ders adını al
        const ders = await pool.query('SELECT ders_adi FROM Dersler WHERE ders_id = $1', [ders_id]);
        if (ders.rows.length === 0) return res.status(404).json({ hata: 'Ders bulunamadı.' });

        const dersAdi = ders.rows[0].ders_adi;
        // rows[0] diyerek o dizinin ilk elemanını alıyoruz ve sonundaki .ders_adi ile 
        // Sadece bana o kolonun metnini ver diyoruz (Örneğin sadece "Mobil Programlama" yazısın)      

        // Regex ile şunu diyoruz : Bu metindeki boşlukları bul ve alt çizgi (_) ile değiştir.
        const temizDersAdi = dersAdi.replace(/\s+/g, '_');

        // 3. KRİPTOGRAFİK GÜVENLİK KODU ÜRETİMİ
        // .env dosyamızdaki şifreyi kullanıyoruz, yoksa yedek bir metin kullanıyoruz
        const secretKey = process.env.JWT_SECRET || 'ogrenci_takip_gizli_anahtar';

        // Sadece bizim bildiğimiz verileri birleştirip hashliyoruz
        const hashData = `${ders_id}_${dersAdi}_${secretKey}`;

        // SHA-256 algoritmasıyla şifreleyip, çok uzun olmasın diye ilk 8 karakterini alıyoruz
        const guvenlikKodu = crypto.createHash('sha256').update(hashData).digest('hex').substring(0, 8);

        // 4. SONUÇ: Kırılamaz, tahmin edilemez ve güvenli Jitsi Linki
        const odaIsmi = `OgrenciTakip_${ders_id}_${temizDersAdi}_${guvenlikKodu}`;
        const jitsiUrl = `https://meet.jit.si/${odaIsmi}`;

        res.json({ url: jitsiUrl, oda_ismi: odaIsmi });
    } catch (err) {
        console.error(err);
        res.status(500).send('Sunucu Hatası');
    }
});

// 26 Ders kaydını veritabanına ekleyen API
router.post('/gecmis-yayin/ekle', authMiddleware, async (req, res) => {
    const { ders_id, baslik, link } = req.body;
    try {
        const yeniKayit = await pool.query(
            'INSERT INTO GecmisYayinlar (ders_id, baslik, link) VALUES ($1, $2, $3) RETURNING *',
            [ders_id, baslik, link]
        );
        res.status(201).json({ mesaj: "Kayıt başarıyla eklendi", kayit: yeniKayit.rows[0] });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ hata: "Sunucu hatası oluştu." });
    }
});

// 27 Belirli bir dersin geçmiş yayın kayıtlarını getiren API
router.get('/gecmis-yayin/:dersId', authMiddleware, async (req, res) => {
    const { dersId } = req.params;
    try {
        const yayinlar = await pool.query(
            'SELECT * FROM GecmisYayinlar WHERE ders_id = $1 ORDER BY eklenme_tarihi DESC',
            [dersId]
        );
        res.json(yayinlar.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ hata: "Sunucu hatası oluştu." });
    }
});

module.exports = router;