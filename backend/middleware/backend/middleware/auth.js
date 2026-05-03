const jwt = require('jsonwebtoken');
require('dotenv').config();

const SECRET_KEY = 'gizli-anahtarim'; 
const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ hata: 'Erişim reddedildi. Token eksik.' });
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = decoded; 
        next();
    } catch (ex) {
        res.status(400).json({ hata: 'Geçersiz token.' });
    }
};

module.exports = authMiddleware;