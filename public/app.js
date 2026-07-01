// Frontend App logic
let pollingInterval = null;
let studentsData = [];

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

  // Drag & drop file elements
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const uploadStatus = document.getElementById('upload-status');

  // Load cấu hình ban đầu (chỉ lấy danh sách học sinh)
  async function loadConfig() {
    try {
      const response = await fetch('/api/config');
      const data = await response.json();
      studentsData = data.students || [];
      renderStudentsTable(studentsData);
    } catch (e) {
      console.error('Không thể load cấu hình:', e);
    }
  }

  // Render danh sách học sinh vào bảng
  function renderStudentsTable(students, resultsMap = {}) {
    studentsTbody.innerHTML = '';
    if (students.length === 0) {
      studentsTbody.innerHTML = `<tr><td colspan="13" style="text-align: center; color: var(--text-muted); padding: 20px;">Danh sách học sinh trống. Vui lòng kéo thả file Excel/PDF vào để nạp danh sách.</td></tr>`;
      return;
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
        tr.style.background = 'rgba(255, 23, 68, 0.02)';
      }

      studentsTbody.appendChild(tr);
    });
  }

  // Bắt đầu check hàng loạt
  btnStart.addEventListener('click', async () => {
    if (studentsData.length === 0) {
      alert('Danh sách học sinh trống. Vui lòng upload file Excel hoặc PDF trước!');
      return;
    }

    try {
      const response = await fetch('/api/start-check', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        btnStart.disabled = true;
        btnStart.style.display = 'none';
        btnStop.disabled = false;
        btnStop.style.display = 'inline-flex';
        btnReset.disabled = true;
        btnDownload.classList.add('disabled');
        
        startPolling();
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (e) {
      alert('Không thể kết nối đến server để bắt đầu check.');
    }
  });

  // Dừng check
  btnStop.addEventListener('click', async () => {
    try {
      const response = await fetch('/api/stop-check', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        btnStop.disabled = true;
        btnStop.textContent = 'Đang dừng...';
      }
    } catch (e) {
      console.error(e);
    }
  });

  // Reset trạng thái
  btnReset.addEventListener('click', async () => {
    if (!confirm('Bạn có chắc chắn muốn reset toàn bộ trạng thái check điểm không?')) return;
    try {
      const response = await fetch('/api/reset-status', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        progressFill.style.width = '0%';
        progressPercent.textContent = '0%';
        progressCount.textContent = '0 / 0 học sinh';
        statSuccess.textContent = '0';
        statFailed.textContent = '0';
        btnDownload.classList.add('disabled');
        loadConfig();
      }
    } catch (e) {
      alert('Lỗi khi kết nối server.');
    }
  });

  // Vòng lặp Polling trạng thái
  function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollStatus();
    pollingInterval = setInterval(pollStatus, 1000);
  }

  async function pollStatus() {
    try {
      const response = await fetch('/api/status');
      const data = await response.json();
      
      const percent = data.total > 0 ? Math.round((data.current / data.total) * 100) : 0;
      progressFill.style.width = `${percent}%`;
      progressPercent.textContent = `${percent}%`;
      progressCount.textContent = `${data.current} / ${data.total} học sinh`;
      
      statSuccess.textContent = data.successCount;
      statFailed.textContent = data.failCount;

      const resultsMap = {};
      data.results.forEach(res => {
        resultsMap[res.sbd] = res;
      });

      const query = searchStudentInput.value.toLowerCase().trim();
      const filteredStudents = studentsData.filter(s => 
        s.name.toLowerCase().includes(query) || s.sbd.includes(query)
      );
      renderStudentsTable(filteredStudents, resultsMap);

      if (!data.isChecking) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        
        btnStart.disabled = false;
        btnStart.style.display = 'inline-flex';
        btnStop.disabled = true;
        btnStop.style.display = 'none';
        btnStop.innerHTML = `<span class="material-icons-round">stop</span> Dừng check`;
        btnReset.disabled = false;

        if (data.results.length > 0) {
          btnDownload.classList.remove('disabled');
        }
      }

    } catch (e) {
      console.error('Lỗi khi poll status:', e);
    }
  }

  // Bộ lọc tìm kiếm học sinh
  searchStudentInput.addEventListener('input', () => {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        const resultsMap = {};
        data.results.forEach(res => {
          resultsMap[res.sbd] = res;
        });

        const query = searchStudentInput.value.toLowerCase().trim();
        const filteredStudents = studentsData.filter(s => 
          s.name.toLowerCase().includes(query) || s.sbd.includes(query)
        );
        renderStudentsTable(filteredStudents, resultsMap);
      });
  });

  // Tra cứu đơn lẻ nhanh
  btnCheckSingle.addEventListener('click', async () => {
    const sbd = singleSbdInput.value.trim();
    if (!sbd) {
      alert('Vui lòng nhập Số báo danh.');
      return;
    }

    singleResultBox.style.display = 'block';
    singleResultBox.innerHTML = `<div style="text-align: center; color: var(--text-secondary);"><span class="material-icons-round" style="animation: spin 1s infinite linear; vertical-align: middle;">autorenew</span> Đang check (tự động giải captcha)...</div>`;

    try {
      const response = await fetch('/api/check-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sbd })
      });
      const resData = await response.json();

      if (resData.success) {
        const student = resData.data;
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
      } else {
        singleResultBox.innerHTML = `
          <div class="single-result-title" style="color: var(--color-error)">
            ❌ Lỗi Server
          </div>
          <p style="color: var(--text-secondary)">${resData.message}</p>
        `;
      }
    } catch (error) {
      singleResultBox.innerHTML = `
        <div class="single-result-title" style="color: var(--color-error)">
          ❌ Lỗi kết nối
        </div>
        <p style="color: var(--text-secondary)">Không thể kết nối đến server.</p>
      `;
    }
  });

  // Xử lý Upload file (Excel, PDF)
  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  });

  // Dragover & Dragenter effects
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

    const formData = new FormData();
    formData.append('file', file);

    showUploadStatus('Đang tải lên và phân tích danh sách học sinh...', 'loading');

    try {
      const response = await fetch('/api/upload-list', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (data.success) {
        showUploadStatus(data.message, 'success');
        studentsData = data.students || [];
        renderStudentsTable(studentsData);
        
        progressFill.style.width = '0%';
        progressPercent.textContent = '0%';
        progressCount.textContent = `0 / ${studentsData.length} học sinh`;
        statSuccess.textContent = '0';
        statFailed.textContent = '0';
        btnDownload.classList.add('disabled');
      } else {
        showUploadStatus('Lỗi: ' + data.message, 'error');
      }
    } catch (error) {
      showUploadStatus('Không thể kết nối đến server để tải file lên.', 'error');
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

  // Tải config ban đầu khi mở trang
  loadConfig();
  
  // Kiểm tra trạng thái hiện tại xem server có đang check dở không để tiếp tục polling
  fetch('/api/status')
    .then(res => res.json())
    .then(data => {
      if (data.isChecking) {
        btnStart.disabled = true;
        btnStart.style.display = 'none';
        btnStop.disabled = false;
        btnStop.style.display = 'inline-flex';
        btnReset.disabled = true;
        startPolling();
      }
    });
});
