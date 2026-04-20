const axios = require('axios');
async function test() {
  try {
    const res = await axios.post('http://localhost:5000/api/webhook/telegram', {
      message: {
        chat: { id: 123 },
        from: { id: 123 },
        text: "Narendra Modi is the Prime Minister of India"
      }
    });
    console.log("Status:", res.status);
    console.log("Data:", res.data);
  } catch(e) { console.error(e); }
}
test();
