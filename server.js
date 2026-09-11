require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  user: process.env.PGUSER || process.env.USER || 'postgres',
  password: process.env.PGPASSWORD || '',
  database: process.env.PGDATABASE || 'postgres',
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
});

app.post('/query', async (req, res) => {
  const { sql } = req.body;
  if (!sql) return res.status(400).json({ error: 'Missing sql in request body' });

  try {
    const result = await pool.query(sql);
    const fields = result.fields ? result.fields.map(f => f.name) : [];
    res.json({ rows: result.rows, fields, rowCount: result.rowCount, command: result.command });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/schema', async (_, res) => {
  try {
    const result = await pool.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_name, ordinal_position
    `);
    const schema = {};
    result.rows.forEach(r => {
      if (!schema[r.table_name]) schema[r.table_name] = [];
      schema[r.table_name].push(r.column_name);
    });
    res.json(schema);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (_, res) => res.send('ok'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));
