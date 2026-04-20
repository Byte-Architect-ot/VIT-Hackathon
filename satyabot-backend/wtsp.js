require('dotenv').config();
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
const PORT = process.env.WHATSAPP_SERVER_PORT || 5001;
const BACKEND_API = process.env.BACKEND_API_URL || 'http://localhost:5000/api';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let stats = {
    totalRequests: 0,
    textMessages: 0,
    imageMessages: 0,
    errors: 0,
    lastRequest: null
};

// Cache to store sources temporarily for each user
// Key: phone number, Value: array of sources
const userSourcesCache = new Map();

const GREETINGS = ['hi', 'hello', 'help', 'namaste', 'namaskar', 'hey', 'start'];






app.get('/health', (req, res) => {
    res.json({
        status: "SatyaBot WhatsApp Service Running",
        backend: BACKEND_API,
        timestamp: new Date().toISOString(),
        stats: stats,
        twilioConfigured: !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN)
    });
});

app.get('/stats', (req, res) => {
    res.json(stats);
});






app.post('/webhook', async (req, res) => {
    const startTime = Date.now();
    stats.totalRequests++;
    stats.lastRequest = new Date().toISOString();

    const userText = (req.body.Body || "").trim();
    const numMedia = parseInt(req.body.NumMedia || "0");
    const mediaUrl = req.body.MediaUrl0;
    const mediaType = req.body.MediaContentType0;
    const from = req.body.From || "unknown";
    const profileName = req.body.ProfileName || "User";



        console.log(`Incoming WhatsApp Message`);
    console.log(`From: ${from} (${profileName})`);
    console.log(`Text: "${userText || '[No text]'}"`);
    console.log(`Media: ${numMedia} file(s)`);
    if (mediaUrl) console.log(`Media URL: ${mediaUrl}`);



    const lowerText = userText.toLowerCase();
    if (numMedia === 0 && GREETINGS.some(g => lowerText === g || lowerText.startsWith(g + ' '))) {
        const welcomeMsg = formatWelcomeMessage();
        return sendTwiML(res, welcomeMsg);
    }

    if (!userText && numMedia === 0) {
        const helpMsg = formatHelpMessage();
        return sendTwiML(res, helpMsg);
    }

    // Handle 'sources' request
    if (numMedia === 0 && lowerText === 'sources') {
        const sources = userSourcesCache.get(from);
        if (sources && sources.length > 0) {
            let srcMsg = `SOURCES (${sources.length} references):\n\n`;
            sources.forEach((src, i) => {
                const tier = (src.credibilityTier || 'unknown').charAt(0).toUpperCase() + (src.credibilityTier || 'unknown').slice(1);
                const title = src.title || src.source || 'Source';
                const domain = src.source || '';
                srcMsg += `${i + 1}. [${tier}] ${title}`;
                if (domain && domain !== title) {
                    srcMsg += ` (${domain})`;
                }
                srcMsg += `\n`;
                if (src.url) {
                    srcMsg += `   ${src.url}\n`;
                }
                srcMsg += `\n`;
            });
            return sendTwiML(res, srcMsg.trim());
        } else {
            return sendTwiML(res, 'No sources available. Please send a claim to verify first.');
        }
    }

    try {
        let verificationResult;
        let processingNote = '';






        if (numMedia > 0 && mediaUrl) {
            stats.imageMessages++;
            console.log('Processing image message...');

            const isImage = !mediaType || mediaType.startsWith('image/');

            if (!isImage) {
                return sendTwiML(res,
                    "Only image files are supported. Please send an image containing text to verify."
                );
            }

            try {
                console.log('Downloading image from Twilio...');
                const imageBuffer = await downloadTwilioMedia(mediaUrl);
                console.log(`Image downloaded: ${imageBuffer.length} bytes`);

                console.log('Sending image to OCR service...');
                const ocrResult = await extractTextFromImage(imageBuffer);

                console.log(`OCR Result: success=${ocrResult.success}, confidence=${ocrResult.confidence}%`);
                console.log(`Extracted text: "${ocrResult.text?.substring(0, 100)}..."`);

                if (!ocrResult.success || !ocrResult.text || ocrResult.text.length < 10) {
                    const ocrErrorMsg = formatOcrErrorMessage(ocrResult.error);
                    return sendTwiML(res, ocrErrorMsg);
                }

                if (ocrResult.confidence < 50) {
                    const lowConfMsg = formatLowConfidenceMessage(ocrResult);
                    return sendTwiML(res, lowConfMsg);
                }

                let textToVerify = ocrResult.text;
                if (userText && userText.length > 0) {
                    textToVerify = `${userText}\n\n[Extracted from image]: ${ocrResult.text}`;
                }

                processingNote = `\n\nOCR Confidence: ${ocrResult.confidence.toFixed(0)}%`;
                if (ocrResult.confidence < 70) {
                    processingNote += `\nNote: Text extraction accuracy may be limited.`;
                }

                console.log('Verifying extracted text with backend...');
                verificationResult = await verifyWithBackend(textToVerify, from);

            } catch (imageError) {
                console.error('Image processing error:', imageError.message);
                stats.errors++;

                const errorMsg = formatImageProcessingError(imageError);
                return sendTwiML(res, errorMsg);
            }
        }






        else {
            stats.textMessages++;
            console.log('Processing text message...');

            const safeText = userText.slice(0, 2000);
            verificationResult = await verifyWithBackend(safeText, from);
        }






        const processingTime = Date.now() - startTime;
        console.log(`Verification completed in ${processingTime}ms`);

        // Store sources in cache
        if (verificationResult && verificationResult.sources && verificationResult.sources.length > 0) {
            userSourcesCache.set(from, verificationResult.sources);
        } else if (verificationResult && verificationResult.source === 'verified_dataset' && verificationResult.fact_check_link) {
            userSourcesCache.set(from, [{
                title: 'Verified Database Source',
                url: verificationResult.fact_check_link,
                credibilityTier: 'high'
            }]);
        }

        const responseMsg = formatProfessionalResponse(verificationResult, processingNote, from);
        sendTwiML(res, responseMsg);

    } catch (err) {
        console.error("Webhook Error:", err.message);
        if (err.stack) console.error(err.stack);
        stats.errors++;

        const errorMsg = formatSystemError(err);
        sendTwiML(res, errorMsg);
    }
});






