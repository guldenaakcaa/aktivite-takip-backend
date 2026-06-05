const path = require('path');
const fs = require('fs');
const express = require('express');  // web sunucusu
const cors = require('cors');   // flutter ile sorunsuz konuşabilmesi için
const pool = require('./db');  // veritabnına bağlanan poolu dosyaya çekiyoruz
const bcrypt = require('bcrypt');  // şifre gizleme
const jwt = require('jsonwebtoken'); // kullanıcı giriş yaptığında token alması için
const nodemailer = require('nodemailer');  // otomatik mail
require('dotenv').config();  //gizli bilgileri koda yazmayıp .env isimli gizli dosyadan okuma
const crypto = require('crypto');  // idler aynı kaldığı sürece hep aynı karmaşık metni üretecek. 
// Dışarıdan biri ise gizli anahtarımızı bilmediği için bu metni asla tahmin edemeyecek.

const app = express();  // express çalışır adını app koydum
const PORT = process.env.PORT || 3000; // dinleyeceği port env de belirtilmişse onu yoksa 3000 kullanır
const SECRET_KEY = process.env.JWT_SECRET || 'gizli-anahtarim';
const axios = require('axios'); // Node.js tarafında başka bir sunucuya HTTP isteği atmak için

//// sorgularda hep await kullanılmasının sebebi bekletmek. await olmazsa hızlı bir şekilde (node.js kaynaklı) devam eder.
//  ama await ile cevap gelmesini bekle diyoruz

