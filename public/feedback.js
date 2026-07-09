// Feedback System Controller
const feedbackState = {
  currentSlide: 1,
  data: {
    solved_problem: null,
    building: null,
    goal_description: '',
    missing_feature: '',
    reuse_likelihood: null
  }
};

// Check if feedback already completed or should be skipped
async function checkFeedbackEligibility() {
  if (localStorage.getItem('nexus_feedback_submitted')) {
    return false;
  }
  try {
    const res = await fetch('/api/feedback/check');
    const { alreadySubmitted } = await res.json();
    if (alreadySubmitted) {
      localStorage.setItem('nexus_feedback_submitted', 'true');
      return false;
    }
  } catch (e) {
    console.error('Eligibility check error:', e);
  }
  return true;
}

// Trigger feedback modal (called from app.js on successful workflows)
async function triggerFeedbackModal(goal) {
  const eligible = await checkFeedbackEligibility();
  if (!eligible) return;

  // Prefill the goal description from current input
  feedbackState.data.goal_description = goal || '';
  
  // Show Modal
  const overlay = document.getElementById('feedbackModalOverlay');
  if (overlay) {
    overlay.classList.add('active');
    renderSlide(1);
  }
}

// Close Modal
function closeFeedbackModal() {
  const overlay = document.getElementById('feedbackModalOverlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
  // Store skip flag in localStorage so it doesn't pop up again this session
  localStorage.setItem('nexus_feedback_submitted', 'true');
}

// Select Solved (Thumbs Up / Down)
function selectSolved(solved) {
  feedbackState.data.solved_problem = solved;
  document.querySelectorAll('.thumb-btn').forEach(btn => btn.classList.remove('selected'));
  if (solved) {
    document.getElementById('thumbUp').classList.add('selected');
  } else {
    document.getElementById('thumbDown').classList.add('selected');
  }
  document.getElementById('feedbackNextBtn').disabled = false;
}

// Select building segment
function selectBuilding(buildingType, element) {
  feedbackState.data.building = buildingType;
  document.querySelectorAll('.pill-option').forEach(el => el.classList.remove('selected'));
  element.classList.add('selected');
  document.getElementById('feedbackNextBtn').disabled = false;
}

// Select likelihood score
function selectRating(score) {
  feedbackState.data.reuse_likelihood = score;
  document.querySelectorAll('.rating-btn').forEach(btn => btn.classList.remove('selected'));
  document.getElementById(`rating-${score}`).classList.add('selected');
  document.getElementById('feedbackNextBtn').disabled = false;
}

// Slide Navigation
function renderSlide(slideNum) {
  feedbackState.currentSlide = slideNum;
  
  // Hide all slides
  document.querySelectorAll('.feedback-slide').forEach(s => s.classList.remove('active'));
  
  // Show active slide
  const activeSlide = document.getElementById(`feedbackSlide${slideNum}`);
  if (activeSlide) activeSlide.classList.add('active');

  // Update dots
  document.querySelectorAll('.feedback-dot').forEach((dot, index) => {
    if (index + 1 === slideNum) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });

  // Enable/Disable next button based on step completion
  const nextBtn = document.getElementById('feedbackNextBtn');
  nextBtn.innerText = slideNum === 5 ? 'Submit' : 'Next';
  
  if (slideNum === 1) {
    nextBtn.disabled = feedbackState.data.solved_problem === null;
  } else if (slideNum === 2) {
    nextBtn.disabled = feedbackState.data.building === null;
  } else if (slideNum === 3) {
    nextBtn.disabled = false; // Goal prefilled, user can hit next
    const textarea = document.getElementById('wfFeedbackGoal');
    if (textarea) textarea.value = feedbackState.data.goal_description;
  } else if (slideNum === 4) {
    nextBtn.disabled = false; // Optional field
  } else if (slideNum === 5) {
    nextBtn.disabled = feedbackState.data.reuse_likelihood === null;
  }
}

// Go to next step / submit
async function handleNextStep() {
  const current = feedbackState.currentSlide;

  if (current === 3) {
    const val = document.getElementById('wfFeedbackGoal').value.trim();
    feedbackState.data.goal_description = val;
  } else if (current === 4) {
    const val = document.getElementById('wfFeedbackExpect').value.trim();
    feedbackState.data.missing_feature = val;
  }

  if (current < 5) {
    renderSlide(current + 1);
  } else {
    // Submit feedback
    await submitFeedback();
  }
}

// POST feedback to REST API
async function submitFeedback() {
  const nextBtn = document.getElementById('feedbackNextBtn');
  nextBtn.disabled = true;
  nextBtn.innerText = 'Sending...';

  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedbackState.data)
    });

    if (res.ok) {
      localStorage.setItem('nexus_feedback_submitted', 'true');
      
      // Show thank you screen
      const slidesContainer = document.querySelector('.feedback-slides-container');
      slidesContainer.innerHTML = `
        <div class="feedback-slide active" style="text-align: center;">
          <h3 style="color: #10B981; font-size: 24px; margin-bottom: 16px;">Thank You! 🙌</h3>
          <p style="font-size: 14px; line-height: 1.6;">Your feedback helps us decide what features to build next. Good luck with your startup!</p>
          <button class="feedback-next-btn" onclick="closeFeedbackModal()" style="margin: 0 auto; display: block; margin-top: 12px;">Close</button>
        </div>
      `;
      // Hide next button row
      document.querySelector('.feedback-nav-row').style.display = 'none';
    } else {
      throw new Error('Failed to submit');
    }
  } catch (err) {
    console.error('Feedback submission failed:', err);
    nextBtn.disabled = false;
    nextBtn.innerText = 'Submit';
    alert('Oops! Feedback submission failed. Please try again.');
  }
}