async function downloadTwilioMedia(mediaUrl) {
    try {
        if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
            console.log('Downloading with Twilio auth...');

            const response = await axios.get(mediaUrl, {
                responseType: 'arraybuffer',
                timeout: 20000,
                maxContentLength: 10 * 1024 * 1024,
                auth: {
                    username: TWILIO_ACCOUNT_SID,
                    password: TWILIO_AUTH_TOKEN
                }
            });

            return Buffer.from(response.data);
        } else {
            console.warn('Twilio credentials not configured, trying direct download...');

            const response = await axios.get(mediaUrl, {
                responseType: 'arraybuffer',
                timeout: 15000,
                maxContentLength: 10 * 1024 * 1024
            });

            return Buffer.from(response.data);
        }

    } catch (error) {
        console.error('Media download error:', error.message);
        throw new Error('Failed to download image from Twilio');
    }
}

async function extractTextFromImage(imageBuffer) {
    try {
        const formData = new FormData();
        formData.append('image', imageBuffer, {
            filename: 'whatsapp-image.jpg',
            contentType: 'image/jpeg'
        });

        const response = await axios.post(`${BACKEND_API}/ocr/extract`, formData, {
            headers: formData.getHeaders(),
            timeout: 30000,
            maxContentLength: 10 * 1024 * 1024
        });

        return response.data;

    } catch (error) {
        console.error('OCR API error:', error.message);

        return {
            success: false,
            text: '',
            confidence: 0,
            error: error.message
        };
    }
}

