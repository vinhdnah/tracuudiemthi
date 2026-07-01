const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const ExcelJS = require('exceljs');
const multer = require('multer');
const pdf = require('pdf-parse');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cấu hình multer để xử lý file upload lưu trong memory
const upload = multer({ storage: multer.memoryStorage() });

// Trạng thái tiến trình check điểm
let checkProgress = {
  isChecking: false,
  total: 0,
  current: 0,
  successCount: 0,
  failCount: 0,
  results: []
};

// Đọc cấu hình từ config.json
function getConfig() {
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      console.error('Lỗi đọc file config.json:', e);
    }
  }
  return { autocaptcha_key: '', students: [] };
}

// Lưu cấu hình vào config.json
function saveConfig(config) {
  const configPath = path.join(__dirname, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

// Hàm trì hoãn (sleep)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Chuẩn hóa tên môn học để gán điểm
const SUBJECT_MAP = {
  'Toán': 'Toán',
  'Ngữ văn': 'Ngữ văn',
  'Tiếng Anh': 'Ngoại ngữ',
  'Tiếng Trung': 'Ngoại ngữ',
  'Tiếng Pháp': 'Ngoại ngữ',
  'Ngoại ngữ': 'Ngoại ngữ',
  'Vật lí': 'Vật lí',
  'Vật lý': 'Vật lí',
  'Hóa học': 'Hóa học',
  'Sinh học': 'Sinh học',
  'Lịch sử': 'Lịch sử',
  'Địa lí': 'Địa lí',
  'Địa lý': 'Địa lí',
  'GDCD': 'GDCD'
};

// Hàm phân tích HTML trả về để trích xuất điểm thi
function parseExamResult(html) {
  const $ = cheerio.load(html);
  const text = $.text().replace(/\s+/g, ' ').trim();

  // Kiểm tra lỗi Captcha
  if (
    text.includes('Sai mã bảo vệ') ||
    text.includes('sai mã bảo vệ') ||
    text.includes('Sai ma bao ve') ||
    text.includes('Mã bảo vệ không đúng') || 
    text.includes('Mã bảo vệ không chính xác') || 
    text.includes('mã bảo vệ không') || 
    text.includes('captcha không đúng')
  ) {
    throw new Error('CAPTCHA_INCORRECT');
  }

  // Kiểm tra không tìm thấy kết quả
  if (
    text.includes('Không tìm thấy') || 
    text.includes('Không tìm thấy thí sinh') || 
    text.includes('không tìm thấy') || 
    text.includes('Không có kết quả') ||
    text.includes('Bạn hãy nhập vào')
  ) {
    return { error: 'Không tìm thấy số báo danh hoặc chưa có điểm' };
  }

  // Trích xuất họ tên nếu có
  let studentName = '';
  const nameMatch = text.match(/(?:Họ(?:và)?tên|Họ\s+tên|Thí\s+sinh|Tên)[:\s]+([^:|\n\d\-]+?)(?=\s+(?:Số\s+báo\s+danh|SBD|Điểm|$))/i);
  if (nameMatch) {
    studentName = nameMatch[1].trim();
  }

  const scores = {};
  const subjects = Object.keys(SUBJECT_MAP);
  
  // Phân tích theo regex dạng: Môn: Điểm
  subjects.forEach(sub => {
    const regex = new RegExp(`${sub}\\s*[:\\-]?\\s*([0-9]+[.,][0-9]+|[0-9]+)`, 'i');
    const match = text.match(regex);
    if (match) {
      const normalizedSubject = SUBJECT_MAP[sub];
      scores[normalizedSubject] = match[1].replace(',', '.');
    }
  });

  // Nếu không parse được điểm nào bằng regex, thử parse bảng tr/td
  if (Object.keys(scores).length === 0) {
    $('tr').each((i, row) => {
      const cols = $(row).find('td');
      if (cols.length >= 2) {
        const key = $(cols[0]).text().trim();
        const val = $(cols[1]).text().trim();
        for (let sub of subjects) {
          if (key.toLowerCase().includes(sub.toLowerCase())) {
            const numMatch = val.match(/([0-9]+[.,][0-9]+|[0-9]+)/);
            if (numMatch) {
              scores[SUBJECT_MAP[sub]] = numMatch[1].replace(',', '.');
            }
          }
        }
      }
    });
  }

  if (Object.keys(scores).length === 0) {
    return { error: 'Không phân tích được điểm thi', rawText: text.substring(0, 200) };
  }

  return { studentName, scores };
}

// Logic thực hiện check điểm cho 1 học sinh (có retry captcha tối đa 15 lần)
async function fetchScoreForStudent(sbd, apiKey, maxRetries = 15) {
  let attempts = 0;
  
  while (attempts < maxRetries) {
    attempts++;
    try {
      console.log(`[${sbd}] Lần thử ${attempts}: Đang tải Captcha...`);
      
      // 1. Tải ảnh Captcha và lấy session cookie
      const captchaResponse = await axios.get(`https://tracuudiem.langson.edu.vn/captcha.php?t=${Date.now()}`, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://tracuudiem.langson.edu.vn/'
        },
        timeout: 10000
      });

      // Lấy session cookie từ response headers
      const setCookie = captchaResponse.headers['set-cookie'];
      let phpSessionCookie = '';
      if (setCookie && setCookie.length > 0) {
        phpSessionCookie = setCookie[0].split(';')[0]; // "PHPSESSID=xxxx"
      }

      if (!phpSessionCookie) {
        throw new Error('Không nhận được Session Cookie từ server Lạng Sơn.');
      }

      // Chuyển ảnh captcha sang Base64 data URL
      const base64Captcha = Buffer.from(captchaResponse.data, 'binary').toString('base64');
      const captchaDataUrl = `data:image/png;base64,${base64Captcha}`;

      console.log(`[${sbd}] Đang giải Captcha qua autocaptcha.pro...`);
      // 2. Gửi sang API autocaptcha.pro
      const captchaSolveResponse = await axios.post('https://autocaptcha.pro/apiv3/process', {
        key: apiKey,
        type: 'imagetotext',
        img: captchaDataUrl
      }, { timeout: 15000 });

      const captchaData = captchaSolveResponse.data;
      if (!captchaData || !captchaData.success) {
        throw new Error(`Lỗi giải Captcha API: ${captchaData ? captchaData.message : 'Không phản hồi'}`);
      }

      // Captcha bắt buộc phải đổi thành CHỮ IN HOA
      const captchaText = captchaData.captcha.trim().toUpperCase();
      console.log(`[${sbd}] Giải Captcha thành công: ${captchaText}`);

      // 3. Gửi request POST tra cứu điểm, đính kèm Cookie thủ công
      const params = new URLSearchParams();
      params.append('search_text', sbd);
      params.append('captcha_text', captchaText);

      console.log(`[${sbd}] Đang gửi yêu cầu tra cứu...`);
      const searchResponse = await axios.post('https://tracuudiem.langson.edu.vn/tra_cuu_diem_tn_thpt.php', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': phpSessionCookie,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://tracuudiem.langson.edu.vn/'
        },
        timeout: 10000
      });

      // 4. Parse kết quả HTML
      const result = parseExamResult(searchResponse.data);
      
      return {
        sbd,
        status: result.error ? 'NOT_FOUND' : 'SUCCESS',
        name: result.studentName || '',
        scores: result.scores || {},
        error: result.error || null,
        attempts
      };

    } catch (err) {
      console.error(`[${sbd}] Lỗi lần thử ${attempts}: ${err.message}`);
      if (err.message === 'CAPTCHA_INCORRECT') {
        console.log(`[${sbd}] Captcha sai hoặc không khớp. Thử lại sau 1 giây...`);
        await sleep(1000);
      } else {
        console.log(`[${sbd}] Lỗi kết nối hoặc API. Thử lại sau 2 giây...`);
        await sleep(2000);
      }
    }
  }

  return {
    sbd,
    status: 'FAILED',
    name: '',
    scores: {},
    error: `Thất bại sau ${maxRetries} lần thử (Lỗi mạng hoặc lỗi Captcha liên tiếp)`,
    attempts
  };
}

