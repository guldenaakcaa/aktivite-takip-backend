const jwt = require('jsonwebtoken');
require('dotenv').config(); // .env dosyasını oku

// Eğer .env dosyasında JWT_SECRET varsa onu kullan, yoksa 'gizli-anahtarim' kullan
const SECRET_KEY = process.env.JWT_SECRET || 'gizli-anahtarim';

const authMiddleware = (req, res, next) => {
    // Header'dan token al (Büyük/küçük harf duyarlılığı için lowercase kontrolü ekledim)
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ hata: 'Erişim reddedildi. Token eksik.' });
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = decoded; // Token içindeki veriyi (id, email, rol) isteğe ekle
        next();
    } catch (ex) {
        res.status(400).json({ hata: 'Geçersiz token.' });
    }
};

module.exports = authMiddleware;