async function verifyWithBackend(text, userId) {
    try {
        const response = await axios.post(`${BACKEND_API}/verify/dataset`, {
            text: text,
            userId: userId,
            location: null
        }, {
            timeout: 30000
        });

        return response.data;

    } catch (error) {
        console.error('Backend verification error:', error.message);
        throw error;
    }
}






function formatProfessionalResponse(result, additionalNote = '', from = null) {
    if (!result) {
        return formatGenericMessage(
            'Verification Service',
            'Unable to verify at this time. Please check official government sources or trusted news outlets.',
            'SatyaBot Fact-Checking Service'
        );
    }

    const statusLabels = {
        'FAKE': 'MISINFORMATION DETECTED',
        'TRUE': 'VERIFIED AS ACCURATE',
        'UNVERIFIED': 'INSUFFICIENT EVIDENCE',
        'OPINION': 'OPINION / SUBJECTIVE'
    };

    const verdict = statusLabels[result.status] || statusLabels['UNVERIFIED'];

    let report = `VERDICT: ${verdict}\n`;
    if (result.classification) {
        report += `Category: ${result.classification}\n`;
    }
    report += `\n`;

    if (result.core_claim_extracted) {
        report += `CLAIM: ${result.core_claim_extracted}\n\n`;
    }

    if (result.explanation_english) {
        report += `FINDINGS: ${result.explanation_english}\n\n`;
    }

    if (result.explanation_hindi) {
        report += `विवरण (Hindi): ${result.explanation_hindi}\n\n`;
    }

    if (result.suggested_action) {
        report += `ACTION: ${result.suggested_action}\n\n`;
    }

    const hasSources = (result.sources && result.sources.length > 0) || (result.source === 'verified_dataset' && result.fact_check_link);
    if (hasSources) {
        report += `Reply 'sources' to get fact-check references and links.\n\n`;
    }

    if (result.cached) {
        report += `Database: Previously verified claim\n`;
    } else {
        const time = result.processingTime ? `${(result.processingTime / 1000).toFixed(1)}s` : 'N/A';
        report += `Analysis Time: ${time}\n`;
    }

    if (additionalNote) {
        report += additionalNote + '\n';
    }

    if (result.status === 'FAKE') {
        report += `\nALERT: Do not forward this message. Spreading misinformation may have legal consequences under IT Act 2000.`;
    }

    return report.trim();
}

function formatWelcomeMessage() {
    return formatGenericMessage(
        'Welcome to SatyaBot',
        `Your AI-Powered Fact-Checking Service\n\nI can verify:\n• Suspicious text messages\n• WhatsApp forwards\n• News screenshots\n• Social media posts\n\nSimply send me the text or image, and I will analyze it using verified databases and AI.\n\nPowered by: Alt News, Boom Live, PIB Fact Check + Groq AI`,
        'Send any claim to get started'
    );
}

function formatHelpMessage() {
    return formatGenericMessage(
        'How to Use SatyaBot',
        `Send me any of the following:\n\n1. Text message with a claim\n2. Screenshot of news/social media\n3. Forwarded WhatsApp message\n4. Image containing text\n\nI will verify and provide a detailed fact-check report within seconds.`,
        'SatyaBot - Trusted Fact Verification'
    );
}

function formatOcrErrorMessage(error) {
    return formatGenericMessage(
        'Image Processing Failed',
        `Unable to extract text from the image.\n\nPossible reasons:\n• Image is too blurry or low quality\n• Text is too small or unclear\n• Image format not supported\n• No readable text in image\n\nPlease:\n• Send a clearer image\n• Type the text manually\n• Ensure text is clearly visible`,
        `Error: ${error || 'OCR_FAILED'}`
    );
}

function formatLowConfidenceMessage(ocrResult) {
    return formatGenericMessage(
        'Low Text Recognition Confidence',
        `Text was extracted with only ${ocrResult.confidence.toFixed(0)}% confidence.\n\nExtracted Text:\n"${ocrResult.text}"\n\nThis may not be accurate. For reliable verification:\n• Send a clearer image\n• Type the text manually\n• Ensure proper lighting and focus`,
        'Quality threshold not met'
    );
}

