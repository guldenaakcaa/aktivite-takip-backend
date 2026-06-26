const { Pool } = require('pg');
require('dotenv').config(); // Ortam değişkenlerini okuyabilmek için

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Supabase dış bağlantıları için zorunlu SSL ayarı
  }
});

module.exports = pool;