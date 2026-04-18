document.addEventListener("DOMContentLoaded", () => {
  const claimInput = document.getElementById("claimInput");
  const verifyBtn = document.getElementById("verifyBtn");
  const btnText = verifyBtn.querySelector('.btn-text');
  const resultContainer = document.getElementById("resultContainer");
  const errorContainer = document.getElementById("errorContainer");
  
  const statusLabel = document.getElementById("statusLabel");
  const credScore = document.getElementById("credScore");
  const explanationText = document.getElementById("explanationText");
  const suggestedAction = document.getElementById("suggestedAction");
  const statusBanner = document.querySelector('.status-banner');
  const sourceCount = document.getElementById("sourceCount");
  const sourcesList = document.getElementById("sourcesList");
  const tabs = document.querySelectorAll('.tab-btn');

  let currentExplanations = {
    en: "",
    hi: ""
  };

  verifyBtn.addEventListener("click", async () => {
    const claim = claimInput.value.trim();
    if (!claim) return;

    errorContainer.style.display = "none";
    resultContainer.style.display = "none";
    
    btnText.textContent = "Analyzing...";
    verifyBtn.disabled = true;

    try {
      const data = await verifyText(claim, { userId: 'extension_popup' });
      
      const status = data.status || "UNVERIFIED";
      const score = data.confidence_score || 0;
      
      currentExplanations.en = data.explanation_english || data.explanation || "No explanation provided.";
      currentExplanations.hi = data.explanation_hindi || currentExplanations.en;

      statusBanner.className = "status-banner";
      if (status === "TRUE") statusBanner.classList.add("status-true");
      else if (status === "FAKE") statusBanner.classList.add("status-fake");
      else statusBanner.classList.add("status-unverified");

      statusLabel.textContent = status;
      
      const activeTab = document.querySelector('.tab-btn.active').dataset.lang;
      explanationText.textContent = currentExplanations[activeTab];
      suggestedAction.textContent = data.suggested_action || "Wait for official verification.";

      sourcesList.innerHTML = '';
      const sources = data.sources || [];
      sourceCount.textContent = sources.length;

      if (sources.length === 0) {
        sourcesList.innerHTML = '<div style="color:#64748b; font-size:12px; text-align:center; padding: 10px;">No specific sources found.</div>';
      } else {
        sources.forEach(src => {
          const a = document.createElement('a');
          a.className = 'source-card';
          a.href = src.url;
          a.target = '_blank';
          
          a.innerHTML = `
            <div class="source-header">
              <span class="source-title" title="${src.title}">${src.title}</span>
              <span class="tier-badge tier-${src.credibilityTier || 'low'}">${src.credibilityTier || 'low'}</span>
            </div>
            <div class="source-meta">${src.source}</div>
          `;
          sourcesList.appendChild(a);
        });
      }

      resultContainer.style.display = "flex";

      // Animate the confidence score count-up
      setTimeout(() => {
        animateValue(credScore, 0, score, 800);
      }, 50);

    } catch (error) {
      console.error("Verification Error:", error);
      errorContainer.querySelector('.error-msg').textContent = "Error connecting to SatyaBot server.";
      errorContainer.style.display = "block";
    } finally {
      btnText.textContent = "Verify Claim";
      verifyBtn.disabled = false;
    }
  });

  // Tab switching logic
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      explanationText.textContent = currentExplanations[tab.dataset.lang];
    });
  });

  // Number animation utility
  function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      obj.innerHTML = Math.floor(progress * (end - start) + start);
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }
});