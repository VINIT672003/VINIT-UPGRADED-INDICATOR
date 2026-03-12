require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./db');

async function run() {
  const email = process.env.OWNER_SEED_EMAIL;
  const password = process.env.OWNER_SEED_PASSWORD;
  const name = process.env.OWNER_SEED_NAME || 'Vinit Owner';
  const phone = process.env.OWNER_SEED_PHONE || null;

  if (!email || !password) {
    throw new Error('OWNER_SEED_EMAIL and OWNER_SEED_PASSWORD are required');
  }

  const existing = await pool.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
  if (existing.rows.length) {
    console.log('Owner already exists');
    process.exit(0);
  }

  const hashed = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (name, email, phone, password, role, is_verified)
     VALUES ($1, $2, $3, $4, 'owner', true)`,
    [name, email, phone, hashed]
  );

  console.log('Owner created successfully');
  process.exit(0);
}

run().catch((error) => {
  console.error('Owner seed failed:', error.message);
  process.exit(1);
});
