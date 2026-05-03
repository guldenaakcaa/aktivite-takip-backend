const multer = require('multer');
const path = require('path');
const fs = require('fs');
const express = require('express');  // web sunucusu
const cors = require('cors');   // flutter ile sorunsuz konuşabilmesi için
const pool = require('./db');  // veritabnına bağlanan poolu dosyaya çekiyoruz
const bcrypt = require('bcrypt');  // şifre gizleme
const jwt = require('jsonwebtoken'); // kullanıcı giriş yaptığında token alması için
const nodemailer = require('nodemailer');  // otomatik mail
require('dotenv').config();  //gizli bilgileri koda yazmayıp .env isimli gizli dosyadan okuma

const app = express();  // express çalışır adını app koydum
const PORT = process.env.PORT || 3000; // dinleyeceği port env de belirtilmişse onu yoksa 3000 kullanır
const SECRET_KEY = process.env.JWT_SECRET || 'gizli-anahtarim'; 

//// sorgularda hep await kullanılmasının sebebi bekletmek. await olmazsa hızlı bir şekilde (node.js kaynaklı) devam eder.
//  ama await ile cevap gelmesini bekle diyoruz


app.use(cors()); // dışardan gelen istekleri açar
app.use('/uploads', express.static('uploads'));
app.use(express.json()); //gelen veriyi jsona çevirir

// JWT Doğrulama 
const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', ''); // token var mı diye bakar
    if (!token) return res.status(401).json({ hata: 'Erişim reddedildi. Token eksik.' });

    try {
        const decoded = jwt.verify(token, SECRET_KEY); // token varsa sahte mi yoksa bizim anahtaar ile mühürlü mü 
        req.user = decoded; 
        next(); // herşey yolundaysa kişi işlem yapabilir
    } catch (ex) {
        res.status(400).json({ hata: 'Geçersiz token.' });
    }
};

app.get('/', (req, res) => res.send('Backend Çalışıyor!')); // test amaçlı

