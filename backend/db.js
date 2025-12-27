const { Pool } = require('pg');

const pool = new Pool({
  user: 'guldenakca',       // Bilgisayarının kullanıcı adı
  host: 'localhost',
  database: 'aktivite_takip', // Veritabanı adın
  password: '',             // Postgres.app yerelde şifre istemez
  port: 5432,
});

module.exports = pool;