const express = require('express');
const http = require('http');
const path = require('path');
const reload = require('reload');
const bodyParser = require('body-parser');
const logger = require('morgan');
const db = require('./db');

const app = express();

app.set('port', process.env.PORT || 3033);
app.use(logger('dev'));
app.use(bodyParser.json()); // 解析json、multi-part（文件）、url-encoded

app.use('/public', express.static('public'));
app.use('/pages', express.static('pages'));

// API路由
app.get('/api/land-costs', (req, res) => {
  const category = req.query.category; // 获取前端传递的category参数
  const query = "SELECT serial_number as 序号, project_name as 项目名称, unit as 单位, unit_price as `单价（万元）`, cost as `成本（万元）` FROM land_acquisition_cost_estimate WHERE category = ?";
  db.query(query, [category], (err, results) => {
    if (err) {
      console.error('Error fetching data:', err);
      res.status(500).send('Error fetching data');
      return;
    }
    res.status(200).json({
      status: 0,
      msg: '',
      data: {
        items: results
      }
    });
  });
});

app.get('/*', function (req, res) {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const server = http.createServer(app);

// Reload code here
reload(app)
  .then(function (reloadReturned) {
    // reloadReturned is documented in the returns API in the README

    // Reload started, start web server
    server.listen(app.get('port'), function () {
      console.log(
        'Web server listening on port http://localhost:' + app.get('port')
      );
    });
  })
  .catch(function (err) {
    console.error(
      'Reload could not start, could not start server/sample app',
      err
    );
  });
