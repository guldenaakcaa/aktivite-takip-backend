const { Pool } = require('pg');

const pool = new Pool({   // yeni bağlantı havuzu 
  user: 'guldenakca',      
  host: 'localhost',
  database: 'aktivite_takip', 
  password: '',            
  port: 5432,
});

module.exports = pool;   // dışa aktarıyoruz

