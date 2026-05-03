const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/authMiddleware'); // JWT Middleware'i

const SECRET_KEY = 'gizli-anahtarim'; // index.js'ten alıyoruz

// 1. KAYIT OL (REGISTER)
router.post('/kayit', async (req, res) => {
    try {
        const { ad_soyad, email, sifre, rol } = req.body;
        const userCheck = await pool.query('SELECT * FROM Kullanicilar WHERE email = $1', [email]); 
//pool.query ile veritabanına bir komut/soru gönderiyoruz.
//SELECT * FROM Kullanicilar: Veritabanına Kullanicilar isimli tablodaki (isim, şifre, rol vb.) bana getir email 1 olanı
//e-postayı bir paket [email] halinde gönderiyoruz ve sistem onu güvenli bir şekilde $1 yazan yere yerleştiriyor.
// await veritabanından yanıt gelene kadar bekle
//const userCheck veritabnaında gelen cevabı değişkene koyduk 
        if (userCheck.rows.length > 0) return res.status(400).json({ hata: 'E-posta kayıtlı.' });
       // bu emailden aynı satırda 1 den başka var mı varsa hata mesajı  res.status(400) ile de kırmızı uyarı çıkması için 
        const hashed = await bcrypt.hash(sifre, 10); // şifreyi karışık hale getirip hashed değişkenine atıyoruz
        const newUser = await pool.query(
            'INSERT INTO Kullanicilar (ad_soyad, email, sifre, rol) VALUES ($1, $2, $3, $4) RETURNING *',      
            [ad_soyad, email, hashed, rol]  // burda d o karışık şifreyi kaydettik                                                                                              
        );
        res.status(201).json({ mesaj: 'Kayıt başarılı.', kullanici: newUser.rows[0] });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

// 2. GİRİŞ YAP (LOGIN)
router.post('/giris', async (req, res) => {
    try {
        const { email, sifre } = req.body;  // kullanıcı gelio biz de verileri alıyoruz 
        const user = await pool.query('SELECT * FROM Kullanicilar WHERE email = $1', [email]); // bakıyoruz veritabanınaa  bu e-posta adresiyle kayıtlı kişiyi getir
        if (user.rows.length === 0) return res.status(401).json({ hata: 'Kullanıcı bulunamadı.' }); // sonuş 0 ise veritabnında yok

        const valid = await bcrypt.compare(sifre, user.rows[0].sifre);
 //Sistem, kullanıcının o an yazdığı normal şifreyi ("123456") alır. Onu da aynı matematiksel işlemden geçirip kıyar
 //Sonra elindeki yeni kıyma ile veritabanındaki eski kıyma birbirinin birebir aynısı mı diye karşılaştırır (compare)
        if (!valid) return res.status(401).json({ hata: 'Şifre yanlış.' });
        // kırdığımız şifreyi valide atamıştık. değişken ile eşleşmezse hata

        const token = jwt.sign({ id: user.rows[0].kullanici_id, rol: user.rows[0].rol, ad_soyad: user.rows[0].ad_soyad }, SECRET_KEY);
        // jwt.sign = token yani kişinin kimlik kartı gibi orda sadece normal bilgiler var şifre vb bilgiler olmaz
        res.json({ mesaj: 'Giriş başarılı.', token });
        //Ürettiğimiz bu bileti (token), başarılı mesajıyla birlikte Flutter'a  geri göndeririz.
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

module.exports = router;