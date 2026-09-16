import { initDb, pool } from './db.js';

export async function seed() {
  await initDb();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if warehouses exist
    const { rows: whRows } = await client.query('SELECT COUNT(*) FROM warehouses');
    if (Number(whRows[0].count) > 0) {
      console.log('Database already seeded. Skipping.');
      await client.query('COMMIT');
      return;
    }

    console.log('Seeding demo warehouses and employees...');

    // 1. Insert 2 Warehouses: Old Warehouse and New Warehouse
    await client.query(
      "INSERT INTO warehouses (name, active) VALUES ('Old Warehouse', true), ('New Warehouse', true) ON CONFLICT (name) DO NOTHING"
    );

    await client.query('COMMIT');
    console.log('Production baseline initialization complete (2 warehouses ready).');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seeding failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seed()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal seed error:', err);
      process.exit(1);
    });
}
