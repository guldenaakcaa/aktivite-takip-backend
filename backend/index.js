const multer = require('multer');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET || 'gizli-anahtarim'; 

app.use(cors());
app.use('/uploads', express.static('uploads'));
app.use(express.json());

// --- JWT Doğrulama Middleware'i ---
const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ hata: 'Erişim reddedildi. Token eksik.' });

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = decoded; 
        next();
    } catch (ex) {
        res.status(400).json({ hata: 'Geçersiz token.' });
    }
};

app.get('/', (req, res) => res.send('Backend Çalışıyor!'));

// --- 1. KAYIT OL ---
app.post('/kayit', async (req, res) => {
    try {
        const { ad_soyad, email, sifre, rol } = req.body;
        if (!['ogrenci', 'ogretmen'].includes(rol)) return res.status(400).json({ hata: "Geçersiz rol." });

        const userCheck = await pool.query('SELECT * FROM Kullanicilar WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) return res.status(400).json({ hata: 'Bu email kayıtlı!' });
        
        const hashedPassword = await bcrypt.hash(sifre, 10);
        const newUser = await pool.query(
            'INSERT INTO Kullanicilar (ad_soyad, email, sifre, rol) VALUES ($1, $2, $3, $4) RETURNING kullanici_id, ad_soyad, email, rol',
            [ad_soyad, email, hashedPassword, rol]
        );
        res.status(201).json({ mesaj: 'Kayıt başarılı!', kullanici: newUser.rows[0] });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// --- 2. GİRİŞ YAP ---
app.post('/giris', async (req, res) => {
    try {
        const { email, sifre } = req.body;
        const user = await pool.query('SELECT * FROM Kullanicilar WHERE email = $1', [email]);
        if (user.rows.length === 0) return res.status(401).json({ hata: 'Hatalı giriş.' });

        const validPassword = await bcrypt.compare(sifre, user.rows[0].sifre);
        if (!validPassword) return res.status(401).json({ hata: 'Hatalı giriş.' });

        const token = jwt.sign(
            { id: user.rows[0].kullanici_id, rol: user.rows[0].rol, ad_soyad: user.rows[0].ad_soyad },
            SECRET_KEY, { expiresIn: '24h' }
        );
        res.json({ mesaj: 'Giriş Başarılı!', token, user: { rol: user.rows[0].rol, ad_soyad: user.rows[0].ad_soyad } });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// --- 3. DERS OLUŞTURMA ---
app.post('/dersler/olustur', authMiddleware, async (req, res) => {
    if (req.user.rol !== 'ogretmen') return res.status(403).json({ hata: 'Yetkisiz.' });
    try {
        const { ders_adi, aciklama } = req.body;

        // KONTROL: Ders adı boş mu?
        if (!ders_adi || ders_adi.trim() === "") {
            return res.status(400).json({ hata: "Ders adı boş bırakılamaz!" });
        }

        const newDers = await pool.query(
            'INSERT INTO Dersler (ders_adi, aciklama, ogretmen_id) VALUES ($1, $2, $3) RETURNING *',
            [ders_adi, aciklama, req.user.id]
        );
        res.status(201).json({ mesaj: 'Ders oluşturuldu.', ders: newDers.rows[0] });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// --- 4. TÜM DERSLERİ LİSTELE ---
app.get('/dersler/tum', authMiddleware, async (req, res) => {
    try {
        const rows = await pool.query(`SELECT d.ders_id, d.ders_adi, d.aciklama, k.ad_soyad as ogretmen_adi FROM Dersler d JOIN Kullanicilar k ON d.ogretmen_id = k.kullanici_id`);
        res.json(rows.rows);
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// --- 5. DERSE KAYIT OL ---
app.post('/dersler/kayit', authMiddleware, async (req, res) => {
    if (req.user.rol !== 'ogrenci') return res.status(403).json({ hata: 'Sadece öğrenciler.' });
    try {
        const { ders_id } = req.body;
        const check = await pool.query('SELECT * FROM OgrenciDers WHERE ogrenci_id = $1 AND ders_id = $2', [req.user.id, ders_id]);
        if (check.rows.length > 0) return res.status(400).json({ hata: 'Zaten kayıtlısınız.' });

        await pool.query('INSERT INTO OgrenciDers (ogrenci_id, ders_id) VALUES ($1, $2)', [req.user.id, ders_id]);
        res.status(201).json({ mesaj: 'Kayıt olundu.' });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// --- 6. BENİM DERSLERİM ---
app.get('/dersler/benim', authMiddleware, async (req, res) => {
    try {
        let query;
        if (req.user.rol === 'ogrenci') {
            query = `SELECT d.ders_id, d.ders_adi, d.aciklama, k.ad_soyad AS ogretmen_adi FROM OgrenciDers od JOIN Dersler d ON od.ders_id = d.ders_id JOIN Kullanicilar k ON d.ogretmen_id = k.kullanici_id WHERE od.ogrenci_id = $1`;
        } else {
            query = `SELECT * FROM Dersler WHERE ogretmen_id = $1`;
        }
        const dersler = await pool.query(query, [req.user.id]);
        res.json(dersler.rows);
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// --- 7. MOLA BAŞLAT ---
app.post('/mola/baslat', authMiddleware, async (req, res) => {
    try {
        const { ders_id, sebep } = req.body;
        // Zaten molada mı?
        // Sütun ismi 'bitis_zamani' olarak düzeltildi
        const aktif = await pool.query('SELECT * FROM Molalar WHERE ogrenci_id = $1 AND ders_id = $2 AND bitis_zamani IS NULL', [req.user.id, ders_id]);
        if (aktif.rows.length > 0) return res.json({ mesaj: 'Zaten moladasınız.', mola: aktif.rows[0] });

        // 'baslangic_zamani' varsayılan olarak NOW() alır, belirtmeye gerek yok ama yazılabilir
        const mola = await pool.query('INSERT INTO Molalar (ogrenci_id, ders_id, sebep) VALUES ($1, $2, $3) RETURNING *', [req.user.id, ders_id, sebep]);
        res.json({ mesaj: 'Mola başladı.', mola: mola.rows[0] });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// --- 8. MOLA BİTİR (DÜZELTİLMİŞ DOĞRU VERSİYON) ---
app.put('/mola/bitir', authMiddleware, async (req, res) => {
    try {
       const result = await pool.query(
            "UPDATE Molalar SET bitis_zamani = NOW() WHERE ogrenci_id = $1 AND bitis_zamani IS NULL RETURNING *",
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ hata: "Kapatılacak açık bir mola bulunamadı." });
        }
        
        res.json({ mesaj: 'Mola bitti.', mola: result.rows[0] });
    } catch (err) {
        console.error("Mola Bitirme Hatası:", err);
        res.status(500).send('Sunucu Hatası');
    }
});

// --- 9. AKTİVİTE GİRİŞ ---
app.post('/aktivite/giris', authMiddleware, async (req, res) => {
    try {
        const { ders_id } = req.body;
        // Eski açık oturumları kapat
        await pool.query('UPDATE Aktiviteler SET cikis_zamani = NOW(), toplam_sure = NOW() - giris_zamani WHERE ogrenci_id = $1 AND cikis_zamani IS NULL', [req.user.id]);
        // Yenisini başlat
        await pool.query('INSERT INTO Aktiviteler (ogrenci_id, ders_id, giris_zamani) VALUES ($1, $2, NOW())', [req.user.id, ders_id]);
        res.json({ mesaj: 'Derse girildi.' });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// --- 10. AKTİVİTE ÇIKIŞ ---
app.post('/aktivite/cikis', authMiddleware, async (req, res) => {
    try {
        // Aktiviteleri kapat
        await pool.query('UPDATE Aktiviteler SET cikis_zamani = NOW(), toplam_sure = NOW() - giris_zamani WHERE ogrenci_id = $1 AND cikis_zamani IS NULL', [req.user.id]);
        // Molaları kapat
        await pool.query('UPDATE Molalar SET bitis_zamani = NOW() WHERE ogrenci_id = $1 AND bitis_zamani IS NULL', [req.user.id]);
        res.json({ mesaj: 'Çıkış yapıldı.' });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// --- 11. CANLI DURUM RAPORU ---
app.get('/rapor/canli/:ders_id', authMiddleware, async (req, res) => {
    try {
        const { ders_id } = req.params;
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
        const sonuc = await pool.query(sql, [ders_id]);
        res.json(sonuc.rows);
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// --- 12. DETAYLI RAPOR ---
app.get('/rapor/detayli/:ders_id', authMiddleware, async (req, res) => {
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
        const result = await pool.query(sql, [ders_id]);
        res.json(result.rows);
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// --- 13. SESLİ NOT YÜKLEME ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const p = 'uploads/'; if (!fs.existsSync(p)) fs.mkdirSync(p); cb(null, p);
    },
    filename: (req, file, cb) => cb(null, 'ses-' + Date.now() + Math.round(Math.random()*1E9) + path.extname(file.originalname))
});
const upload = multer({ storage });

app.post('/sesli-not/yukle', authMiddleware, upload.single('ses_dosyasi'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ hata: 'Dosya yok.' });
        await pool.query('INSERT INTO SesliNotlar (ogrenci_id, ders_id, dosya_yolu) VALUES ($1, $2, $3)', [req.user.id, req.body.ders_id, req.file.path]);
        res.status(201).json({ mesaj: 'Ses kaydedildi.', dosya: req.file.path });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// --- 14. SESLİ NOTLARI LİSTELE ---
app.get('/sesli-notlar/:ders_id', authMiddleware, async (req, res) => {
    try {
        let sql = `SELECT s.*, k.ad_soyad FROM SesliNotlar s JOIN Kullanicilar k ON s.ogrenci_id = k.kullanici_id WHERE s.ders_id = $1`;
        let params = [req.params.ders_id];
        if (req.user.rol === 'ogrenci') { sql += ' AND s.ogrenci_id = $2'; params.push(req.user.id); }
        sql += ' ORDER BY s.olusturulma_zamani DESC';
        const rows = await pool.query(sql, params);
        res.json(rows.rows);
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// --- 15. ÖĞRENCİ AKTİVİTE DURUMU KONTROL (DÜZELTİLMİŞ) ---
app.get('/aktivite/durum/:ders_id', authMiddleware, async (req, res) => {
    try {
        const { ders_id } = req.params;
        const ogrenci_id = req.user.id;

        // 1. Mola Kontrolü (bitis_zamani NULL mu?)
        const mola = await pool.query(
            "SELECT * FROM Molalar WHERE ogrenci_id = $1 AND ders_id = $2 AND bitis_zamani IS NULL",
            [ogrenci_id, ders_id]
        );

        if (mola.rows.length > 0) {
            return res.json({ 
                durum: 'MOLADA', 
                // DB'deki ismi (baslangic_zamani) alıp Frontend'e (baslangic) diye gönderiyoruz:
                baslangic: mola.rows[0].baslangic_zamani 
            });
        }

        // 2. Ders Kontrolü (cikis_zamani NULL mu?)
        const aktivite = await pool.query(
            "SELECT * FROM Aktiviteler WHERE ogrenci_id = $1 AND ders_id = $2 AND cikis_zamani IS NULL",
            [ogrenci_id, ders_id]
        );

        if (aktivite.rows.length > 0) {
            return res.json({ 
                durum: 'DERSTE', 
                baslangic: aktivite.rows[0].giris_zamani 
            });
        }

        res.json({ durum: 'BOSTA', baslangic: null });
    } catch (err) {
        console.error(err);
        res.status(500).send('Sunucu Hatası');
    }
});

// --- 16. ŞİFREMİ UNUTTUM (DÜZELTİLMİŞ & POSTGRESQL UYUMLU) ---
app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    try {
        // 1. Kullanıcıyı bul (PostgreSQL Sorgusu)
        const user = await pool.query('SELECT * FROM Kullanicilar WHERE email = $1', [email]);
        
        if (user.rows.length === 0) {
            return res.status(404).json({ hata: "Bu e-posta adresi kayıtlı değil." });
        }

        // 2. 6 haneli rastgele kod üret
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

        // 3. Kodu veritabanına kaydet (PostgreSQL UPDATE komutu)
        // kod_suresi: Şu anki zamana 15 dakika ekler
        await pool.query(
            "UPDATE Kullanicilar SET sifirlama_kodu = $1, kod_suresi = NOW() + INTERVAL '15 minutes' WHERE email = $2",
            [verificationCode, email]
        );

        // 4. MAİL GÖNDERME AYARLARI
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'guldenaakcaa@gmail.com', 
                pass: process.env.EMAIL_SIFRE     
            }
        });

        // 5. Mail İçeriği
        const mailOptions = {
            from: '"Öğrenci Takip Sistemi" <guldenaakcaa@gmail.com>',
            to: email,
            subject: 'Şifre Sıfırlama Kodu',
            text: `Merhaba,\n\nŞifreni sıfırlamak için gereken kodun: ${verificationCode}\n\nBu kod 15 dakika geçerlidir.`
        };

        // 6. Maili Gönder
        await transporter.sendMail(mailOptions);
        console.log(`Kod gönderildi: ${verificationCode}`); 

        res.json({ mesaj: "Doğrulama kodu e-posta adresinize gönderildi!" });

    } catch (error) {
        console.error("Mail hatası:", error);
        res.status(500).json({ hata: "Mail gönderilirken bir hata oluştu." });
    }
});
// --- 17. ŞİFRE SIFIRLAMA ---
app.post('/sifre-sifirla', async (req, res) => {
    try {
        const { email, kod, yeni_sifre } = req.body;
        const check = await pool.query(
            "SELECT * FROM Kullanicilar WHERE email = $1 AND sifirlama_kodu = $2 AND kod_suresi > NOW()",
            [email, kod]
        );

        if (check.rows.length === 0) return res.status(400).json({ hata: 'Kod hatalı veya süresi dolmuş.' });

        const hashed = await bcrypt.hash(yeni_sifre, 10);
        await pool.query(
            "UPDATE Kullanicilar SET sifre = $1, sifirlama_kodu = NULL, kod_suresi = NULL WHERE email = $2",
            [hashed, email]
        );

        res.json({ mesaj: 'Şifre başarıyla değiştirildi.' });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// --- 19. PROFİL: ŞİFRE DEĞİŞTİR (Giriş Yapmış Kullanıcı İçin) ---
app.post('/profil/sifre-degistir', authMiddleware, async (req, res) => {
    try {
        const { eski_sifre, yeni_sifre } = req.body;
        const userId = req.user.id;

        // 1. Kullanıcıyı bul
        const user = await pool.query('SELECT * FROM Kullanicilar WHERE kullanici_id = $1', [userId]);
        if (user.rows.length === 0) return res.status(404).json({ hata: 'Kullanıcı bulunamadı.' });

        // 2. Eski şifreyi kontrol et
        const validPassword = await bcrypt.compare(eski_sifre, user.rows[0].sifre);
        if (!validPassword) return res.status(400).json({ hata: 'Eski şifreniz hatalı.' });

        // 3. Yeni şifreyi hashle ve kaydet
        const hashedPassword = await bcrypt.hash(yeni_sifre, 10);
        await pool.query('UPDATE Kullanicilar SET sifre = $1 WHERE kullanici_id = $2', [hashedPassword, userId]);

        res.json({ mesaj: 'Şifreniz başarıyla güncellendi. 🎉' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Sunucu Hatası');
    }
});


// --- 20. PROFİL BİLGİLERİNİ GETİR ---
app.get('/profil/bilgi', authMiddleware, async (req, res) => {
    try {
        const user = await pool.query('SELECT ad_soyad, email, rol FROM Kullanicilar WHERE kullanici_id = $1', [req.user.id]);
        if (user.rows.length === 0) return res.status(404).json({ hata: 'Kullanıcı bulunamadı.' });
        res.json(user.rows[0]);
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// --- 21. PROFİL BİLGİLERİNİ GÜNCELLE (Ad, Email) ---
app.put('/profil/guncelle', authMiddleware, async (req, res) => {
    try {
        const { ad_soyad, email } = req.body;
        // Email başkasında var mı kontrol et (kendi emaili hariç)
        const check = await pool.query('SELECT * FROM Kullanicilar WHERE email = $1 AND kullanici_id != $2', [email, req.user.id]);
        if (check.rows.length > 0) return res.status(400).json({ hata: 'Bu e-posta adresi kullanımda.' });

        await pool.query('UPDATE Kullanicilar SET ad_soyad = $1, email = $2 WHERE kullanici_id = $3', [ad_soyad, email, req.user.id]);
        res.json({ mesaj: 'Profil bilgileri güncellendi.' });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// --- 22. DERS SİLME (Öğretmen İçin) ---
app.delete('/dersler/sil/:ders_id', authMiddleware, async (req, res) => {
    if (req.user.rol !== 'ogretmen') return res.status(403).json({ hata: 'Yetkisiz.' });
    try {
        const { ders_id } = req.params;

        // 1. Bu ders gerçekten bu hocaya mı ait?
        const check = await pool.query('SELECT * FROM Dersler WHERE ders_id = $1 AND ogretmen_id = $2', [ders_id, req.user.id]);
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

app.listen(PORT, '0.0.0.0', () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));
