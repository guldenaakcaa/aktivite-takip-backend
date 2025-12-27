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
        if (userCheck.rows.length > 0) return res.status(400).json({ hata: 'E-posta kayıtlı.' });

        const hashed = await bcrypt.hash(sifre, 10);
        const newUser = await pool.query(
            'INSERT INTO Kullanicilar (ad_soyad, email, sifre, rol) VALUES ($1, $2, $3, $4) RETURNING *',
            [ad_soyad, email, hashed, rol]
        );
        res.status(201).json({ mesaj: 'Kayıt başarılı.', kullanici: newUser.rows[0] });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

// 2. GİRİŞ YAP (LOGIN)
router.post('/giris', async (req, res) => {
    try {
        const { email, sifre } = req.body;
        const user = await pool.query('SELECT * FROM Kullanicilar WHERE email = $1', [email]);
        if (user.rows.length === 0) return res.status(401).json({ hata: 'Kullanıcı bulunamadı.' });

        const valid = await bcrypt.compare(sifre, user.rows[0].sifre);
        if (!valid) return res.status(401).json({ hata: 'Şifre yanlış.' });

        const token = jwt.sign({ id: user.rows[0].kullanici_id, rol: user.rows[0].rol, ad_soyad: user.rows[0].ad_soyad }, SECRET_KEY);
        res.json({ mesaj: 'Giriş başarılı.', token });
    } catch (err) { res.status(500).json({ hata: err.message }); }
});

module.exports = router;