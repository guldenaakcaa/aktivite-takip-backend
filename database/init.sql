DROP TABLE IF EXISTS kullanicilar;

CREATE TABLE kullanicilar (
    id SERIAL PRIMARY KEY,
    ad VARCHAR(50) NOT NULL,
    soyad VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    sifre VARCHAR(255) NOT NULL,
    rol VARCHAR(20) NOT NULL DEFAULT 'ogrenci',
    kayit_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO kullanicilar (ad, soyad, email, sifre, rol) 
VALUES ('Test', 'Ogrenci', 'test@ornek.com', 'sifre123', 'ogrenci');