// Bắt đầu check hàng loạt chạy background
async function runBatchCheck(students, apiKey) {
  checkProgress.isChecking = true;
  checkProgress.total = students.length;
  checkProgress.current = 0;
  checkProgress.successCount = 0;
  checkProgress.failCount = 0;
  checkProgress.results = students.map(s => ({
    sbd: s.sbd,
    name: s.name,
    status: 'PENDING',
    scores: {},
    error: null,
    attempts: 0
  }));

  for (let i = 0; i < students.length; i++) {
    if (!checkProgress.isChecking) break;

    const student = students[i];
    checkProgress.results[i].status = 'CHECKING';
    checkProgress.current = i + 1;

    try {
      const res = await fetchScoreForStudent(student.sbd, apiKey);
      
      checkProgress.results[i] = {
        ...checkProgress.results[i],
        status: res.status,
        name: res.name || student.name,
        scores: res.scores,
        error: res.error,
        attempts: res.attempts
      };

      if (res.status === 'SUCCESS') {
        checkProgress.successCount++;
      } else {
        checkProgress.failCount++;
      }
    } catch (e) {
      checkProgress.results[i].status = 'FAILED';
      checkProgress.results[i].error = e.message;
      checkProgress.failCount++;
    }

    await sleep(1500);
  }

  checkProgress.isChecking = false;
  console.log('--- ĐÃ HOÀN THÀNH TIẾN TRÌNH CHECK ĐIỂM HÀNG LOẠT ---');
}

