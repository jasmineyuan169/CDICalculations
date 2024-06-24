const mysql = require('mysql');

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'user1',
  password: 'CDI2024',
  database: 'CDICalculations'
});

// const connection = mysql.createConnection({
//   host: '100.100.100.5',
//   port: 6603,
//   user: 'CDIqys',
//   password: '6nI!xIGGC3kAdWQ6',
//   database: 'CDICalculations',
//   option: 3
// });

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    return;
  }
  console.log('Connected to the database');
});

module.exports = connection;