function formatImageProcessingError(error) {
    let errorType = 'Unknown error';
    let suggestion = 'Please try again or send text directly.';

    if (error.code === 'ECONNREFUSED') {
        errorType = 'Backend service unavailable';
        suggestion = 'Our OCR service is temporarily down. Please try again in a few minutes.';
    } else if (error.code === 'ETIMEDOUT') {
        errorType = 'Request timeout';
        suggestion = 'Image processing took too long. Try sending a smaller image or type the text.';
    } else if (error.message.includes('download')) {
        errorType = 'Image download failed';
        suggestion = 'Could not download the image. Please try sending it again.';
    }

    return formatGenericMessage(
        'Image Processing Error',
        `${errorType}\n\n${suggestion}`,
        'Technical Support: contact@satyabot.in'
    );
}

function formatSystemError(error) {
    let errorMsg = 'SatyaBot is experiencing technical difficulties. ';

    if (error.code === 'ECONNREFUSED') {
        errorMsg += 'Backend verification service is not reachable. Please try again later.';
    } else if (error.code === 'ETIMEDOUT') {
        errorMsg += 'Request timed out. Please try again with shorter text or clearer image.';
    } else if (error.response) {
        errorMsg += `Service error: ${error.response.status}. Please try again in a few minutes.`;
    } else {
        errorMsg += 'Please try again in a few moments.';
    }

    return formatGenericMessage(
        'Service Temporarily Unavailable',
        errorMsg,
        'We apologize for the inconvenience'
    );
}

function formatGenericMessage(title, body, footer) {
    let msg = '';


        msg += `${title.toUpperCase()}\n`;
    msg += `${body}\n\n`;


        msg += `${footer}\n`;


        return msg;
}






function sendTwiML(res, message) {
    const MAX_LEN = 1500;

    if (message.length <= MAX_LEN) {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
<Message>${escapeXml(message)}</Message>
</Response>`;

        res.set("Content-Type", "text/xml");
        return res.status(200).send(twiml);
    }

    // Split long messages into chunks at paragraph boundaries
    const chunks = splitMessage(message, MAX_LEN);
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>`;
    chunks.forEach(chunk => {
        twiml += `\n<Message>${escapeXml(chunk)}</Message>`;
    });
    twiml += `\n</Response>`;

    res.set("Content-Type", "text/xml");
    res.status(200).send(twiml);
}

function splitMessage(text, maxLen) {
    const chunks = [];
    let remaining = text;

    while (remaining.length > maxLen) {
        let splitAt = remaining.lastIndexOf('\n\n', maxLen);
        if (splitAt <= 0 || splitAt < maxLen * 0.3) {
            splitAt = remaining.lastIndexOf('\n', maxLen);
        }
        if (splitAt <= 0 || splitAt < maxLen * 0.3) {
            splitAt = maxLen;
        }
        chunks.push(remaining.substring(0, splitAt).trim());
        remaining = remaining.substring(splitAt).trim();
    }
    if (remaining.length > 0) {
        chunks.push(remaining.trim());
    }
    return chunks;
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


        console.log('SatyaBot WhatsApp Service');


        console.log(`Server:   http://localhost:${PORT}`);
    console.log(`Webhook:  http://localhost:${PORT}/webhook`);
    console.log(`Health:   http://localhost:${PORT}/health`);
    console.log(`Stats:    http://localhost:${PORT}/stats`);
    console.log(`Backend:  ${BACKEND_API}`);
    console.log(`Twilio:   ${TWILIO_ACCOUNT_SID ? 'Configured ' : 'Not Configured '}`);


    });

process.on('SIGINT', () => {
    console.log('\nShutting down WhatsApp service...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nShutting down WhatsApp service...');
    process.exit(0);
});