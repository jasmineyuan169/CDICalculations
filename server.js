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

// 土地收储成本-输出值表
app.get('/api/land-costs', (req, res) => {
  const category = req.query.category; // 获取前端传递的category参数
  const query = "SELECT serial_number, project_name, unit, value, unit_price, cost FROM land_acquisition_cost_estimate WHERE category = ?";
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

// 土地收储成本-输入表1（土地补偿指标）导入
app.get('/api/land-cost-input', (req, res) => {
  const category = req.query.category;
  const computing_method = req.query.computing_method;
  const query = "SELECT serial_number, indicator, value, remark, basis FROM land_acquisition_cost_input WHERE category = ? AND computing_method in (?,3)";
  db.query(query, [category, computing_method], (err, results) => {
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

// 土地收储成本-其他输入表（除输入表1）导入
app.get('/api/land-input', (req, res) => {
  const category = req.query.category;
  const query = "SELECT serial_number, indicator, value, remark, basis FROM land_acquisition_cost_input WHERE category = ?";
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

// 更新land_acquisition_cost_input表中的取值
app.post('/api/update-land-input', (req, res) => {
  const updates = req.body.items || []; // 确保updates是一个数组
  const category = req.body.category;
  const computing_method = req.body.computing_method;
  console.log("Received updates:", updates);
  console.log("Category:", category);
  console.log("Computing Method:", computing_method);

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).send('Invalid data format');
  }

  const promises = updates.map(item => {
    const query = "UPDATE land_acquisition_cost_input SET value = ? WHERE serial_number = ? AND category = ?";
    console.log("Executing query:", query, [item.value, item.serial_number, category]);
    return new Promise((resolve, reject) => {
      db.query(query, [item.value, item.serial_number, category], (err, result) => {
        if (err) {
          return reject(err);
        }
        resolve(result);
      });
    });
  });

  Promise.all(promises)
    .then(() => {
      // 计算并更新land_acquisition_cost_estimate表
      calculateAndUpdateEstimates(category, computing_method)
        .then(() => {
          res.status(200).json({ status: 0, msg: '更新成功' });
        })
        .catch(err => {
          console.error('Error updating estimates:', err);
          res.status(500).send('Error updating estimates');
        });
    })
    .catch(err => {
      console.error('Error updating input values:', err);
      res.status(500).send('Error updating input values');
    });
});

// 计算并更新land_acquisition_cost_estimate表
function calculateAndUpdateEstimates(category, computing_method) {
  return new Promise((resolve, reject) => {
    const queries = [];

    if (category == 1) { // 一、土地补偿成本
      // 根据computing_method选择不同的公式(土地补偿费的计算)
      if (computing_method == 1) { // 片区总地块面积 x 平均综合征地补偿标准
        queries.push(`
          UPDATE land_acquisition_cost_estimate
          SET cost = (
            SELECT value FROM land_acquisition_cost_input WHERE indicator = '总地块面积（亩）'
          ) * (
            SELECT value FROM land_acquisition_cost_input WHERE indicator = '平均综合征地补偿标准（万元/亩）'
          )
          WHERE project_name = '土地补偿费';
        `);
      } else if (computing_method == 2) { // 已知片区内各细分土地类型和补偿标准
        const serialNumbers = [1.1, 1.2, 1.3, 1.4];
        const valuesQuery = serialNumbers.map(num => `(SELECT value FROM land_acquisition_cost_input WHERE category = 1 AND serial_number = ${num})`).join(' + ');
        queries.push(`
          UPDATE land_acquisition_cost_input
          SET value = (${valuesQuery})
          WHERE indicator = '总地块面积（亩）';
        `);
        const avgQuery = serialNumbers.map(num => `(SELECT value FROM land_acquisition_cost_input WHERE category = 1 AND serial_number = ${num + 1})`).join(' + ');
        queries.push(`
          UPDATE land_acquisition_cost_input
          SET value = (${avgQuery}) / ${serialNumbers.length}
          WHERE indicator = '平均综合征地补偿标准（万元/亩）';
        `);
        queries.push(`
          UPDATE land_acquisition_cost_estimate
          SET cost = (
            (SELECT value FROM land_acquisition_cost_input WHERE category = 1 AND serial_number = 1.1) *
            (SELECT value FROM land_acquisition_cost_input WHERE category = 1 AND serial_number = 2.1) +
            (SELECT value FROM land_acquisition_cost_input WHERE category = 1 AND serial_number = 1.2) *
            (SELECT value FROM land_acquisition_cost_input WHERE category = 1 AND serial_number = 2.2) +
            (SELECT value FROM land_acquisition_cost_input WHERE category = 1 AND serial_number = 1.3) *
            (SELECT value FROM land_acquisition_cost_input WHERE category = 1 AND serial_number = 2.3) +
            (SELECT value FROM land_acquisition_cost_input WHERE category = 1 AND serial_number = 1.4) *
            (SELECT value FROM land_acquisition_cost_input WHERE category = 1 AND serial_number = 2.4)
          )
          WHERE project_name = '土地补偿费';
        `);
      }

      const projects = [
        { name: '土地补偿费', inputs: ['总地块面积（亩）', '平均综合征地补偿标准（万元/亩）'] },
        { name: '青苗补偿费', inputs: ['总地块面积（亩）', '青苗补偿标准（万元/亩）'] },
        { name: '土地附着物补偿费', inputs: ['总地块面积（亩）', '地上附着物补偿标准（万元/亩）'] },
        { name: '耕地开垦费', inputs: ['耕地面积（亩）', '耕地开垦费标准（万元/亩）'] },
        { name: '耕地占用税', inputs: ['耕地面积（亩）', '耕地占用税（元/平方米）'] },
      ];

      projects.forEach(project => {
        queries.push(`
          UPDATE land_acquisition_cost_estimate
          SET value = (SELECT value FROM land_acquisition_cost_input WHERE indicator = '${project.inputs[0]}')
          WHERE project_name = '${project.name}';
        `);
        queries.push(`
          UPDATE land_acquisition_cost_estimate
          SET unit_price = (SELECT value FROM land_acquisition_cost_input WHERE indicator = '${project.inputs[1]}')
          WHERE project_name = '${project.name}';
        `);
        if (project.name === '耕地占用税') {
          queries.push(`
            SELECT @unit_price := (SELECT unit_price FROM land_acquisition_cost_estimate WHERE project_name = '耕地占用税');
          `);
          queries.push(`
            UPDATE land_acquisition_cost_estimate
            SET cost = (SELECT value FROM land_acquisition_cost_input WHERE indicator = '${project.inputs[0]}') *
            @unit_price * 666.6666666667 / 10000
            WHERE project_name = '${project.name}';
          `);
        } else {
          queries.push(`
            UPDATE land_acquisition_cost_estimate
            SET cost = (SELECT value FROM land_acquisition_cost_input WHERE indicator = '${project.inputs[0]}') *
            (SELECT value FROM land_acquisition_cost_input WHERE indicator = '${project.inputs[1]}')
            WHERE project_name = '${project.name}';
          `);
        }
      });
    }

    console.log("Executing queries:", queries);

    const promises = queries.map(query => {
      return new Promise((resolve, reject) => {
        db.query(query, (err, result) => {
          if (err) {
            return reject(err);
          }
          resolve(result);
        });
      });
    });

    Promise.all(promises)
      .then(results => resolve(results))
      .catch(err => reject(err));
  });
}

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