// 1. KAYIT OL 
app.post('/kayit', async (req, res) => {
    try {
        const { ad_soyad, email, sifre, rol } = req.body;
        if (!['ogrenci', 'ogretmen'].includes(rol)) return res.status(400).json({ hata: "Geçersiz rol." });

        const userCheck = await pool.query('SELECT * FROM Kullanicilar WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) return res.status(400).json({ hata: 'Bu email kayıtlı!' });
        
        const hashedPassword = await bcrypt.hash(sifre, 10); // bcrypt ile aldığımız şifreli random 10 karakter ile tutuyoruz
        const newUser = await pool.query(
            'INSERT INTO Kullanicilar (ad_soyad, email, sifre, rol) VALUES ($1, $2, $3, $4) RETURNING kullanici_id, ad_soyad, email, rol',
            [ad_soyad, email, hashedPassword, rol]
        );
        res.status(201).json({ mesaj: 'Kayıt başarılı!', kullanici: newUser.rows[0] });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// 2. GİRİŞ YAP 
app.post('/giris', async (req, res) => {
    try {
        const { email, sifre } = req.body;
        const user = await pool.query('SELECT * FROM Kullanicilar WHERE email = $1', [email]);
        if (user.rows.length === 0) return res.status(401).json({ hata: 'Hatalı giriş.' });

        const validPassword = await bcrypt.compare(sifre, user.rows[0].sifre);
        if (!validPassword) return res.status(401).json({ hata: 'Hatalı giriş.' });

        const token = jwt.sign(   
// Öğrenci bir kere giriş yaptıktan sonra o bileti (Token) sonsuza kadar geçerli sayamayız
// Bankacılık uygulamalarının bir süre sonra dışarı atmasıyla aynı mantıktır.
// belli bir süre sonra (24 saat) dışarı atar 
            { id: user.rows[0].kullanici_id, rol: user.rows[0].rol, ad_soyad: user.rows[0].ad_soyad },
// veritabnaında al ve ıd olarak rol olarak kaydet demek            
            SECRET_KEY, { expiresIn: '24h' }   
        );
        res.json({ mesaj: 'Giriş Başarılı!', token, user: { rol: user.rows[0].rol, ad_soyad: user.rows[0].ad_soyad } });
 // fluttter da ekstra kod yazmamk için. burası uygulama girşi olduğunda dirkt hoşgeldin gulden fln der
       
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

//  3. DERS OLUŞTURMA 
app.post('/dersler/olustur', authMiddleware, async (req, res) => {
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
        res.status(201).json({ mesaj: 'Ders oluşturuldu.', ders: newDers.rows[0] });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// 4. TÜM DERSLERİ LİSTELE 
app.get('/dersler/tum', authMiddleware, async (req, res) => {
    try {
        const rows = await pool.query(`SELECT d.ders_id, d.ders_adi, d.aciklama, k.ad_soyad as ogretmen_adi 
            FROM Dersler d JOIN Kullanicilar k ON d.ogretmen_id = k.kullanici_id`);
        res.json(rows.rows);
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// 5. DERSE KAYIT OL 
app.post('/dersler/kayit', authMiddleware, async (req, res) => {
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
app.get('/dersler/benim', authMiddleware, async (req, res) => {
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

// 7. MOLA BAŞLAT 
app.post('/mola/baslat', authMiddleware, async (req, res) => {
    try {
        const { ders_id, sebep } = req.body;
       
        const aktif = await pool.query('SELECT * FROM Molalar WHERE ogrenci_id = $1 AND ders_id = $2 AND bitis_zamani IS NULL', [req.user.id, ders_id]);
        if (aktif.rows.length > 0) return res.json({ mesaj: 'Zaten moladasınız.', mola: aktif.rows[0] });

        const mola = await pool.query('INSERT INTO Molalar (ogrenci_id, ders_id, sebep) VALUES ($1, $2, $3) RETURNING *', [req.user.id, ders_id, sebep]);
        res.json({ mesaj: 'Mola başladı.', mola: mola.rows[0] });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// 8. MOLA BİTİR 
app.put('/mola/bitir', authMiddleware, async (req, res) => {
    try {
       const result = await pool.query(   //Veritabanından bize bir cevap(const result). pool db köprüsü query sorgu
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

// 9. AKTİVİTE GİRİŞ 
app.post('/aktivite/giris', authMiddleware, async (req, res) => {
    try {
        const { ders_id } = req.body;
        await pool.query('UPDATE Aktiviteler SET cikis_zamani = NOW(), toplam_sure = NOW() - giris_zamani WHERE ogrenci_id = $1 AND cikis_zamani IS NULL', [req.user.id]);
/// Bu öğrenci yeni bir derse girmek istiyor. Eğer sistemde çıkış yapmayı unuttuğu eski ve açık bir dersi varsa,
//  o eski dersi o anki saatle (NOW()) hemen otomatik olarak kapat.
        await pool.query('INSERT INTO Aktiviteler (ogrenci_id, ders_id, giris_zamani) VALUES ($1, $2, NOW())', [req.user.id, ders_id]);
// Eski hesaplar temizlendikten ve öğrencinin üstünde hiçbir açık ders kalmadıktan sonra,
//  güvenli bir şekilde yeni dersin girişi veritabanına işlenir.
        res.json({ mesaj: 'Derse girildi.' });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// 10. AKTİVİTE ÇIKIŞ
app.post('/aktivite/cikis', authMiddleware, async (req, res) => {
    try {
        await pool.query('UPDATE Aktiviteler SET cikis_zamani = NOW(), toplam_sure = NOW() - giris_zamani WHERE ogrenci_id = $1 AND cikis_zamani IS NULL', [req.user.id]);
        await pool.query('UPDATE Molalar SET bitis_zamani = NOW() WHERE ogrenci_id = $1 AND bitis_zamani IS NULL', [req.user.id]);
// Öğrenci sistemi/dersi terk ediyorsa, açık kalmış molası varsa onu da hemen kapat" 
// diyerek olası bir mantık hatasını (bug) kökünden çözüyor.
        res.json({ mesaj: 'Çıkış yapıldı.' });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// 11. CANLI DURUM RAPORU 
app.get('/rapor/canli/:ders_id', authMiddleware, async (req, res) => {  /// kısmındaki iki nokta (:) node.jse şunu der buraya bir numara gelecek
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

// 13. SESLİ NOT YÜKLEME
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

// 14. SESLİ NOTLARI LİSTELE 
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

// 15. ÖĞRENCİ AKTİVİTE DURUMU KONTROL 
app.get('/aktivite/durum/:ders_id', authMiddleware, async (req, res) => {
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

// 16. ŞİFREMİ UNUTTUM 
app.post('/forgot-password', async (req, res) => {
    
    const { email } = req.body;
    try {
        const user = await pool.query('SELECT * FROM Kullanicilar WHERE email = $1', [email]);
        
        if (user.rows.length === 0) {
            return res.status(404).json({ hata: "Bu e-posta adresi kayıtlı değil." });
        }
//Flutter'dan kullanıcı "Şifremi Unuttum" deyip e-postasını gönderdiğinde, sistem hemen  mail atmaya çalışmaz. 
// Önce veritabanına sorar: "Böyle biri bizde kayıtlı mı?"    


        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
// Math.random() 0 ile 1 arasında küsuratlı bir sayı üretir.Bunu matematikle ayarlayıp sonuç her zaman 6 haneli 
// (örneğin 482910) bir sayı çıkıyor.
        
        await pool.query(
            "UPDATE Kullanicilar SET sifirlama_kodu = $1, kod_suresi = NOW() + INTERVAL '15 minutes' WHERE email = $2",
            [verificationCode, email]
        );
// Gönderilen o 6 haneli kod sonsuza kadar geçerli kalmaz. 15 dk kalır

     
         // burda benim kendi mailimden mesaj (kod) gidiyor. 
         // onun için google den şifre aldım ve onu tanımladım.
         // kullanıcılara kod gittiğinde orda benim mailim yazıyor.
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
<<<<<<< HEAD
                user: process.env.EMAIL_ADRES,
               pass: process.env.EMAIL_SIFRE  
=======
                user: 'guldenaakcaa@gmail.com', 
                pass: process.env.EMAIL_SIFRE     
>>>>>>> 53cf52352fe3004aacacce32fe1f3095a1968470
            }
        });

        const mailOptions = {
            from: `"Öğrenci Takip Sistemi" <${process.env.EMAIL_ADRES}>`,
            to: email,
            subject: 'Şifre Sıfırlama Kodu',
            text: `Merhaba,\n\nŞifreni sıfırlamak için gereken kodun: ${verificationCode}\n\nBu kod 15 dakika geçerlidir.`
        };

        await transporter.sendMail(mailOptions);
        console.log(`Kod gönderildi: ${verificationCode}`); 

        res.json({ mesaj: "Doğrulama kodu e-posta adresinize gönderildi!" });

    } catch (error) {
        console.error("Mail hatası:", error);
        res.status(500).json({ hata: "Mail gönderilirken bir hata oluştu." });
    }
});
// 17. ŞİFRE SIFIRLAMA 
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

// 19. PROFİL: ŞİFRE DEĞİŞTİR (Giriş Yapmış Kullanıcı İçin)
app.post('/profil/sifre-degistir', authMiddleware, async (req, res) => {
    try {
        const { eski_sifre, yeni_sifre } = req.body;
        const userId = req.user.id;

        const user = await pool.query('SELECT * FROM Kullanicilar WHERE kullanici_id = $1', [userId]);
        if (user.rows.length === 0) return res.status(404).json({ hata: 'Kullanıcı bulunamadı.' });

        const validPassword = await bcrypt.compare(eski_sifre, user.rows[0].sifre);
        if (!validPassword) return res.status(400).json({ hata: 'Eski şifreniz hatalı.' });

        const hashedPassword = await bcrypt.hash(yeni_sifre, 10);
        await pool.query('UPDATE Kullanicilar SET sifre = $1 WHERE kullanici_id = $2', [hashedPassword, userId]);

        res.json({ mesaj: 'Şifreniz başarıyla güncellendi. 🎉' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Sunucu Hatası');
    }
});


// 20. PROFİL BİLGİLERİNİ GETİR 
app.get('/profil/bilgi', authMiddleware, async (req, res) => {
    try {
        const user = await pool.query('SELECT ad_soyad, email, rol FROM Kullanicilar WHERE kullanici_id = $1', [req.user.id]);
        if (user.rows.length === 0) return res.status(404).json({ hata: 'Kullanıcı bulunamadı.' });
        res.json(user.rows[0]);
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// 21. PROFİL BİLGİLERİNİ GÜNCELLE 
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

// 22. DERS SİLME (Öğretmen İçin)
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

<<<<<<< HEAD
// --- 23. VİDEO DERS EKLE (Sadece Öğretmen) ---
app.post('/dersler/materyal-ekle', authMiddleware, async (req, res) => {
    if (req.user.rol !== 'ogretmen') return res.status(403).json({ hata: 'Yetkisiz.' });
    try {
        const { ders_id, baslik, video_url } = req.body;
        const yeniMateryal = await pool.query(
            'INSERT INTO DersMateryalleri (ders_id, baslik, video_url) VALUES ($1, $2, $3) RETURNING *',
            [ders_id, baslik, video_url]
        );
        res.status(201).json({ mesaj: 'Video ders eklendi.', materyal: yeniMateryal.rows[0] });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// --- 24. DERS MATERYALLERİNİ GETİR ---
app.get('/dersler/materyaller/:ders_id', authMiddleware, async (req, res) => {
    try {
        const materyaller = await pool.query(
            'SELECT * FROM DersMateryalleri WHERE ders_id = $1 ORDER BY eklenme_tarihi DESC',
            [req.params.ders_id]
        );
        res.json(materyaller.rows);
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// --- 25. CANLI DERS LİNKİ OLUŞTUR / GETİR ---
app.get('/dersler/canli-ders/:ders_id', authMiddleware, async (req, res) => {
    try {
        const { ders_id } = req.params;
        // Dersin varlığını kontrol et
        const ders = await pool.query('SELECT ders_adi FROM Dersler WHERE ders_id = $1', [ders_id]);
        if (ders.rows.length === 0) return res.status(404).json({ hata: 'Ders bulunamadı.' });

        // Jitsi için benzersiz ve güvenli bir oda ismi üret (Boşlukları temizle)
        const odaIsmi = `OgrenciTakip_${ders_id}_${ders.rows[0].ders_adi.replace(/\s+/g, '_')}`;
        const jitsiUrl = `https://meet.jit.si/${odaIsmi}`;

        res.json({ url: jitsiUrl, oda_ismi: odaIsmi });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

app.listen(PORT, '0.0.0.0', () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));
=======
app.listen(PORT, '0.0.0.0', () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));
>>>>>>> 53cf52352fe3004aacacce32fe1f3095a1968470
