const express = require('express');
const http = require('http');
const path = require('path');
const reload = require('reload');
const bodyParser = require('body-parser');
const logger = require('morgan');
const db = require('./db');
const fs = require('fs');

const app = express();

app.set('port', process.env.PORT || 3033);
app.use(logger('dev'));
app.use(bodyParser.json()); // 解析json、multi-part（文件）、url-encoded

app.use('/public', express.static('public'));
app.use('/pages', express.static('pages'));

// 文件下载API(依据文件、底稿)
app.get('/api/download-file', (req, res) => {
  const { filename } = req.query;
  const filePath = path.join(__dirname, 'public', filename);

  fs.stat(filePath, (err, stats) => {
    if (err) {
      console.error('File not found:', err);
      return res.status(404).send('File not found');
    }

    const fileExtension = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';

    if (fileExtension === '.pdf') {
      contentType = 'application/pdf';
    } else if (fileExtension === '.xlsx') {
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(path.basename(filename))}`); // 可读中文文件名

    fs.createReadStream(filePath).pipe(res).on('error', (err) => {
      console.error('Error downloading file:', err);
      res.status(500).send('Error downloading file');
    });
  });
});

async function fetchData(category) { // 输出表数据库数据导入（用于输出表下载）
  return new Promise((resolve, reject) => {
    const query = "SELECT serial_number, project_name, unit, value, unit_price, cost FROM land_acquisition_cost_estimate WHERE category = ?";
    db.query(query, [category], (err, results) => {
      if (err) {
        return reject(err);
      }
      resolve(results);
    });
  });
}

// 输出表csv导出
app.post('/api/export-csv', async (req, res) => {
  try {
    console.log('Export CSV API called via POST');
    const categories = [1, 2, 3, 4, 5];
    const sheetNames = ['土地补偿成本', '拆迁补偿成本', '人员（企业）补偿成本', '其他不可预见费用', '总成本'];

    let csvData = '';

    for (let i = 0; i < categories.length; i++) {
      console.log(`Fetching data for category ${categories[i]}`);
      const data = await fetchData(categories[i]);
      console.log(`Data for category ${categories[i]}:`, data);

      // 添加标题行
      if (csvData !== '') {
        csvData += '\n'; // 添加空行分隔不同的类别数据
      }
      csvData += `${sheetNames[i]}\n`;
      csvData += '序号,项目名称,单位,数值,单价（万元）,成本（万元）\n';

      // 将数据添加到CSV中
      data.forEach(item => {
        csvData += `${item.serial_number},${item.project_name},${item.unit},${item.value},${item.unit_price},${item.cost}\n`;
      });
    }

    const filePath = path.join(__dirname, 'public', '【土地收储整备】土地收储成本-输出表.csv');
    fs.writeFileSync(filePath, csvData);
    console.log('CSV file created at:', filePath);

    res.download(filePath, 'Land_acquisition_and_storage_output.csv', (err) => {
      if (err) {
        console.error('Error downloading file:', err);
        res.status(500).json({ error: 'Error downloading file' });
      } else {
        console.log('File download initiated');
      }
    });
  } catch (error) {
    console.error('Error in export-csv API:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

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

// 土地收储成本-输入表1（土地补偿指标）导入 需要判断计算方式
app.get('/api/land-cost-input', (req, res) => {
  const category = req.query.category;
  const computing_method = req.query.computing_method;
  const query = "SELECT id, serial_number, indicator, value, remark, basis, url FROM land_acquisition_cost_input WHERE category = ? AND computing_method in (1,?,3)";
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
  const query = "SELECT id, serial_number, indicator, value, remark, basis, url FROM land_acquisition_cost_input WHERE category = ?";
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

// 编辑按钮编辑取值(暂时废弃)
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
    const query = "UPDATE land_acquisition_cost_input SET value = ? WHERE serial_number LIKE ? AND category = ?";
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

// 使用内嵌式输入框编辑取值
app.post('/api/bulk-update-land-input', (req, res) => {
  const rowDiff = req.body.rowsDiff || [];
  const ids = req.body.ids ? req.body.ids.split(',') : [];
  const category = req.body.category;
  const computing_method = req.body.computing_method;

  console.log("Received rowDiff:", rowDiff);
  console.log("Category:", category);
  console.log("Computing Method:", computing_method);
  console.log("IDs:", ids);

  if (!Array.isArray(rowDiff) || rowDiff.length === 0 || ids.length === 0) {
    return res.status(400).send('Invalid data format');
  }

  const promises = rowDiff.map((diff, index) => {
    const id = ids[index];
    const query = "UPDATE land_acquisition_cost_input SET value = ? WHERE ID = ? AND category = ?";
    console.log("Executing query:", query, [diff.value, id, category]);
    return new Promise((resolve, reject) => {
      db.query(query, [diff.value, id, category], (err, result) => {
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
        queries.push(`
          SET @total_area = (SELECT SUM(value) FROM land_acquisition_cost_input WHERE category = 1 AND serial_number LIKE '1.%');
        `);
        queries.push(`
        SET @avg_compensation = (SELECT AVG(value) FROM land_acquisition_cost_input WHERE category = 1 AND serial_number LIKE '2.%');
        `);
        queries.push(`
          UPDATE land_acquisition_cost_input SET value = @total_area WHERE indicator = '总地块面积（亩）';
        `);
        queries.push(`
          UPDATE land_acquisition_cost_input SET value = @avg_compensation WHERE indicator = '平均综合征地补偿标准（万元/亩）';
        `);
        queries.push(`
          UPDATE land_acquisition_cost_estimate
          SET cost = (
            (SELECT value FROM land_acquisition_cost_input WHERE category = 1 AND serial_number LIKE 1.1) *
            (SELECT value FROM land_acquisition_cost_input WHERE category = 1 AND serial_number LIKE 2.1) +
            (SELECT value FROM land_acquisition_cost_input WHERE category = 1 AND serial_number LIKE 1.2) *
            (SELECT value FROM land_acquisition_cost_input WHERE category = 1 AND serial_number LIKE 2.2) +
            (SELECT value FROM land_acquisition_cost_input WHERE category = 1 AND serial_number LIKE 1.3) *
            (SELECT value FROM land_acquisition_cost_input WHERE category = 1 AND serial_number LIKE 2.3) +
            (SELECT value FROM land_acquisition_cost_input WHERE category = 1 AND serial_number LIKE 1.4) *
            (SELECT value FROM land_acquisition_cost_input WHERE category = 1 AND serial_number LIKE 2.4)
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
            SET @unit_price = (SELECT unit_price FROM land_acquisition_cost_estimate WHERE project_name = '耕地占用税');
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

      queries.push(`
        SET @land_compensation = (SELECT SUM(cost) FROM land_acquisition_cost_estimate WHERE category = 1);
      `);

      queries.push(`
      UPDATE land_acquisition_cost_estimate
      SET cost = @land_compensation
      WHERE project_name = '土地补偿成本小计';
    `);
    }
    else if(category==2){
      queries.push(`
        SET @total_demolition = (SELECT SUM(value) FROM land_acquisition_cost_input WHERE category = 2 AND serial_number LIKE '1.%');
        `);
      queries.push(`
        UPDATE land_acquisition_cost_input SET value = @total_demolition WHERE indicator = '总拆迁面积（平方米）';
      `);
            
      const projects = [
        { name: '住宅拆迁成本', inputs: [16, 18] }, // 住宅面积（平方米）, 住宅拆迁成本（元/平方米）/10000
        { name: '非住宅拆迁成本', inputs: [17, 19] }, // 非住宅面积（平方米）, 非住宅拆迁成本（含设备、装修赔偿费等）（元/平方米）/10000
        { name: '拆迁清运费', inputs: [15, 20] }, // 总拆迁面积（平方米）, 拆迁清运费(元/平方米）/10000
        { name: '住宅拆迁评估费', inputs: [16, 22] }, // 住宅面积（平方米）, 住宅（元/平方米）/10000 (C29)
        { name: '非住宅拆迁评估费', inputs: [17, 23] }, // 非住宅面积（平方米）, 非住宅（元/平方米）/10000
      ];

      projects.forEach(project => {
        queries.push(`
          UPDATE land_acquisition_cost_estimate
          SET value = (SELECT value FROM land_acquisition_cost_input WHERE ID = '${project.inputs[0]}')
          WHERE project_name = '${project.name}';
        `);
        queries.push(`
          UPDATE land_acquisition_cost_estimate
          SET unit_price = (SELECT value/10000 FROM land_acquisition_cost_input WHERE ID = '${project.inputs[1]}')
          WHERE project_name = '${project.name}';
        `);
        
        queries.push(`
          UPDATE land_acquisition_cost_estimate
          SET cost = (SELECT value FROM land_acquisition_cost_input WHERE ID = '${project.inputs[0]}') *
          (SELECT value FROM land_acquisition_cost_input WHERE ID = '${project.inputs[1]}')/10000
          WHERE project_name = '${project.name}';
        `);
      }); 
     
      queries.push(`
        SET @demolition_compensation = (SELECT SUM(cost) FROM land_acquisition_cost_estimate WHERE category = 2);
        `);

      queries.push(`
      UPDATE land_acquisition_cost_estimate
      SET cost = @demolition_compensation
      WHERE project_name = '拆迁补偿成本小计';
    `);

      }

    else if(category==3){
      queries.push(`
        SET @rural_household_registration = (SELECT value FROM land_acquisition_cost_input WHERE category = 3 AND serial_number = 1);
        `); // 片区农村户口数（人）
      queries.push(`
        UPDATE land_acquisition_cost_input SET value = 0.5*@rural_household_registration WHERE category = 3 AND serial_number LIKE 1.1;
      `); // 劳动力人口数（人）(输入表)
      queries.push(`
        UPDATE land_acquisition_cost_input SET value = 0.2*@rural_household_registration WHERE category = 3 AND serial_number LIKE 1.2;
      `); // 超转人员数（人）(输入表)
            
      const projects = [
        { name: '劳动力安置补助费', inputs: [25,29] }, // 劳动力人口数（人）, 劳动力安置补助费（万元/人）
        { name: '超转人员安置补助费', inputs: [26,30] }, // 超转人员数（人）, 超转人员补助费（万元/人）
        { name: '一次性搬迁补助费用', inputs: [15,31] }, // 总拆迁面积（平方米）, 一次性搬迁补助费标准（元/平方米）/10000
        { name: '二次搬迁补助费用', inputs: [34,32] }, // 回迁安置面积, 二次搬迁补助费（元/平方米）/10000
        { name: '提前搬迁奖励费', inputs: [27,33] }, // 片区总户数（户）, 提前搬家奖励费（元/户）/10000
        { name: '停业停产补助费', inputs: [17,38] }, // 非住宅面积（平方米）, 停业停产补助费（元/平方米）/10000
        { name: '住宅临时安置周转费', inputs: [16,40] }, // 住宅面积（平方米）, 住宅（元/平方米）/10000 (C51)
        { name: '非住宅临时安置周转费', inputs: [17,41] }, // 非住宅面积（平方米）, 非住宅（元/平方米）/10000 (C52)
        { name: '回迁安置', inputs: [34,36] }, // 回迁安置面积, 回迁安置补偿单价（元/平方米）/10000
        { name: '货币补偿', inputs: [35,37] }, // 货币安置面积, 货币安置补偿单价（元/平方米）/10000
        { name: '安置房建设评估费', inputs: [34,42] } // 回迁安置面积, 安置房建设评估费单价（元/平方米）/10000
      ];

      projects.forEach(project => {
        queries.push(`
          UPDATE land_acquisition_cost_estimate
          SET value = (SELECT value FROM land_acquisition_cost_input WHERE ID = '${project.inputs[0]}')
          WHERE project_name = '${project.name}';
        `);

        if(project.name!='劳动力安置补助费'||project.name!='超转人员安置补助费'){
          queries.push(`
          UPDATE land_acquisition_cost_estimate
          SET unit_price = (SELECT value/10000 FROM land_acquisition_cost_input WHERE ID = '${project.inputs[1]}')
          WHERE project_name = '${project.name}';
        `);
        
        queries.push(`
          UPDATE land_acquisition_cost_estimate
          SET cost = (SELECT value FROM land_acquisition_cost_input WHERE ID = '${project.inputs[0]}') *
          (SELECT value/10000 FROM land_acquisition_cost_input WHERE ID = '${project.inputs[1]}')
          WHERE project_name = '${project.name}';
        `);
        } 
        
        else{
          queries.push(`
          UPDATE land_acquisition_cost_estimate
          SET unit_price = (SELECT value FROM land_acquisition_cost_input WHERE ID = '${project.inputs[1]}')
          WHERE project_name = '${project.name}';
        `);
        
        queries.push(`
          UPDATE land_acquisition_cost_estimate
          SET cost = (SELECT value FROM land_acquisition_cost_input WHERE ID = '${project.inputs[0]}') *
          (SELECT value FROM land_acquisition_cost_input WHERE ID = '${project.inputs[1]}')
          WHERE project_name = '${project.name}';
        `);
        }
        
      });

      // 安置补助费（输出表）成本更新
      queries.push(`
        SET @resettlement_subsidy = (SELECT SUM(cost) FROM land_acquisition_cost_estimate WHERE category = 3 AND serial_number LIKE '1.%');
        `);
      queries.push(`
        UPDATE land_acquisition_cost_estimate SET cost = @resettlement_subsidy WHERE project_name = '安置补助费';
      `);
      // 临时安置周转费(输出表)成本更新
      queries.push(`
        SET @temporary_resettlement = (SELECT SUM(cost) FROM land_acquisition_cost_estimate WHERE category = 3 AND serial_number LIKE '6.%');
        `);
      queries.push(`
        UPDATE land_acquisition_cost_estimate SET cost = @temporary_resettlement WHERE project_name = '临时安置周转费';
      `); 
      // 住宅拆迁安置费（输出表）成本更新
      queries.push(`
        SET @housing_demolition_and_resettlement = (SELECT SUM(cost) FROM land_acquisition_cost_estimate WHERE category = 3 AND serial_number LIKE '7.%');
        `);
      queries.push(`
        UPDATE land_acquisition_cost_estimate SET cost = @housing_demolition_and_resettlement WHERE project_name = '住宅拆迁安置费';
      `);
     
      queries.push(`
        SET @person_compensation = (SELECT SUM(cost) FROM land_acquisition_cost_estimate WHERE category = 3);
        `);

      queries.push(`
      UPDATE land_acquisition_cost_estimate
      SET cost = @person_compensation
      WHERE project_name = '人员（企业）补偿成本小计';
    `);

    }

    else if(category==4){
      queries.push(`
        UPDATE land_acquisition_cost_estimate
        SET value = (SELECT value FROM land_acquisition_cost_input WHERE indicator = '不可预见费用占比（%）')
        WHERE project_name = '其他不可预见费用';
      `);

      queries.push(`
        SET @unforseen_expenses_unitprice = (SELECT SUM(cost) FROM land_acquisition_cost_estimate WHERE project_name in('土地补偿成本小计','拆迁补偿成本小计','人员（企业）补偿成本小计'));
        `);

      queries.push(`
        UPDATE land_acquisition_cost_estimate
        SET unit_price = @unforseen_expenses_unitprice
        WHERE project_name = '其他不可预见费用';
    ` ); 
   
      queries.push(`
        SET @unforseen_expenses = (SELECT value FROM land_acquisition_cost_estimate WHERE project_name = '其他不可预见费用')*
        (SELECT unit_price FROM land_acquisition_cost_estimate WHERE project_name = '其他不可预见费用')
        `);

      queries.push(`
      UPDATE land_acquisition_cost_estimate
      SET cost = @unforseen_expenses/100
      WHERE project_name = '其他不可预见费用';
` ); 
    }

    // 总成本计算
    queries.push(`
      SET @overall_cost = (SELECT SUM(cost) FROM land_acquisition_cost_estimate WHERE project_name in('土地补偿成本小计','拆迁补偿成本小计','人员（企业）补偿成本小计','其他不可预见费用'));
      `);

    queries.push(`
      UPDATE land_acquisition_cost_estimate
      SET cost = @overall_cost
      WHERE project_name = '总成本';`);
 
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
