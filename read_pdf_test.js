const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

async function test() {
  const pdfPath = path.join(__dirname, '_T1_Giay bao du thi_lop_12A3.pdf');
  const dataBuffer = fs.readFileSync(pdfPath);
  const uint8Array = new Uint8Array(dataBuffer);
  
  const parser = new pdfParse.PDFParse(uint8Array);
  const textResult = await parser.getText();
  
  console.log('Type of textResult:', typeof textResult);
  console.log('Keys of textResult:', Object.keys(textResult));
  if (textResult.text) {
    console.log('textResult.text length:', textResult.text.length);
    console.log('First 200 chars of text:', textResult.text.substring(0, 200));
  }
}

test();