// Logic bóc tách SBD và Họ tên từ file Excel (.xlsx, .xls)
async function parseExcelBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  
  let sbdColIndex = -1;
  let nameColIndex = -1;

  // Quét 15 dòng đầu tiên để dò tìm cột SBD và cột tên
  const maxRowsToScan = Math.min(worksheet.rowCount, 15);
  for (let i = 1; i <= maxRowsToScan; i++) {
    const row = worksheet.getRow(i);
    row.eachCell((cell, colNumber) => {
      const val = cell.text ? cell.text.trim() : '';
      if (!val) return;
      
      // Số báo danh thường là chuỗi 8 chữ số
      if (/^[0-9]{8}$/.test(val) && sbdColIndex === -1) {
        sbdColIndex = colNumber;
      }
      
      // Họ và tên thường chứa chữ tiếng Việt, không chứa số, độ dài từ 5-40 ký tự
      if (/^[a-zA-ZÀ-ỹ\s]{5,40}$/.test(val) && !/[0-9]/.test(val) && nameColIndex === -1 && colNumber !== sbdColIndex) {
        nameColIndex = colNumber;
      }
    });
  }

  // Dự phòng nếu không đoán được
  if (sbdColIndex === -1) sbdColIndex = 1;
  if (nameColIndex === -1) nameColIndex = 2;

  const students = [];
  worksheet.eachRow((row, rowNumber) => {
    const sbdVal = row.getCell(sbdColIndex).text ? row.getCell(sbdColIndex).text.trim() : '';
    const nameVal = row.getCell(nameColIndex).text ? row.getCell(nameColIndex).text.trim() : '';
    
    // Nếu dòng chứa SBD 8 chữ số hợp lệ thì nạp vào
    if (/^[0-9]{8}$/.test(sbdVal)) {
      const cleanName = nameVal.replace(/\s+/g, ' ').trim().toUpperCase();
      students.push({
        sbd: sbdVal,
        name: cleanName || `Học sinh ${sbdVal}`
      });
    }
  });

  return students;
}

