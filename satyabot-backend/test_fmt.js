const webhook = require('./src/controllers/webhookController');
const res = {
  status: 'TRUE',
  confidence_score: 95,
  core_claim_extracted: 'Claim text 123',
  explanation_english: 'This is the explanation',
  suggested_action: 'Share it',
  source: 'verified_dataset'
};
console.log("=== WA ===");
console.log(webhook._formatWhatsAppResponse(res));
console.log("=== TG ===");
console.log(webhook._formatTelegramResponse(res));
