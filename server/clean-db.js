import { pool } from './db.js';

export async function cleanDb() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('Cleaning all dummy assignments, runs, absences, and daily logs...');

    await client.query('DELETE FROM assignments');
    await client.query('DELETE FROM assignment_runs');
    await client.query('DELETE FROM absences');
    await client.query('DELETE FROM daily_logs');
    await client.query('DELETE FROM daily_requirements');
    await client.query('DELETE FROM employees');
    await client.query('ALTER TABLE employees ALTER COLUMN id RESTART WITH 1');

    // Ensure the 2 primary warehouses exist
    await client.query(`
      INSERT INTO warehouses (name, active)
      VALUES ('Old Warehouse', true), ('New Warehouse', true)
      ON CONFLICT (name) DO NOTHING
    `);

    await client.query('COMMIT');
    console.log('Database cleaned successfully. Ready for production use.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error cleaning database:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].endsWith('clean-db.js')) {
  cleanDb()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

