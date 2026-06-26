const express = require('express');
const router = express.Router();
const pool = require('../src/db');  // veritabnına bağlanan poolu dosyaya çekiyoruz
const bcrypt = require('bcrypt');  // şifre gizleme
const jwt = require('jsonwebtoken'); // kullanıcı giriş yaptığında token alması için
const authMiddleware = require('../middleware/authMiddleware'); // JWT Middleware'i
const nodemailer = require('nodemailer');  // otomatik mail
require('dotenv').config();

const SECRET_KEY = process.env.JWT_SECRET || 'gizli-anahtarim';  //// Gizli anahtarı .env'den çekiyoruz

// 1. KAYIT OL 
router.post('/kayit', async (req, res) => {
    try {
        const { ad_soyad, email, sifre, rol } = req.body;
        if (!['ogrenci', 'ogretmen'].includes(rol)) return res.status(400).json({ hata: "Geçersiz rol." });

        const userCheck = await pool.query('SELECT * FROM Kullanicilar WHERE email = $1', [email]);
        //pool.query ile veritabanına bir komut/soru gönderiyoruz.
        //SELECT * FROM Kullanicilar: Veritabanına Kullanicilar isimli tablodaki (isim, şifre, rol vb.) bana getir email 1 olanı
        //e-postayı bir paket [email] halinde gönderiyoruz ve sistem onu güvenli bir şekilde $1 yazan yere yerleştiriyor.
        // await veritabanından yanıt gelene kadar bekle
        //const userCheck veritabnaında gelen cevabı değişkene koyduk 
        if (userCheck.rows.length > 0) return res.status(400).json({ hata: 'E-posta kayıtlı.' });
        // bu emailden aynı satırda 1 den başka var mı varsa hata mesajı  res.status(400) ile de kırmızı uyarı çıkması için 
        const hashedPassword = await bcrypt.hash(sifre, 10); // şifreyi karışık hale getirip hashed değişkenine atıyoruz
        const newUser = await pool.query(
            'INSERT INTO Kullanicilar (ad_soyad, email, sifre, rol) VALUES ($1, $2, $3, $4) RETURNING kullanici_id, ad_soyad, email, rol',
            [ad_soyad, email, hashedPassword, rol]  // burda d o karışık şifreyi kaydettik                                                                                              
        );
        res.status(201).json({ mesaj: 'Kayıt başarılı.', kullanici: newUser.rows[0] });
    } catch (err) { res.status(500).json({ hata: "Sunucu Hatası", detay: err.message }); }
});

// 2. GİRİŞ YAP 
router.post('/giris', async (req, res) => {
    try {
        const { email, sifre } = req.body;  // kullanıcı gelio biz de verileri alıyoruz 
        const user = await pool.query('SELECT * FROM Kullanicilar WHERE email = $1', [email]); // bakıyoruz veritabanınaa  bu e-posta adresiyle kayıtlı kişiyi getir
        if (user.rows.length === 0) return res.status(401).json({ hata: 'Kullanıcı bulunamadı.' }); // sonuş 0 ise veritabnında yok

        const validPassword = await bcrypt.compare(sifre, user.rows[0].sifre);
        //Sistem, kullanıcının o an yazdığı normal şifreyi ("123456") alır. Onu da aynı matematiksel işlemden geçirip kıyar
        //Sonra elindeki yeni kıyma ile veritabanındaki eski kıyma birbirinin birebir aynısı mı diye karşılaştırır (compare)
        if (!validPassword) return res.status(401).json({ hata: 'Hatalı giriş' });
        // kırdığımız şifreyi valide atamıştık. değişken ile eşleşmezse hata

        const token = jwt.sign(
            // Öğrenci bir kere giriş yaptıktan sonra o bileti (Token) sonsuza kadar geçerli sayamayız
            // Bankacılık uygulamalarının bir süre sonra dışarı atmasıyla aynı mantıktır.
            // belli bir süre sonra (24 saat) dışarı atar 
            { id: user.rows[0].kullanici_id, rol: user.rows[0].rol, ad_soyad: user.rows[0].ad_soyad },
            // veritabnaında al ve ıd olarak rol olarak kaydet demek            
            SECRET_KEY, { expiresIn: '24h' }
        );        // jwt.sign = token yani kişinin kimlik kartı gibi orda sadece normal bilgiler var şifre vb bilgiler olmaz
        res.json({ mesaj: 'Giriş Başarılı!', token, user: { rol: user.rows[0].rol, ad_soyad: user.rows[0].ad_soyad } });
        // fluttter da ekstra kod yazmamk için. burası uygulama girşi olduğunda dirkt hoşgeldin gulden fln der
        // Ürettiğimiz bu bileti (token), başarılı mesajıyla birlikte Flutter'a  geri göndeririz.
    } catch (err) { res.status(500).json({ hata: err.message }); }
});
// 16. ŞİFREMİ UNUTTUM 
router.post('/forgot-password', async (req, res) => {

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
router.post('/sifre-sifirla', async (req, res) => {
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

module.exports = router;
