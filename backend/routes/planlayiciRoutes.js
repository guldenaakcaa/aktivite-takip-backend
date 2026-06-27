const express = require('express');
const router = express.Router();
const pool = require('../src/db');  // veritabnına bağlanan poolu dosyaya çekiyoruz
const authMiddleware = require('../middleware/authMiddleware');

const { exec } = require('child_process');
const path = require('path');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

//  25. SEANS DEĞERLENDİRMESİ (Zorluk ve Stres) ---
router.post('/degerlendirme/kaydet', authMiddleware, async (req, res) => {
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



// 29. Ders Hedeflerini ve Stratejilerini Kaydetme API
router.post('/hedef-ekle', authMiddleware, async (req, res) => {
    const { ders_id, hedef_not, strateji_metni } = req.body;
    const ogrenci_id = req.user.id;
    try {
        // Eğer o ders için daha önce strateji girilmişse UPDATE yapar, girilmemişse INSERT yapar (UPSERT mantığı)
        const yeniHedef = await pool.query(`
            INSERT INTO OgrenciHedefleri (ogrenci_id,ders_id, hedef_not, strateji_metni)
            VALUES ($1, $2, $3)
            ON CONFLICT (ders_id) 
            DO UPDATE SET hedef_not = $2, strateji_metni = $3 RETURNING *`,
            [ogrenci_id, ders_id, hedef_not, strateji_metni]
        );
        res.status(201).json(yeniHedef.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Sunucu hatası");
    }
});

// 30. Ders Stratejisini Kaydetme veya Güncelleme API'si
router.post('/strateji-kaydet', authMiddleware, async (req, res) => {
    const { ders_id, hedef_not, strateji_metni } = req.body;
    const ogrenci_id = req.user.id;
    try {
        // Eğer o ders için daha önce strateji girilmişse UPDATE yapar, girilmemişse INSERT yapar (UPSERT mantığı)

        const sonuc = await pool.query(`
            INSERT INTO OgrenciHedefleri (ogrenci_id, ders_id, hedef_not, strateji_metni)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (ogrenci_id, ders_id) 
            DO UPDATE SET hedef_not = $3, strateji_metni = $4 
            RETURNING *`,
            [ogrenci_id, ders_id, hedef_not, strateji_metni]
        );
        res.status(201).json({ mesaj: "Strateji başarıyla kaydedildi", veri: sonuc.rows[0] });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ hata: "Sunucu hatası oluştu." });
    }
});

// 31. Seçilen Dersin Kayıtlı Stratejisini Getirme API'si
router.get('/strateji-getir/:dersId', authMiddleware, async (req, res) => {
    const { dersId } = req.params;
    const ogrenci_id = req.user.id;
    try {
        const strateji = await pool.query(
            'SELECT * FROM OgrenciHedefleri WHERE ders_id = $1 AND ogrenci_id = $2',
            [dersId, ogrenci_id]
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

// 35. AKILLI KOÇ (YAPAY ZEKA) BAĞLANTISI [4]
router.post('/akilli-koc', authMiddleware, async (req, res) => {
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

router.post('/tavsiye-iste', authMiddleware, (req, res) => {
    const { calisma_saati, zorluk, stres, ders_adi } = req.body;

    const kullanici_id = req.user.id;
    const ders_id = 101;

    const pythonScriptYolu = path.join(__dirname, '..', 'tahmin.py');
    const pythonKomutu = `python3 "${pythonScriptYolu}" ${kullanici_id} ${ders_id} ${calisma_saati} ${zorluk} ${stres}`;

    // DİKKAT: Gemini'yi beklemek için callback fonksiyonunu 'async' yaptık
    exec(pythonKomutu, async (hata, stdout, stderr) => {
        if (hata) {
            console.error(`Python Hatası: ${hata.message}`);
            return res.status(500).json({ yapay_zeka_yaniti: "Badi şu an yoğun bir zihinsel karmaşa içinde, birazdan tekrar dene! 🤖" });
        }

        // ML modelimizden dönen saf matematiksel tahmini alıyoruz (0, 1 veya 2)
        const ml_tahmini = parseInt(stdout.trim());

        try {
            // Gemini modelini ayağa kaldırıyoruz
            const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

            // Promptumuzu hazırlıyoruz. ML sonucunu Gemini'ye gizli bir ipucu olarak veriyoruz!
            const prompt = `Sen samimi, motive edici ve empati yeteneği yüksek bir yapay zeka eğitim asistanısın. Adın 'Badi'. Senden tavsiye isteyen bir öğrenci var.
            
            Öğrencinin anlık durumu:
            - Çalıştığı Ders: ${ders_adi}
            - Çalışma Süresi: ${calisma_saati} saat
            - Zorluk Algısı (1-5): ${zorluk}
            - Stres Seviyesi (1-5): ${stres}
            
            Arka plandaki Yapay Zeka modelimizin performans analizi sonucu: ${ml_tahmini} 
            (Not: 0 = Zorlanıyor/Riskli, 1 = Ortalama/İyi, 2 = Mükemmel/Zirvede). 
            
            Görev: Öğrenciye hitaben, doğrudan sen ('Badi') konuşuyormuşsun gibi kısa, cesaretlendirici ve bu duruma (özellikle ML analiz sonucuna ve stres/zorluk seviyelerine) uygun doğal bir geri bildirim mesajı yaz. Robotik olma, çok uzun yazma (maksimum 3-4 cümle) ve emojiler kullan.`;

            // Gemini'den yanıtı alıyoruz
            const result = await geminiModel.generateContent(prompt);
            const badiTavsiyesi = result.response.text();

            // Doğal dille oluşturulmuş bu harika yanıtı Flutter'a yolluyoruz
            res.status(200).json({ yapay_zeka_yaniti: badiTavsiyesi });

        } catch (geminiHata) {
            console.error(`Gemini Hatası: ${geminiHata.message}`);
            res.status(500).json({ yapay_zeka_yaniti: "Badi şu an kelimeleri toparlayamıyor, ama senin yanındayım! 🪄" });
        }
    });
});

// HAFIZALI SOHBET İÇİN YENİ API ROTASI
router.post('/sohbet', authMiddleware, async (req, res) => {
    const { mesaj } = req.body;
    const ogrenci_id = req.user.id;

    try {
        // 1. Önce veritabanına gidip öğrencinin girdiği tüm stratejileri gizlice çekiyoruz
        const hedefler = await pool.query(
            'SELECT hedef_not, strateji_metni FROM OgrenciHedefleri WHERE ogrenci_id = $1 AND strateji_metni IS NOT NULL',
            [ogrenci_id]
        );

        // 2. Bu stratejileri Badi'nin okuyabileceği bir metne dönüştürüyoruz
        let ogrenciStratejisi = "";
        if (hedefler.rows.length > 0) {
            ogrenciStratejisi = "\nÖğrencinin Dersleri İçin Belirlediği Geçme Stratejileri ve Hedefleri Şunlar:\n";
            hedefler.rows.forEach((hedef, index) => {
                ogrenciStratejisi += `- Hedef Notu: ${hedef.hedef_not}, Stratejisi: "${hedef.strateji_metni}"\n`;
            });
        }

        // 3. Gemini 2.5 Flash modelini kullanıyoruz
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // 4. Badi'ye hem kim olduğunu hem de öğrencinin stratejilerini söylüyoruz!
        const prompt = `Sen samimi, motive edici ve öğrenci dostu bir yapay zeka eğitim asistanısın. Adın 'Badi'. Asla yapay zeka olduğunu belli etme, sanki yakın bir arkadaşmışsın gibi konuş. 
        ${ogrenciStratejisi}
        
        Öğrenci sana şu mesajı gönderdi: "${mesaj}"
        
        Görev: Öğrenciye yardımcı ol. Eğer sorusu veya durumu belirlediği hedeflerle/stratejilerle ilgiliyse, ona kendi cümlelerini hatırlatarak motive et (Örn: "Hani dönem başında ... yapacağım demiştin, şimdi tam zamanı!"). Çok uzun destanlar yazma, net ve anlaşılır ol. Emojiler kullan.`;

        const result = await geminiModel.generateContent(prompt);
        const badiCevabi = result.response.text();

        // Gemini'den gelen cevabı Flutter'a yolluyoruz
        res.status(200).json({ cevap: badiCevabi });

    } catch (hata) {
        console.error(`Sohbet Hatası: ${hata.message}`);
        res.status(500).json({ cevap: "Şu an hafızamı toparlayamıyorum, sorunu tam anlayamadım. Bir daha sorar mısın? 🤖" });
    }
});

// --- 36. YAPAY ZEKA OTONOM HAFTALIK PROGRAM OLUŞTURUCU ---
router.post('/program-olustur', authMiddleware, async (req, res) => {
    const { ders_id, zorluk, stres } = req.body;
    const ogrenci_id = req.user.id;

    try {
        // 1. Öğrencinin hedefini ve stratejisini bulalım (Badi için ekstra bağlam)
        const hedefSecimi = await pool.query(
            'SELECT hedef_not, strateji_metni FROM OgrenciHedefleri WHERE ogrenci_id = $1 AND ders_id = $2',
            [ogrenci_id, ders_id]
        );

        let ekstraBilgi = "";
        if (hedefSecimi.rows.length > 0) {
            ekstraBilgi = `Öğrencinin hedefi: ${hedefSecimi.rows[0].hedef_not}. Stratejisi: "${hedefSecimi.rows[0].strateji_metni}".`;
        }

        // 2. Gemini modelini çağır
        const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // DİKKAT: Yapay zekaya kesin bir JSON formatı dayatıyoruz.
        const prompt = `Sen empatik ve analitik bir eğitim asistanısın. Öğrenci belirlediği ders için haftalık bir çalışma programı istiyor.
        Öğrencinin bildirdiği zorluk seviyesi: ${zorluk}/5
        Öğrencinin bildirdiği stres seviyesi: ${stres}/5
        ${ekstraBilgi}
        
        Görev: Öğrencinin stres ve zorluk seviyesine uygun, haftada 3 günlük (örneğin Pazartesi, Çarşamba, Cuma) kısa çalışma periyotları oluştur. Stres 3'ten yüksekse görevleri çok daha hafif tut ve molaları vurgula.
        
        ÇIKTI KESİNLİKLE VE SADECE JSON FORMATINDA OLMALIDIR. Başka hiçbir açıklama, selamlama veya markdown (vurgu, kod bloğu vb.) ekleme. Sadece şu formatta bir dizi (array) döndür:
        [
          {
            "gun": "Pazartesi",
            "baslangic_saati": "14:00",
            "bitis_saati": "14:45",
            "gorev_tanimi": "Konu Tekrarı ve Özet Çıkarma"
          }
        ]`;

        const result = await geminiModel.generateContent(prompt);
        let aiCevap = result.response.text();

        // Güvenlik: Gemini cevapta kod bloğu markdown'u (```json) kullanırsa onu temizliyoruz
        aiCevap = aiCevap.replace(/```json/g, "").replace(/```/g, "").trim();

        // JSON metnini Javascript Objesine çevir
        const programDizisi = JSON.parse(aiCevap);

        // 3. Üretilen her bir günü veritabanındaki "haftalik_program" tablosuna kaydet
        for (let i = 0; i < programDizisi.length; i++) {
            const p = programDizisi[i];
            await pool.query(
                `INSERT INTO haftalik_program (ogrenci_id, ders_id, gun, baslangic_saati, bitis_saati, gorev_tanimi)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [ogrenci_id, ders_id, p.gun, p.baslangic_saati, p.bitis_saati, p.gorev_tanimi]
            );
        }

        res.status(200).json({ mesaj: "Program başarıyla oluşturuldu ve veritabanına işlendi.", program: programDizisi });

    } catch (err) {
        console.error("Program oluşturma hatası:", err.message);
        res.status(500).json({ hata: "Yapay zeka programı oluşturamadı, lütfen tekrar dene." });
    }
});

// --- 37. KAYITLI PROGRAMI GETİR (Flutter'da Göstermek İçin) ---
router.get('/program-getir', authMiddleware, async (req, res) => {
    const ogrenci_id = req.user.id;
    // Eğer belirli bir derse ait isteniyorsa (dersId varsa), yoksa tümünü getir.
    const ders_id = req.query.ders_id;

    try {
        let sql = `SELECT hp.*, d.ders_adi 
                   FROM haftalik_program hp 
                   LEFT JOIN dersler d ON hp.ders_id = d.ders_id 
                   WHERE hp.ogrenci_id = $1`;
        let params = [ogrenci_id];

        if (ders_id && ders_id !== '0') {
            sql += ` AND hp.ders_id = $2`;
            params.push(ders_id);
        }

        // Programı eklenme sırasına veya günlere göre sırala
        sql += ` ORDER BY hp.eklenme_tarihi ASC`;

        const program = await pool.query(sql, params);
        res.status(200).json(program.rows);
    } catch (err) {
        console.error("Program getirme hatası:", err.message);
        res.status(500).json({ hata: "Program getirilemedi." });
    }
});

// --- 38. MANUEL PROGRAM EKLEME ---
router.post('/program-manuel-ekle', authMiddleware, async (req, res) => {
    const { ders_id, gun, baslangic_saati, bitis_saati, gorev_tanimi } = req.body;
    const ogrenci_id = req.user.id;

    try {
        const sonuc = await pool.query(
            `INSERT INTO haftalik_program (ogrenci_id, ders_id, gun, baslangic_saati, bitis_saati, gorev_tanimi)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [ogrenci_id, ders_id, gun, baslangic_saati, bitis_saati, gorev_tanimi]
        );
        res.status(201).json({ mesaj: "Görev başarıyla eklendi.", gorev: sonuc.rows[0] });
    } catch (err) {
        console.error("Manuel program ekleme hatası:", err.message);
        res.status(500).json({ hata: "Görev eklenemedi." });
    }
});

// --- 39. GÖREV DURUMU GÜNCELLEME (Tamamlandı/Bekliyor) ---
router.put('/program-durum-guncelle/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const { durum } = req.body; // İstemciden 'tamamlandi' veya 'bekliyor' gelecek
    const ogrenci_id = req.user.id;

    try {
        await pool.query(
            `UPDATE haftalik_program SET durum = $1 WHERE program_id = $2 AND ogrenci_id = $3`,
            [durum, id, ogrenci_id]
        );
        res.status(200).json({ mesaj: "Görev durumu başarıyla güncellendi." });
    } catch (err) {
        console.error("Görev güncellenirken hata:", err.message);
        res.status(500).json({ hata: "Görev güncellenemedi." });
    }
});
module.exports = router;