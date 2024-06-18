const mysql = require('mysql');

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'user1',
  password: 'CDI2024',
  database: 'CDICalculations'
});

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    return;
  }
  console.log('Connected to the database');
});

module.exports = connection;