// bunu kullandığımız heryer için geçerli
// authMiddleware == elinde geçerli bir JWT (token) olmayan, 
// yani sisteme başarıyla giriş yapmamış hiç kimse bu kod bloğunu tetikleyemez

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
    } catch (err) {
        console.error("Kayıt Hatası Detayı:", err);
        res.status(500).json({ hata: "Sunucu Hatası", detay: err.message });
    }
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
app.post('/aktivite/cikis', authMiddleware, async (req, res) => {
    try {
        await pool.query('UPDATE Aktiviteler SET cikis_zamani = NOW(), toplam_sure = EXTRACT(EPOCH FROM (NOW() - giris_zamani))::INTEGER WHERE ogrenci_id = $1 AND cikis_zamani IS NULL', [req.user.id]);

        await pool.query('UPDATE Molalar SET bitis_zamani = NOW(), toplam_sure = EXTRACT(EPOCH FROM (NOW() - baslangic_zamani))::INTEGER WHERE ogrenci_id = $1 AND bitis_zamani IS NULL', [req.user.id]);
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

// 13. SOHBET MESAJI GÖNDERME
app.post('/sohbet/gonder', authMiddleware, async (req, res) => {
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
app.get('/sohbet/:ders_id', authMiddleware, async (req, res) => {
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
                user: process.env.EMAIL_ADRES,
                pass: process.env.EMAIL_SIFRE
            }
        });
        // buraları .env den çekmemizin sebebi güvenlikten dolayı env dosyaı sadcec bende var ve ordaki maile ve şifreyi 
        // sadece ben biliyorum . insanlar görmediği içinde çeşitli saldirilardan korunuyorum.
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
        const { email, kod, yeni_sifre } = req.body;   // verileri alıyoruz
        const check = await pool.query(
            "SELECT * FROM Kullanicilar WHERE email = $1 AND sifirlama_kodu = $2 AND kod_suresi > NOW()",
            [email, kod]
            // e-postası bu olsun VE girdiği kod veritabanındaki kodla eşleşsin 
            // en önemlisi kod_suresi şu anki zamandan (NOW()) daha ileri bir tarih olsun.
        );

        if (check.rows.length === 0) return res.status(400).json({ hata: 'Kod hatalı veya süresi dolmuş.' });

        const hashed = await bcrypt.hash(yeni_sifre, 10);   // yeni şifreyi karmaşık bir metne dönüştürdük
        await pool.query(
            "UPDATE Kullanicilar SET sifre = $1, sifirlama_kodu = NULL, kod_suresi = NULL WHERE email = $2",
            [hashed, email]
            // Şifreyi güncelledikten sonra sifirlama_kodu ve kod_suresi kolonlarını NULL (boş) yapıyoruz.
            // çünkü kullanıcı aynı kodu tekrar kulanmasın diye 
        );

        res.json({ mesaj: 'Şifre başarıyla değiştirildi.' });
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// 18. PROFİL: ŞİFRE DEĞİŞTİR (Giriş Yapmış Kullanıcı İçin)
app.post('/profil/sifre-degistir', authMiddleware, async (req, res) => {
    try {
        const { eski_sifre, yeni_sifre } = req.body;
        const userId = req.user.id;  // kullanıcıyı dışardan değil req.body iinden okuyoruz

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
app.get('/profil/bilgi', authMiddleware, async (req, res) => {
    try {
        const user = await pool.query('SELECT ad_soyad, email, rol FROM Kullanicilar WHERE kullanici_id = $1', [req.user.id]);
        // veritabanından herşeyi değil sadece lazım olanları getiriyoruz
        if (user.rows.length === 0) return res.status(404).json({ hata: 'Kullanıcı bulunamadı.' });
        res.json(user.rows[0]);
    } catch (err) { res.status(500).send('Sunucu Hatası'); }
});

// 20. PROFİL BİLGİLERİNİ GÜNCELLE 
app.put('/profil/guncelle', authMiddleware, async (req, res) => {
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

// 21. DERS SİLME (Öğretmen İçin)
app.delete('/dersler/sil/:ders_id', authMiddleware, async (req, res) => {
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
app.post('/dersler/materyal-ekle', authMiddleware, async (req, res) => {
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
app.get('/dersler/materyaller/:ders_id', authMiddleware, async (req, res) => {
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
app.get('/dersler/canli-ders/:ders_id', authMiddleware, async (req, res) => {
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

// --- 25. SEANS DEĞERLENDİRMESİ (Zorluk ve Stres) ---
app.post('/degerlendirme/kaydet', authMiddleware, async (req, res) => {
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
// 26 Ders kaydını veritabanına ekleyen API
app.post('/dersler/gecmis-yayin/ekle', authMiddleware, async (req, res) => {
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
app.get('/dersler/gecmis-yayin/:dersId', authMiddleware, async (req, res) => {
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

// 28. Dinamik Çalışma Raporu API (Günlük/Haftalık/Aylık)
app.get('/analiz/haftalik-rapor', authMiddleware, async (req, res) => {
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


// 29. Ders Hedeflerini ve Stratejilerini Kaydetme API
app.post('/planlayici/hedef-ekle', authMiddleware, async (req, res) => {
    const { ders_id, hedef_not, strateji_metni } = req.body;
    try {
        const yeniHedef = await pool.query(`
            INSERT INTO OgrenciHedefleri (ders_id, hedef_not, strateji_metni)
            VALUES ($1, $2, $3)
            ON CONFLICT (ders_id) 
            DO UPDATE SET hedef_not = $2, strateji_metni = $3 RETURNING *`,
            [ders_id, hedef_not, strateji_metni]
        );
        res.status(201).json(yeniHedef.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Sunucu hatası");
    }
});

// 30. Ders Stratejisini Kaydetme veya Güncelleme API'si
app.post('/planlayici/strateji-kaydet', authMiddleware, async (req, res) => {
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
app.get('/planlayici/strateji-getir/:dersId', authMiddleware, async (req, res) => {
    const { dersId } = req.params;
    try {
        const strateji = await pool.query(
            'SELECT * FROM OgrenciHedefleri WHERE ders_id = $1',
            [dersId]
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
// 32. Rehber (Kişiler) Listesi - Sohbet sekmesi için
app.get('/kullanicilar/rehber', authMiddleware, async (req, res) => {
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
app.post('/sohbet/ozel/gonder', authMiddleware, async (req, res) => {
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
app.get('/sohbet/ozel/gecmis/:karsi_id', authMiddleware, async (req, res) => {
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
app.get('/sohbet/ozel/aktif-liste', authMiddleware, async (req, res) => {
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

// 35. AKILLI KOÇ (YAPAY ZEKA) BAĞLANTISI [4]
app.post('/planlayici/akilli-koc', authMiddleware, async (req, res) => {
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
app.listen(PORT, '0.0.0.0', () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));
