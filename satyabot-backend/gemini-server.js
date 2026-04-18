require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.urlencoded({ extended: true }));

if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY missing in .env");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash"
});

app.get('/health', (req, res) => {
    res.json({ status: "SatyaBot is running" });
});

app.post('/webhook', async (req, res) => {
    const userText = (req.body.Body || "").trim();
    const numMedia = parseInt(req.body.NumMedia || "0");
    const from = req.body.From || "unknown";

    console.log(`From ${from}: "${userText}" | Media: ${numMedia}`);

    const lower = userText.toLowerCase();

    if (numMedia === 0 && ["hi", "hello", "help"].includes(lower)) {
        return sendTwiML(
            res,
            "Namaste! I am SatyaBot. Forward me any suspicious news, rumor, or image, and I will verify it for you."
        );
    }

    const safeText = userText.slice(0, 1000);

    try {
        const systemPrompt = `
You are SatyaBot, a highly accurate fact-checker for India.

Analyze the input carefully.

Return ONLY in this format:

*Status:* [FAKE / TRUE / UNVERIFIED]
*Fact Check:* [Short explanation in simple English or Hinglish]

Rules:
- Max 400 characters
- Be concise
- Avoid speculation
`;

        let result;

        if (numMedia > 0 && req.body.MediaUrl0) {
            const imageUrl = req.body.MediaUrl0;

            const imgRes = await axios.get(imageUrl, {
                responseType: "arraybuffer",
                timeout: 5000
            });

            const base64 = Buffer.from(imgRes.data).toString("base64");
            const mimeType =
                imgRes.headers["content-type"] || "image/jpeg";

            result = await model.generateContent({
                contents: [
                    {
                        role: "user",
                        parts: [
                            { text: systemPrompt },
                            {
                                inlineData: {
                                    mimeType: mimeType,
                                    data: base64
                                }
                            },
                            { text: `User message: ${safeText}` }
                        ]
                    }
                ]
            });

        } else {
            result = await model.generateContent({
                contents: [
                    {
                        role: "user",
                        parts: [
                            { text: systemPrompt },
                            { text: safeText }
                        ]
                    }
                ]
            });
        }

        let aiText = "Unable to process response.";

        try {
            aiText = result.response.candidates[0].content.parts[0].text;
        } catch (e) {
            console.error("Parsing error:", e);
        }

        sendTwiML(res, aiText);

    } catch (err) {
        console.error("Gemini Error:", err.message);

        sendTwiML(
            res,
            "SatyaBot is experiencing heavy traffic right now. Please try again in a few minutes."
        );
    }
});

function sendTwiML(res, message) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
<Message>${escapeXml(message)}</Message>
</Response>`;

    res.set("Content-Type", "text/xml");
    res.status(200).send(twiml);
}

function escapeXml(str = "") {
    return str.replace(/[<>&"']/g, (c) => ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;"
    }[c]));
}

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Webhook: http://localhost:${PORT}/webhook`);
});