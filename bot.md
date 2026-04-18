Act as an expert Backend/AI developer. I am building "SatyaBot," a WhatsApp fact-checking bot for an Indian hackathon. I am using Node.js, Express, the Twilio WhatsApp API, and the Google Gemini API.

I need a complete, production-ready `server.js` file that handles the Twilio webhook endpoint (`POST /webhook`). 

Here are the strict requirements for the code:

1. Setup & Config:
- Use `express` and `dotenv`.
- Use `express.urlencoded({ extended: true })` to parse Twilio payloads.
- Initialize the `@google/generative-ai` SDK using the `gemini-1.5-flash` model (crucial for speed and multimodal capabilities).

2. Incoming Request Handling:
- Extract the user's text message from `req.body.Body`.
- Check if the user sent an image by checking `req.body.NumMedia` > 0. If they did, extract the image URL from `req.body.MediaUrl0`.

3. Pre-filtering (Cost Saving):
- If the incoming text is just simple greetings like "hi", "hello", or "help" (and has no image), immediately return a TwiML response: "Namaste! I am SatyaBot 🛡️. Forward me any suspicious news, rumor, or image, and I will verify it for you." Do NOT call the Gemini API for this.

4. The AI Fact-Check Engine (Text & Image):
- If the request passes the pre-filter, construct a prompt for Gemini. 
- System Instruction for Gemini: "You are SatyaBot, a highly accurate fact-checker for India. Analyze the following text (and image if provided). Determine if the claim is TRUE, FAKE, or UNVERIFIED. Keep your response under 400 characters. Use WhatsApp formatting (e.g., *bold* for headings) and emojis. Structure your reply strictly as: \n*Status:* [🔴 FAKE / 🟢 TRUE / 🟡 UNVERIFIED]\n*Fact Check:* [Brief explanation in simple English/Hinglish]."
- If there is a `MediaUrl0` (an image), use `axios` to fetch the image from the Twilio URL as an arraybuffer, convert it to a base64 string, and pass it to Gemini along with the text prompt using the standard `inlineData` format required by the SDK. (Note: Twilio media URLs do not require auth tokens for basic sandbox fetching).
- If it's just text, send just the text to Gemini.

5. Twilio TwiML Response:
- Await the Gemini AI response text.
- Wrap the AI's response properly in standard Twilio XML format: `<Response><Message>...</Message></Response>`.
- Set the `Content-Type` header to `text/xml`.

6. Error Handling:
- Wrap the entire AI execution in a `try/catch` block.
- If the API times out or fails, return a fallback TwiML message: "⚠️ SatyaBot is experiencing heavy traffic right now. Please try again in a few minutes."

Output the complete, well-commented `server.js` code. Also, provide the exact `npm install` command needed for the required dependencies (`express`, `dotenv`, `@google/generative-ai`, `axios`).