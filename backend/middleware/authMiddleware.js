const jwt = require('jsonwebtoken'); // tokenları kontrol edecek kütüphaneyi çağırdık
require('dotenv').config(); // gizli .env dosyasını açtık 

const SECRET_KEY = process.env.JWT_SECRET;
//Bu mühür çok gizlidir ve .env kasasından çekilir. Eğer dışarıdan gelen bilette bu
//mührün aynısı yoksa bilet sahtedir. Şifreyi doğrudan koda yazmayıp .env'den
//çekmemin sebebi, kodları internete (örneğin GitHub'a) yüklediğimizde kötü niyetli
//kişilerin sistemimizin anahtarlarını çalmasını engellemektir.

const authMiddleware = (req, res, next) => { // req = gelen istek 
                                           // res = bizim Vereceğimiz Cevap
                                           //next = bir sonraki aşamaya geçiş izni
    const token = req.header('Authorization')?.replace('Bearer ', '');
    //Flutter'dan gelen isteğin header kısmına bakıyoruz. Kullanıcı giriş yaptığında
    //Flutter bu başlığa "Authorization: Bearer ds89f7s..." gibi bir bilet koyar.
    //replace('Bearer ', '') kısmı, bileti okumadan önce başındaki "Bearer " (taşıyıcı)
    // kelimesini silip sadece şifreli bileti (ds89f7s...) elimizde bırakmak içindir.

    if (!token) { // bilet yoksa hata ekranı 
        return res.status(401).json({ hata: 'Erişim reddedildi. Token eksik.' });
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);  //jwt, dışarıdan gelen bileti alır ve bizim 
        // gizli SECRET_KEY mührümüzle basılıp basılmadığını kontrol eder.
        // decoded = bilet doğruysa yazıları okur(id, vb)
        req.user = decoded; //işlem yapan kım onu öğreniriz
        next();
    } catch (ex) {
        res.status(400).json({ hata: 'Geçersiz token.' });
    }
};

module.exports = authMiddleware;  // diğer yerlerde kullanmak için dışarıya açıyoruz