require('dotenv').config();

const app = require('./app');
const { testConnection } = require('./config/db');

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`Smart Placement Management System API listening on port ${PORT}`);
  await testConnection();
});
