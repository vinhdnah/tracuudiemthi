// Frontend App logic - Client-Side Serverless Edition
let studentsData = []; // Danh sách học sinh { sbd, name }
let checkProgress = {
  isChecking: false,
  total: 0,
  current: 0,
  successCount: 0,
  failCount: 0,
  results: [] // Kết quả check của từng học sinh: { sbd, name, status, scores, error, attempts }
};

document.addEventListener('DOMContentLoaded', () => {
  // Lấy các DOM elements
  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');
  const btnReset = document.getElementById('btn-reset');
  const btnDownload = document.getElementById('btn-download');
  const progressFill = document.getElementById('progress-fill');
  const progressPercent = document.getElementById('progress-percent');
  const progressCount = document.getElementById('progress-count');
  
  const statSuccess = document.getElementById('stat-success');
  const statFailed = document.getElementById('stat-failed');
  
  const singleSbdInput = document.getElementById('single-sbd');
  const btnCheckSingle = document.getElementById('btn-check-single');
  const singleResultBox = document.getElementById('single-result-box');
  
  const searchStudentInput = document.getElementById('search-student-input');
  const studentsTbody = document.getElementById('students-tbody');
  const studentsCards = document.getElementById('students-cards');

  // Drag & drop file elements
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const uploadStatus = document.getElementById('upload-status');

  // 1. Đọc danh sách học sinh từ LocalStorage
  function loadConfig() {
    try {
      studentsData = JSON.parse(localStorage.getItem('students_list') || '[]');
      
      // Khôi phục kết quả check cũ nếu có
      const savedResults = localStorage.getItem('check_results');
      if (savedResults) {
        checkProgress.results = JSON.parse(savedResults);
        checkProgress.total = studentsData.length;
        checkProgress.current = checkProgress.results.filter(r => r.status !== 'PENDING' && r.status !== 'CHECKING').length;
        checkProgress.successCount = checkProgress.results.filter(r => r.status === 'SUCCESS').length;
        checkProgress.failCount = checkProgress.results.filter(r => r.status === 'FAILED' || r.status === 'NOT_FOUND').length;
        
        // Cập nhật UI tiến trình
        updateUIProgress();
        if (checkProgress.results.length > 0) {
          btnDownload.classList.remove('disabled');
        }
      }
      
      renderStudentsTable(studentsData);
    } catch (e) {
      console.error('Không thể load cấu hình từ LocalStorage:', e);
    }
  }

  // 2. Render danh sách học sinh vào bảng (Desktop) và Card (Mobile)
  function renderStudentsTable(students, resultsMap = null) {
    studentsTbody.innerHTML = '';
    studentsCards.innerHTML = '';

    if (students.length === 0) {
      const emptyMsg = `<tr><td colspan="13" style="text-align: center; color: var(--text-muted); padding: 20px;">Danh sách học sinh trống. Vui lòng kéo thả file Excel/PDF vào để nạp danh sách.</td></tr>`;
      studentsTbody.innerHTML = emptyMsg;
      studentsCards.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px; width: 100%;">Danh sách học sinh trống. Vui lòng kéo thả file Excel/PDF vào để nạp danh sách.</div>`;
      return;
    }

    // Nếu không truyền resultsMap thì tạo map từ results hiện tại
    if (!resultsMap) {
      resultsMap = {};
      checkProgress.results.forEach(res => {
        resultsMap[res.sbd] = res;
      });
    }

    students.forEach((student, index) => {
      const checkedResult = resultsMap[student.sbd] || null;
      const status = checkedResult ? checkedResult.status : 'PENDING';
      const scores = checkedResult ? checkedResult.scores : {};
      
      let statusBadge = '<span class="badge badge-pending">Chờ check</span>';
      if (status === 'CHECKING') {
        statusBadge = '<span class="badge badge-checking">Đang check</span>';
      } else if (status === 'SUCCESS') {
        statusBadge = '<span class="badge badge-success">Thành công</span>';
      } else if (status === 'NOT_FOUND') {
        statusBadge = '<span class="badge badge-notfound">Không thấy</span>';
      } else if (status === 'FAILED') {
        statusBadge = `<span class="badge badge-failed" title="${checkedResult.error || ''}">Lỗi</span>`;
      }

      // Render Table Row (Desktop)
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td><strong>${student.sbd}</strong></td>
        <td>${student.name}</td>
        <td>${statusBadge}</td>
        <td>${scores['Toán'] || '-'}</td>
        <td>${scores['Ngữ văn'] || '-'}</td>
        <td>${scores['Ngoại ngữ'] || '-'}</td>
        <td>${scores['Vật lí'] || '-'}</td>
        <td>${scores['Hóa học'] || '-'}</td>
        <td>${scores['Sinh học'] || '-'}</td>
        <td>${scores['Lịch sử'] || '-'}</td>
        <td>${scores['Địa lí'] || '-'}</td>
        <td>${scores['GDCD'] || '-'}</td>
      `;

      if (status === 'CHECKING') {
        tr.style.background = 'rgba(255, 234, 0, 0.05)';
      }
      studentsTbody.appendChild(tr);

      // Render Card (Mobile)
      const card = document.createElement('div');
      card.className = `student-mobile-card ${status.toLowerCase()}`;

      let scoresListHtml = '';
      const scoreKeys = Object.keys(scores);
      
      if (status === 'SUCCESS' && scoreKeys.length > 0) {
        scoresListHtml = `<div class="mobile-scores-grid mt-10">`;
        scoreKeys.forEach(subject => {
          scoresListHtml += `
            <div class="mobile-score-item">
              <span class="m-sub-label">${subject}</span>
              <span class="m-sub-val">${scores[subject]}</span>
            </div>
          `;
        });
        scoresListHtml += `</div>`;
      } else if (status === 'FAILED') {
        scoresListHtml = `<div class="mobile-error-text mt-10" style="color: var(--color-error)">❌ Lỗi: ${checkedResult.error || 'Thất bại'}</div>`;
      } else if (status === 'NOT_FOUND') {
        scoresListHtml = `<div class="mobile-error-text mt-10" style="color: var(--color-info)">ℹ️ Không tìm thấy SBD hoặc chưa có điểm.</div>`;
      } else {
        scoresListHtml = `<div class="mobile-error-text mt-10" style="color: var(--text-muted)">⏳ Đang chờ kiểm tra điểm...</div>`;
      }

      card.innerHTML = `
        <div class="mobile-card-header">
          <div class="m-student-info">
            <span class="m-stt">#${index + 1}</span>
            <span class="m-sbd">${student.sbd}</span>
            <div class="m-name">${student.name}</div>
          </div>
          <div class="m-status-badge">${statusBadge}</div>
        </div>
        ${scoresListHtml}
      `;
      studentsCards.appendChild(card);
    });
  }

  // 3. Cập nhật UI Tiến trình
  function updateUIProgress() {
    const total = checkProgress.total;
    const current = checkProgress.current;
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    
    progressFill.style.width = `${percent}%`;
    progressPercent.textContent = `${percent}%`;
    progressCount.textContent = `${current} / ${total} học sinh`;
    
    statSuccess.textContent = checkProgress.successCount;
    statFailed.textContent = checkProgress.failCount;

    // Trigger render table với bộ lọc tìm kiếm
    const resultsMap = {};
    checkProgress.results.forEach(res => {
      resultsMap[res.sbd] = res;
    });

    const query = searchStudentInput.value.toLowerCase().trim();
    const filteredStudents = studentsData.filter(s => 
      s.name.toLowerCase().includes(query) || s.sbd.includes(query)
    );
    renderStudentsTable(filteredStudents, resultsMap);
  }

  // 4. Thay đổi trạng thái hiển thị của các nút bấm điều khiển
  function toggleControlButtons() {
    if (checkProgress.isChecking) {
      btnStart.disabled = true;
      btnStart.style.display = 'none';
      btnStop.disabled = false;
      btnStop.style.display = 'inline-flex';
      btnReset.disabled = true;
      btnDownload.classList.add('disabled');
    } else {
      btnStart.disabled = false;
      btnStart.style.display = 'inline-flex';
      btnStop.disabled = true;
      btnStop.style.display = 'none';
      btnStop.innerHTML = `<span class="material-icons-round">stop</span> Dừng check`;
      btnReset.disabled = false;
      if (checkProgress.results.length > 0) {
        btnDownload.classList.remove('disabled');
      }
    }
  }

  // 5. Hàm phân tích HTML kết quả từ Sở Lạng Sơn
  function parseExamResult(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const text = doc.body.textContent.replace(/\s+/g, ' ').trim();

    // Check lỗi Captcha
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

    // Check không tìm thấy kết quả
    if (
      text.includes('Không tìm thấy') || 
      text.includes('Không tìm thấy thí sinh') || 
      text.includes('không tìm thấy') || 
      text.includes('Không có kết quả') ||
      text.includes('Bạn hãy nhập vào')
    ) {
      return { error: 'Không tìm thấy số báo danh hoặc chưa có điểm' };
    }

    let studentName = '';
    const nameMatch = text.match(/(?:Họ(?:và)?tên|Họ\s+tên|Thí\s+sinh|Tên)[:\s]+([^:|\n\d\-]+?)(?=\s+(?:Số\s+báo\s+danh|SBD|Điểm|$))/i);
    if (nameMatch) {
      studentName = nameMatch[1].trim();
    }

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

    const scores = {};
    const subjects = Object.keys(SUBJECT_MAP);
    
    // Parse điểm bằng Regex
    subjects.forEach(sub => {
      const regex = new RegExp(`${sub}\\s*[:\\-]?\\s*([0-9]+[.,][0-9]+|[0-9]+)`, 'i');
      const match = text.match(regex);
      if (match) {
        const normalizedSubject = SUBJECT_MAP[sub];
        scores[normalizedSubject] = match[1].replace(',', '.');
      }
    });

    // Nếu regex không tìm thấy, parse bằng bảng tr td
    if (Object.keys(scores).length === 0) {
      const rows = doc.querySelectorAll('tr');
      rows.forEach(row => {
        const cols = row.querySelectorAll('td');
        if (cols.length >= 2) {
          const key = cols[0].textContent.trim();
          const val = cols[1].textContent.trim();
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
      return { error: 'Không phân tích được điểm thi' };
    }

    return { studentName, scores };
  }

  // 6. Gửi request tra cứu điểm thi cho 1 SBD (có kèm cơ chế giải captcha qua API proxy)
  async function fetchScoreForStudent(sbd, maxRetries = 15) {
    let attempts = 0;
    
    while (attempts < maxRetries) {
      attempts++;
      try {
        console.log(`[${sbd}] Lần thử ${attempts}: Đang tải Captcha...`);
        
        // 1. Tải ảnh Captcha qua Proxy
        const captchaProxyRes = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUrl: `https://tracuudiem.langson.edu.vn/captcha.php?t=${Date.now()}`,
            method: 'GET',
            responseType: 'arraybuffer'
          })
        });

        if (!captchaProxyRes.ok) throw new Error('Lỗi kết nối proxy tải Captcha');

        // Lấy session cookie từ header 'set-cookie' qua proxy
        const setCookieHeader = captchaProxyRes.headers.get('set-cookie');
        let phpSessionCookie = '';
        if (setCookieHeader) {
          phpSessionCookie = setCookieHeader.split(';')[0];
        }

        // Chuyển binary buffer sang Base64
        const blob = await captchaProxyRes.blob();
        const base64Captcha = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(blob);
        });
        const captchaDataUrl = `data:image/png;base64,${base64Captcha}`;

        console.log(`[${sbd}] Đang giải Captcha qua autocaptcha.pro...`);
        // 2. Gửi ảnh captcha sang API giải captcha qua proxy
        const solveProxyRes = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUrl: 'https://autocaptcha.pro/apiv3/process',
            method: 'POST',
            body: {
              key: '45b95073607c4288a355b47af450a374', // API key cố định bảo mật trên proxy
              type: 'imagetotext',
              img: captchaDataUrl
            }
          })
        });

        const captchaData = await solveProxyRes.json();
        if (!captchaData || !captchaData.success) {
          throw new Error(`Lỗi giải Captcha: ${captchaData ? captchaData.message : 'Không phản hồi'}`);
        }

        const captchaText = captchaData.captcha.trim().toUpperCase();
        console.log(`[${sbd}] Giải Captcha thành công: ${captchaText}`);

        // 3. Gửi request POST tra cứu điểm qua Proxy
        console.log(`[${sbd}] Đang gửi yêu cầu tra cứu...`);
        const searchProxyRes = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUrl: 'https://tracuudiem.langson.edu.vn/tra_cuu_diem_tn_thpt.php',
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Cookie': phpSessionCookie,
              'Referer': 'https://tracuudiem.langson.edu.vn/'
            },
            body: {
              search_text: sbd,
              captcha_text: captchaText
            }
          })
        });

        const html = await searchProxyRes.text();
        const result = parseExamResult(html);
        
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
          console.log(`[${sbd}] Captcha giải sai, chuẩn bị thử lại...`);
          await new Promise(r => setTimeout(r, 1000));
        } else {
          console.log(`[${sbd}] Lỗi mạng hoặc lỗi kết nối. Thử lại sau 2 giây...`);
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }

    return {
      sbd,
      status: 'FAILED',
      name: '',
      scores: {},
      error: `Thất bại sau ${maxRetries} lần thử (Sai captcha liên tiếp hoặc lỗi mạng)`,
      attempts
    };
  }

  // 7. Bắt đầu check điểm hàng loạt (chạy trực tiếp trên Client)
  async function startBatchCheck() {
    checkProgress.isChecking = true;
    checkProgress.total = studentsData.length;
    checkProgress.current = 0;
    checkProgress.successCount = 0;
    checkProgress.failCount = 0;
    
    // Khởi tạo danh sách kết quả rỗng
    checkProgress.results = studentsData.map(s => ({
      sbd: s.sbd,
      name: s.name,
      status: 'PENDING',
      scores: {},
      error: null,
      attempts: 0
    }));

    toggleControlButtons();
    updateUIProgress();

    for (let i = 0; i < studentsData.length; i++) {
      if (!checkProgress.isChecking) break;

      const student = studentsData[i];
      checkProgress.results[i].status = 'CHECKING';
      updateUIProgress();

      try {
        const res = await fetchScoreForStudent(student.sbd);
        
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

      checkProgress.current = i + 1;
      
      // Lưu kết quả tạm vào LocalStorage phòng khi F5 trang
      localStorage.setItem('check_results', JSON.stringify(checkProgress.results));
      
      updateUIProgress();
      
      // Delay ngắn tránh bị block IP
      await new Promise(r => setTimeout(r, 1500));
    }

    checkProgress.isChecking = false;
    toggleControlButtons();
    updateUIProgress();
  }

  // 8. Đăng ký sự kiện Click cho nút điều khiển
  btnStart.addEventListener('click', () => {
    if (studentsData.length === 0) {
      alert('Danh sách học sinh trống. Vui lòng upload file Excel hoặc PDF trước!');
      return;
    }
    startBatchCheck();
  });

  btnStop.addEventListener('click', () => {
    checkProgress.isChecking = false;
    btnStop.disabled = true;
    btnStop.textContent = 'Đang dừng...';
  });

  btnReset.addEventListener('click', () => {
    if (!confirm('Bạn có chắc chắn muốn reset toàn bộ tiến trình không?')) return;
    
    localStorage.removeItem('check_results');
    checkProgress = {
      isChecking: false,
      total: 0,
      current: 0,
      successCount: 0,
      failCount: 0,
      results: []
    };
    
    progressFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressCount.textContent = '0 / 0 học sinh';
    statSuccess.textContent = '0';
    statFailed.textContent = '0';
    
    btnDownload.classList.add('disabled');
    loadConfig();
  });

  // 9. Xuất file Excel ở Client-side bằng SheetJS
  btnDownload.addEventListener('click', (e) => {
    if (btnDownload.classList.contains('disabled')) {
      e.preventDefault();
      return;
    }
    
    // Format dữ liệu sang cấu trúc bảng
    const formattedData = checkProgress.results.map((student, index) => {
      const row = {
        'STT': index + 1,
        'Số Báo Danh': student.sbd,
        'Họ Và Tên': student.name || '',
        'Toán': student.scores['Toán'] || '',
        'Ngữ văn': student.scores['Ngữ văn'] || '',
        'Ngoại ngữ': student.scores['Ngoại ngữ'] || '',
        'Vật lí': student.scores['Vật lí'] || '',
        'Hóa học': student.scores['Hóa học'] || '',
        'Sinh học': student.scores['Sinh học'] || '',
        'Lịch sử': student.scores['Lịch sử'] || '',
        'Địa lí': student.scores['Địa lí'] || '',
        'GDCD': student.scores['GDCD'] || '',
        'Trạng thái': student.status === 'SUCCESS' ? 'Thành công' : (student.status === 'NOT_FOUND' ? 'Không tìm thấy' : (student.error || 'Chờ check'))
      };
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    
    // Định dạng độ rộng cột tối thiểu
    const colWidths = [
      { wch: 6 },  // STT
      { wch: 15 }, // SBD
      { wch: 25 }, // Họ tên
      { wch: 8 },  // Toán
      { wch: 8 },  // Văn
      { wch: 10 }, // Anh
      { wch: 8 },  // Lý
      { wch: 8 },  // Hóa
      { wch: 8 },  // Sinh
      { wch: 8 },  // Sử
      { wch: 8 },  // Địa
      { wch: 8 },  // GDCD
      { wch: 20 }  // Trạng thái
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'DiemThiTHPT');
    
    // Xuất file tải về trình duyệt
    XLSX.writeFile(workbook, 'diem_thi_thpt_lang_son.xlsx');
  });

  // 10. Tra cứu nhanh đơn lẻ (qua Proxy)
  btnCheckSingle.addEventListener('click', async () => {
    const sbd = singleSbdInput.value.trim();
    if (!sbd) {
      alert('Vui lòng nhập Số báo danh.');
      return;
    }

    singleResultBox.style.display = 'block';
    singleResultBox.innerHTML = `<div style="text-align: center; color: var(--text-secondary);"><span class="material-icons-round" style="animation: spin 1s infinite linear; vertical-align: middle;">autorenew</span> Đang tra cứu...</div>`;

    try {
      const student = await fetchScoreForStudent(sbd, 10);
      
      if (student.status === 'SUCCESS') {
        let scoresHtml = '';
        const scoreKeys = Object.keys(student.scores);
        
        if (scoreKeys.length > 0) {
          scoresHtml = `<div class="single-result-grid mt-10">`;
          scoreKeys.forEach(subject => {
            scoresHtml += `
              <div class="single-result-cell">
                <span class="sub-label">${subject}</span>
                <span class="sub-val">${student.scores[subject]}</span>
              </div>
            `;
          });
          scoresHtml += `</div>`;
        } else {
          scoresHtml = `<p style="color: var(--text-secondary);">Không có dữ liệu điểm.</p>`;
        }

        singleResultBox.innerHTML = `
          <div class="single-result-title" style="color: var(--color-success)">
            ✅ ${student.name || 'Thí sinh'} (${student.sbd})
          </div>
          ${scoresHtml}
        `;
      } else if (student.status === 'NOT_FOUND') {
        singleResultBox.innerHTML = `
          <div class="single-result-title" style="color: var(--color-info)">
            ℹ️ Kết quả
          </div>
          <p style="color: var(--text-secondary); text-align: center; padding: 5px 0;">
            Không tìm thấy số báo danh <strong>${sbd}</strong> hoặc chưa có điểm.
          </p>
        `;
      } else {
        singleResultBox.innerHTML = `
          <div class="single-result-title" style="color: var(--color-error)">
            ❌ Thất bại
          </div>
          <p style="color: var(--text-secondary); font-size: 0.8rem;">
            ${student.error || 'Lỗi không xác định'}
          </p>
        `;
      }
    } catch (error) {
      singleResultBox.innerHTML = `
        <div class="single-result-title" style="color: var(--color-error)">
          ❌ Lỗi kết nối
        </div>
        <p style="color: var(--text-secondary)">Không thể kết nối đến server proxy.</p>
      `;
    }
  });

  // 11. Phân tích file Excel bằng SheetJS ở Client-side
  async function parseExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          let sbdColIndex = -1;
          let nameColIndex = -1;
          
          // Dò tìm vị trí các cột SBD và Tên
          const maxRowsToScan = Math.min(rows.length, 15);
          for (let i = 0; i < maxRowsToScan; i++) {
            const row = rows[i];
            if (!row) continue;
            for (let j = 0; j < row.length; j++) {
              const val = row[j] ? String(row[j]).trim() : '';
              if (!val) continue;
              if (/^[0-9]{8}$/.test(val) && sbdColIndex === -1) {
                sbdColIndex = j;
              }
              if (/^[a-zA-ZÀ-ỹ\s]{5,40}$/.test(val) && !/[0-9]/.test(val) && nameColIndex === -1 && j !== sbdColIndex) {
                nameColIndex = j;
              }
            }
          }
          
          if (sbdColIndex === -1) sbdColIndex = 0;
          if (nameColIndex === -1) nameColIndex = 1;
          
          const students = [];
          rows.forEach((row) => {
            const sbdVal = row[sbdColIndex] ? String(row[sbdColIndex]).trim() : '';
            const nameVal = row[nameColIndex] ? String(row[nameColIndex]).trim() : '';
            
            if (/^[0-9]{8}$/.test(sbdVal)) {
              const cleanName = nameVal.replace(/\s+/g, ' ').trim().toUpperCase();
              students.push({
                sbd: sbdVal,
                name: cleanName || `Học sinh ${sbdVal}`
              });
            }
          });
          
          resolve(students);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Lỗi đọc file Excel'));
      reader.readAsArrayBuffer(file);
    });
  }

  // 12. Phân tích file PDF bằng PDF.js ở Client-side
  async function parsePdfFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const typedarray = new Uint8Array(e.target.result);
          
          // Cấu hình PDFJS worker CDN
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
          
          const pdfDoc = await pdfjsLib.getDocument({ data: typedarray }).promise;
          let fullText = '';
          
          for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();
            // Nối các khối text của trang, chuẩn hóa khoảng trắng thừa
            const pageText = textContent.items.map(item => item.str).join(' ').replace(/\s+/g, ' ');
            fullText += pageText + '\n';
          }
          
          console.log('=== PDF TEXT EXTRACTED (Length: ' + fullText.length + ') ===');
          console.log(fullText);

          const students = [];
          
          // 1. Sử dụng matchAll quét toàn bộ văn bản tìm dạng "Họ tên thí sinh: ... Số báo danh: ..."
          const matches = [...fullText.matchAll(/Họ\s+tên\s+thí\s+sinh:\s*(.+?)\s*Số\s+báo\s+danh:\s*([0-9]{8})/gi)];
          
          matches.forEach(match => {
            const name = match[1].replace(/\s+/g, ' ').trim().toUpperCase();
            const sbd = match[2].trim();
            if (name.length >= 3 && !students.some(s => s.sbd === sbd)) {
              students.push({ sbd, name });
            }
          });

          // 2. Dự phòng nếu regex chính không khớp (ví dụ: bị đổi nhãn)
          if (students.length === 0) {
            const lines = fullText.split(/\n/);
            lines.forEach(line => {
              const sbdMatch = line.match(/\b([0-9]{8})\b/);
              if (sbdMatch) {
                const sbd = sbdMatch[1];
                let remainingText = line.replace(sbd, '');
                remainingText = remainingText.replace(/^\s*\d+\s+/, '');
                remainingText = remainingText.replace(/\d{2}[/\-]\d{2}[/\-]\d{4}/g, '');
                
                // Giữ lại chữ cái và khoảng trắng tiếng Việt
                const cleanName = remainingText.replace(/[^a-zA-ZÀ-ỹ\s]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
                if (cleanName.length >= 3 && !students.some(s => s.sbd === sbd)) {
                  students.push({ sbd, name: cleanName });
                }
              }
            });
          }
          
          resolve(students);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Lỗi đọc file PDF'));
      reader.readAsArrayBuffer(file);
    });
  }

  // 13. Xử lý Upload file từ Drag & Drop
  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  });

  async function handleFileUpload(file) {
    const validExtensions = ['.xlsx', '.xls', '.pdf'];
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validExtensions.includes(fileExt)) {
      showUploadStatus('Định dạng file không hỗ trợ. Vui lòng tải file Excel (.xlsx, .xls) hoặc PDF.', 'error');
      return;
    }

    showUploadStatus('Đang phân tích dữ liệu trực tiếp trên trình duyệt...', 'loading');

    try {
      let parsedStudents = [];
      if (fileExt === '.pdf') {
        parsedStudents = await parsePdfFile(file);
      } else {
        parsedStudents = await parseExcelFile(file);
      }

      if (parsedStudents.length === 0) {
        showUploadStatus('Không tìm thấy Số báo danh 8 chữ số nào trong file.', 'error');
        return;
      }

      // Lưu danh sách vào LocalStorage
      studentsData = parsedStudents;
      localStorage.setItem('students_list', JSON.stringify(studentsData));
      
      // Reset trạng thái tiến trình cũ
      localStorage.removeItem('check_results');
      checkProgress = {
        isChecking: false,
        total: studentsData.length,
        current: 0,
        successCount: 0,
        failCount: 0,
        results: []
      };

      showUploadStatus(`Đã nạp thành công ${studentsData.length} học sinh từ file!`, 'success');
      
      progressFill.style.width = '0%';
      progressPercent.textContent = '0%';
      progressCount.textContent = `0 / ${studentsData.length} học sinh`;
      statSuccess.textContent = '0';
      statFailed.textContent = '0';
      btnDownload.classList.add('disabled');

      renderStudentsTable(studentsData);

    } catch (error) {
      showUploadStatus('Lỗi bóc tách file: ' + error.message, 'error');
    }
  }

  function showUploadStatus(message, type) {
    uploadStatus.style.display = 'block';
    uploadStatus.className = `upload-status mt-10 ${type}`;
    
    let icon = '';
    if (type === 'loading') {
      icon = '<span class="material-icons-round" style="animation: spin 1s infinite linear; vertical-align: middle; margin-right: 5px; display: inline-block;">autorenew</span> ';
    } else if (type === 'success') {
      icon = '✅ ';
    } else if (type === 'error') {
      icon = '❌ ';
    }
    
    uploadStatus.innerHTML = icon + message;
  }

  // Bộ lọc tìm kiếm học sinh trên bảng
  searchStudentInput.addEventListener('input', () => {
    const resultsMap = {};
    checkProgress.results.forEach(res => {
      resultsMap[res.sbd] = res;
    });

    const query = searchStudentInput.value.toLowerCase().trim();
    const filteredStudents = studentsData.filter(s => 
      s.name.toLowerCase().includes(query) || s.sbd.includes(query)
    );
    renderStudentsTable(filteredStudents, resultsMap);
  });

  // Tải config ban đầu khi mở trang
  loadConfig();
});
