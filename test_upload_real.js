const fs = require('fs');
const path = require('path');

async function testUpload() {
  const filePath = path.join(__dirname, '_T1_Giay bao du thi_lop_12A3.pdf');
  if (!fs.existsSync(filePath)) {
    console.error('Khong tim thay file PDF de upload:', filePath);
    return;
  }

  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: 'application/pdf' });
  
  const formData = new FormData();
  formData.append('file', blob, '_T1_Giay bao du thi_lop_12A3.pdf');

  try {
    console.log('Dang gui request upload file PDF len server...');
    const response = await fetch('http://localhost:3000/api/upload-list', {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    console.log('\n=== KET QUA TRA VE TU SERVER ===');
    console.log('Success:', result.success);
    console.log('Message:', result.message);
    if (result.success) {
      console.log('So luong hoc sinh boc tach duoc:', result.students.length);
      console.log('Danh sach 5 hoc sinh dau tien:');
      console.log(result.students.slice(0, 5));
    } else {
      console.log('Loi chi tiet:', result);
    }
  } catch (error) {
    console.error('Loi ket noi:', error.message);
  }
}

testUpload();
