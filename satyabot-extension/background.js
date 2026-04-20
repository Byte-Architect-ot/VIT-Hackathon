importScripts("utils/api.js");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "satyabot-verify",
    title: "Verify claim with SatyaBot",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "satyabot-verify") {
    const selectedText = info.selectionText;

        chrome.notifications.create("satyabot-loading", {
      type: "basic",
      iconUrl: "assets/icon48.png", 
      title: "SatyaBot Verifying...",
      message: `Analyzing: "${selectedText.substring(0, 50)}..."`
    });

    try {
      const data = await verifyText(selectedText, { userId: 'extension_context' });
      const status = data.status || "UNVERIFIED";
      const explanation = data.explanation_english || data.explanation || "No explanation provided.";
      const score = data.confidence_score || 0;

            let emoji = "";
      if (status === "TRUE") emoji = "";
      else if (status === "FAKE") emoji = "";

      chrome.notifications.clear("satyabot-loading");

            chrome.notifications.create({
        type: "basic",
        iconUrl: "assets/icon48.png", 
        title: `${emoji} SatyaBot: ${status} (Score: ${score})`,
        message: explanation
      });

    } catch (error) {
      chrome.notifications.clear("satyabot-loading");
      chrome.notifications.create({
        type: "basic",
        iconUrl: "assets/icon48.png",
        title: "SatyaBot Error",
        message: "Backend is down or unreachable."
      });
    }
  }
});