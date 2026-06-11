// Applies schema.sql to the database in DATABASE_URL.
// Usage: npm run migrate
const fs = require('fs');
const path = require('path');
const pool = require('../db');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Schema applied successfully');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
