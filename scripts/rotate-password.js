// Rotates the Postgres password. Connects using the (old) DATABASE_URL and
// sets the password to the value of NEW_DB_PASSWORD. Letters/digits only.
//
//   $env:DATABASE_URL = '<current connection string>'
//   $env:NEW_DB_PASSWORD = '<new password>'
//   node scripts/rotate-password.js
//
// Afterwards update PGPASSWORD on the Railway Postgres service to match.
const pool = require('../db');

const pw = process.env.NEW_DB_PASSWORD;
if (!pw || pw.length < 16 || !/^[A-Za-z0-9]+$/.test(pw)) {
  console.error('Set NEW_DB_PASSWORD to 16+ characters, letters and digits only.');
  process.exit(1);
}

pool
  .query(`ALTER USER postgres WITH PASSWORD '${pw}'`)
  .then(() => {
    console.log('Password changed. Now update PGPASSWORD on the Railway Postgres service.');
    return pool.end();
  })
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
  });
