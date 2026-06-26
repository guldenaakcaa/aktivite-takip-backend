# 1. Temel olarak Python yüklü bir sistem alıyoruz
FROM python:3.10-slim

# 2. Üzerine Node.js (ve npm) kuruyoruz
RUN apt-get update && apt-get install -y curl
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
RUN apt-get install -y nodejs

# 3. Çalışma klasörümüzü belirliyoruz
WORKDIR /app

# 4. Python kütüphanelerini kuruyoruz (joblib, scikit vb.)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 5. Node.js kütüphanelerini kuruyoruz (express, gemini vb.)
COPY package*.json ./
RUN npm install

# 6. Tüm dosyalarımızı (model, index.js, tahmin.py) kopyalıyoruz
COPY . .

# 7. Render'ın dinleyeceği portu açıyoruz
EXPOSE 3000

# 8. Uygulamayı başlatıyoruz!
CMD ["node", "index.js"]