// Logic bóc tách SBD và Họ tên từ file PDF
async function parsePdfBuffer(buffer) {
  const data = await pdf(buffer);
  const text = data.text;
  const lines = text.split('\n');
  const students = [];

  lines.forEach(line => {
    // Dò SBD 8 chữ số
    const sbdMatch = line.match(/\b([0-9]{8})\b/);
    if (sbdMatch) {
      const sbd = sbdMatch[1];
      
      // Tách bỏ SBD và dọn dẹp các ký tự thừa
      let remainingText = line.replace(sbd, '');
      remainingText = remainingText.replace(/^\s*\d+\s+/, ''); // bỏ STT ở đầu dòng nếu có
      remainingText = remainingText.replace(/\d{2}[/\-]\d{2}[/\-]\d{4}/g, ''); // bỏ ngày sinh
      
      // Regex lấy họ tên in hoa Tiếng Việt
      const nameMatch = remainingText.match(/([A-ZÀ-Ỹ]{3,}(?:\s+[A-ZÀ-Ỹ]{2,})+)/);
      let name = nameMatch ? nameMatch[1].trim() : '';

      if (!name) {
        // Dự phòng: Lấy các từ chữ không chứa số
        const cleanText = remainingText.replace(/[0-9]/g, '').replace(/\s+/g, ' ').trim();
        if (cleanText.length >= 3) {
          name = cleanText;
        }
      }

      students.push({
        sbd,
        name: name.toUpperCase() || `Học sinh ${sbd}`
      });
    }
  });

  return students;
}

// API: Upload file và nạp danh sách học sinh
app.post('/api/upload-list', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Vui lòng chọn file tải lên.' });
  }

  const fileName = req.file.originalname.toLowerCase();
  let students = [];

  try {
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      students = await parseExcelBuffer(req.file.buffer);
    } else if (fileName.endsWith('.pdf')) {
      students = await parsePdfBuffer(req.file.buffer);
    } else {
      return res.status(400).json({ success: false, message: 'Định dạng file không hỗ trợ. Vui lòng tải file Excel (.xlsx, .xls) hoặc PDF.' });
    }

    if (students.length === 0) {
      return res.status(400).json({ success: false, message: 'Không tìm thấy Số báo danh 8 chữ số hợp lệ nào trong file.' });
    }

    // Ghi đè vào file config.json
    const config = getConfig();
    config.students = students;
    saveConfig(config);

    res.json({
      success: true,
      message: `Đã nạp thành công ${students.length} học sinh từ file.`,
      students
    });

  } catch (error) {
    console.error('Lỗi đọc file:', error);
    res.status(500).json({ success: false, message: 'Lỗi xử lý file: ' + error.message });
  }
});

// API: Lấy cấu hình hiện tại
app.get('/api/config', (req, res) => {
  const config = getConfig();
  res.json({
    autocaptcha_key: config.autocaptcha_key,
    students_count: config.students.length,
    students: config.students
  });
});

// API: Lưu API Key mới
app.post('/api/config', (req, res) => {
  const { autocaptcha_key, students } = req.body;
  const config = getConfig();
  if (autocaptcha_key !== undefined) config.autocaptcha_key = autocaptcha_key;
  if (students !== undefined) config.students = students;
  saveConfig(config);
  res.json({ success: true, message: 'Đã lưu cấu hình!' });
});

// API: Khởi chạy check hàng loạt
app.post('/api/start-check', (req, res) => {
  if (checkProgress.isChecking) {
    return res.status(400).json({ success: false, message: 'Tiến trình check đang chạy, vui lòng đợi.' });
  }

  const config = getConfig();
  if (!config.autocaptcha_key) {
    return res.status(400).json({ success: false, message: 'Vui lòng cấu hình API Key Autocaptcha trước.' });
  }
  if (!config.students || config.students.length === 0) {
    return res.status(400).json({ success: false, message: 'Danh sách học sinh trống. Vui lòng upload file danh sách trước.' });
  }

  // Khởi động chạy background
  runBatchCheck(config.students, config.autocaptcha_key);
  res.json({ success: true, message: 'Đã khởi chạy tiến trình check điểm.' });
});

// API: Dừng check hàng loạt
app.post('/api/stop-check', (req, res) => {
  if (checkProgress.isChecking) {
    checkProgress.isChecking = false;
    res.json({ success: true, message: 'Đang dừng tiến trình...' });
  } else {
    res.json({ success: false, message: 'Không có tiến trình nào đang chạy.' });
  }
});

// API: Lấy trạng thái hiện tại
app.get('/api/status', (req, res) => {
  res.json(checkProgress);
});

