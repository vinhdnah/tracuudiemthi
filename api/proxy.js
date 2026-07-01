const axios = require('axios');

module.exports = async (req, res) => {
  // CORS Headers cho phép truy cập từ mọi origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');

  // Xử lý preflight request OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { targetUrl, method = 'GET', headers = {}, body = null, responseType = 'text' } = req.body;

  if (!targetUrl) {
    return res.status(400).json({ success: false, message: 'Thiếu tham số targetUrl.' });
  }

  try {
    const config = {
      method: method.toUpperCase(),
      url: targetUrl,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...headers
      },
      timeout: 15000
    };

    if (responseType === 'arraybuffer') {
      config.responseType = 'arraybuffer';
    }

    if (body) {
      if (typeof body === 'object') {
        if (headers['Content-Type'] === 'application/x-www-form-urlencoded') {
          const params = new URLSearchParams();
          for (const key in body) {
            params.append(key, body[key]);
          }
          config.data = params.toString();
        } else {
          config.data = body;
        }
      } else {
        config.data = body;
      }
    }

    const response = await axios(config);

    // Chuyển tiếp cookie set-cookie từ response
    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      res.setHeader('set-cookie', setCookie);
    }

    if (responseType === 'arraybuffer') {
      res.setHeader('Content-Type', response.headers['content-type'] || 'image/png');
      return res.status(response.status).send(response.data);
    }

    res.setHeader('Content-Type', response.headers['content-type'] || 'text/html; charset=utf-8');
    return res.status(response.status).send(response.data);

  } catch (error) {
    console.error('Lỗi Proxy:', error.message);
    const statusCode = error.response ? error.response.status : 500;
    const errorData = error.response ? error.response.data : null;
    
    return res.status(statusCode).json({
      success: false,
      message: 'Proxy Error: ' + error.message,
      details: typeof errorData === 'string' ? errorData.substring(0, 200) : errorData
    });
  }
};
