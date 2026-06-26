import sys
import joblib
import numpy as np
import warnings

# Sklearn uyarılarını gizleyelim ki Node.js kafası karışmasın
warnings.filterwarnings("ignore")

def tahmin_yap():
    try:
        # Node.js'ten gelen verileri alıyoruz
        # sys.argv[1] = Kullanıcı_ID, sys.argv[2] = Ders_ID
        # sys.argv[3] = Calisma_Saati, sys.argv[4] = Zorluk, sys.argv[5] = Stres
        
        kullanici_id = float(sys.argv[1])
        ders_id = float(sys.argv[2])
        calisma_saati = float(sys.argv[3])
        zorluk = float(sys.argv[4])
        stres = float(sys.argv[5])

        # Modeli yüklüyoruz
        model = joblib.load('gb_model_son.pkl')

        # Modeli eğitirken X_train'de 5 sütun vardı, aynı sırayla veriyoruz:
        # ['Kullanıcı_ID', 'Ders_ID', 'Calisma_Saati', 'Zorluk', 'Stres']
        yeni_veri = np.array([[kullanici_id, ders_id, calisma_saati, zorluk, stres]])

        # Tahmini yapıyoruz
        sonuc = model.predict(yeni_veri)[0]

        # Sonucu ekrana yazdırıyoruz (SADECE RAKAM YAZDIRMALIYIZ Kİ NODE.JS OKUSUN)
        print(int(sonuc))

    except Exception as e:
        print(f"Hata: {str(e)}")

if __name__ == "__main__":
    tahmin_yap()