// API: Reset trạng thái kết quả
app.post('/api/reset-status', (req, res) => {
  if (checkProgress.isChecking) {
    return res.status(400).json({ success: false, message: 'Không thể reset khi đang chạy check điểm.' });
  }
  checkProgress = {
    isChecking: false,
    total: 0,
    current: 0,
    successCount: 0,
    failCount: 0,
    results: []
  };
  res.json({ success: true, message: 'Đã reset trạng thái.' });
});

// API: Tra cứu nhanh cho 1 SBD
app.post('/api/check-single', async (req, res) => {
  const { sbd } = req.body;
  if (!sbd) {
    return res.status(400).json({ success: false, message: 'Thiếu số báo danh.' });
  }

  const config = getConfig();
  if (!config.autocaptcha_key) {
    return res.status(400).json({ success: false, message: 'Vui lòng cấu hình API Key Autocaptcha.' });
  }

  try {
    const result = await fetchScoreForStudent(sbd, config.autocaptcha_key, 10);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// API: Xuất Excel kết quả
app.get('/api/export', async (req, res) => {
  if (checkProgress.results.length === 0) {
    return res.status(400).json({ success: false, message: 'Không có dữ liệu để xuất Excel.' });
  }

  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('DiemThiTHPT');

    worksheet.columns = [
      { header: 'STT', key: 'stt', width: 8 },
      { header: 'Số Báo Danh', key: 'sbd', width: 15 },
      { header: 'Họ Và Tên', key: 'name', width: 25 },
      { header: 'Toán', key: 'Toán', width: 10 },
      { header: 'Ngữ văn', key: 'Ngữ văn', width: 10 },
      { header: 'Ngoại ngữ', key: 'Ngoại ngữ', width: 12 },
      { header: 'Vật lí', key: 'Vật lí', width: 10 },
      { header: 'Hóa học', key: 'Hóa học', width: 10 },
      { header: 'Sinh học', key: 'Sinh học', width: 10 },
      { header: 'Lịch sử', key: 'Lịch sử', width: 10 },
      { header: 'Địa lí', key: 'Địa lí', width: 10 },
      { header: 'GDCD', key: 'GDCD', width: 10 },
      { header: 'Trạng thái', key: 'statusText', width: 20 }
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF6002A3' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    headerRow.height = 30;

    checkProgress.results.forEach((student, index) => {
      const rowData = {
        stt: index + 1,
        sbd: student.sbd,
        name: student.name || '',
        'Toán': student.scores['Toán'] || '',
        'Ngữ văn': student.scores['Ngữ văn'] || '',
        'Ngoại ngữ': student.scores['Ngoại ngữ'] || '',
        'Vật lí': student.scores['Vật lí'] || '',
        'Hóa học': student.scores['Hóa học'] || '',
        'Sinh học': student.scores['Sinh học'] || '',
        'Lịch sử': student.scores['Lịch sử'] || '',
        'Địa lí': student.scores['Địa lí'] || '',
        'GDCD': student.scores['GDCD'] || '',
        statusText: student.status === 'SUCCESS' ? 'Thành công' : (student.status === 'NOT_FOUND' ? 'Không tìm thấy' : (student.error || 'Chờ check'))
      };

      const row = worksheet.addRow(rowData);
      row.font = { name: 'Arial', size: 10 };
      row.alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell('name').alignment = { vertical: 'middle', horizontal: 'left' };
      row.getCell('statusText').alignment = { vertical: 'middle', horizontal: 'left' };
      row.height = 22;

      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
        };
      });

      if (index % 2 === 1) {
        row.eachCell((cell) => {
          if (cell.colNo !== 3 && cell.colNo !== 13) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF9F5FF' }
            };
          }
        });
      }
    });

    headerRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF4F0085' } },
        left: { style: 'thin', color: { argb: 'FF4F0085' } },
        bottom: { style: 'medium', color: { argb: 'FF4F0085' } },
        right: { style: 'thin', color: { argb: 'FF4F0085' } }
      };
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=diem_thi_thpt_lang_son.xlsx');

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    res.status(500).json({ success: false, message: 'Lỗi khi tạo file Excel: ' + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
