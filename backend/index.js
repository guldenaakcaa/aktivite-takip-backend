const path = require('path');
const fs = require('fs');
const express = require('express');  // web sunucusu
const cors = require('cors');   // flutter ile sorunsuz konuşabilmesi için
require('dotenv').config();  //gizli bilgileri koda yazmayıp .env isimli gizli dosyadan okuma
// Dışarıdan biri ise gizli anahtarımızı bilmediği için bu metni asla tahmin edemeyecek.

const app = express();  // express çalışır adını app koydum
const PORT = process.env.PORT || 3000; // dinleyeceği port env de belirtilmişse onu yoksa 3000 kullanır

//// sorgularda hep await kullanılmasının sebebi bekletmek. await olmazsa hızlı bir şekilde (node.js kaynaklı) devam eder.
//  ama await ile cevap gelmesini bekle diyoruz

// bunu kullandığımız heryer için geçerli
// authMiddleware == elinde geçerli bir JWT (token) olmayan, 
// yani sisteme başarıyla giriş yapmamış hiç kimse bu kod bloğunu tetikleyemez

app.use(cors()); // dışardan gelen istekleri açar
app.use('/uploads', express.static('uploads'));
app.use(express.json()); //gelen veriyi jsona çevirir

// ROTALARI  İÇE AKTARMA 
const authRoutes = require('./routes/authRoutes');
const profilRoutes = require('./routes/profilRoutes');
const dersRoutes = require('./routes/dersRoutes');
const activityRoutes = require('./routes/activityRoutes');
const raporRoutes = require('./routes/raporRoutes');
const sohbetRoutes = require('./routes/sohbetRoutes');
const planlayiciRoutes = require('./routes/planlayiciRoutes');

// API YÖNLENDİRMELERİ 
// Gelen istekleri ilgili alt modüllere dağıtır
app.use('/api/auth', authRoutes);
app.use('/api/profil', profilRoutes);
app.use('/api/dersler', dersRoutes);
app.use('/api/aktivite', activityRoutes);
app.use('/api/rapor', raporRoutes);
app.use('/api/sohbet', sohbetRoutes);
app.use('/api/planlayici', planlayiciRoutes);


app.get('/', (req, res) => res.send('Backend Çalışıyor!'));  // test amaçlı

// --- SUNUCUYU BAŞLATMA ---
app.listen(PORT, '0.0.0.0', () => console.log(`Sunucu ${PORT} portunda başarıyla çalışıyor.`));
