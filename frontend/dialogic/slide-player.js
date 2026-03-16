/**
 * Dialogic Slide Player — Reveal.js + TTS audio + closed captions + Q&A
 *
 * Generalised from the aima lecture.js player. Works with any presentation
 * built by SlideBuilder.
 *
 * Expects: window.DIALOGIC_DATA = { slides: [{ script, audio, vtt, question? }], ... }
 *
 * Public API: window.dialogicPlayer
 *   raiseHand()            — signal a question; pauses at end of current slide
 *   submitQuestion(text)   — submit a question to the Q&A API
 *   cancelQuestion()       — lower hand, close panel, resume
 *   answerStudentQuestion(text) — answer a professor-posed question
 *   skipStudentQuestion()  — skip the current student question
 *   onQuestionSubmitted(cb)
 *   getTranscript()        — full transcript (slides + fullText)
 *   getCurrentTranscript() — current slide script + optional adjacent context
 *   getJustSaid()          — what's currently being spoken
 */
(function () {
  'use strict';

  const audioEl = document.getElementById('slide-audio');
  const captionsEl = document.getElementById('captions');
  if (!audioEl || !captionsEl) return;

  // ── State ──

  let handRaised = false;
  let questionSubmittedCallbacks = [];
  let vttCues = [];
  let displayedWords = [];
  let lastCueIndex = -1;
  let totalSeconds = null;
  let slideTargetSeconds = [];

  // ── VTT Captions ──

  async function loadVTT(url) {
    if (!url) return [];
    try {
      const res = await fetch(url);
      return parseVTT(await res.text());
    } catch { return []; }
  }

  function parseVTT(text) {
    const cues = [];
    const blocks = text.split(/\n\n+/);
    const timeRe = /(\d{2}:\d{2}(?::\d{2})?\.\d{3})\s*-->\s*(\d{2}:\d{2}(?::\d{2})?\.\d{3})\s*\n([\s\S]*?)(?=\n\n|$)/;
    for (const block of blocks) {
      const m = block.match(timeRe);
      if (m) cues.push({ start: vttTimeMs(m[1]), end: vttTimeMs(m[2]), text: (m[3] || '').trim() });
    }
    return cues;
  }

  function vttTimeMs(vtt) {
    const p = vtt.split(/[:.]/).map(Number);
    if (p.length === 4) return (p[0] * 3600 + p[1] * 60 + p[2]) * 1000 + p[3];
    if (p.length === 3) return (p[0] * 60 + p[1]) * 1000 + p[2];
    return 0;
  }

  function updateCaptions(ms) {
    const idx = vttCues.findIndex(c => ms >= c.start && ms < c.end);

    if (idx === -1) {
      if (ms > 0 && vttCues.length && ms > vttCues[vttCues.length - 1].end) {
        captionsEl.textContent = '';
        displayedWords = [];
        lastCueIndex = -1;
      }
      return;
    }

    const cue = vttCues[idx];

    if (vttCues.length === 1) {
      if (captionsEl.textContent !== cue.text) {
        captionsEl.textContent = cue.text;
        dispatchCaption(cue.text);
      }
      return;
    }

    if (idx < lastCueIndex) displayedWords = [];

    if (idx !== lastCueIndex) {
      const prevCue = lastCueIndex >= 0 ? vttCues[lastCueIndex] : null;
      const prevSentenceEnd = prevCue?.text.includes('|SENTENCE_END');
      const word = cue.text.replace('|SENTENCE_END', '');

      if (prevSentenceEnd) displayedWords = [word];
      else displayedWords.push(word);

      lastCueIndex = idx;
      const text = displayedWords.join(' ');
      if (captionsEl.textContent !== text) {
        captionsEl.textContent = text;
        dispatchCaption(text);
      }
    }
  }

  function dispatchCaption(text) {
    window.dispatchEvent(new CustomEvent('dialogic-caption', { detail: { text } }));
  }

  // ── Time / Progress ──

  const timeEl = document.getElementById('time-display');
  const progressFillEl = document.getElementById('progress-fill');

  function fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function cumulativeOffset(slideIndex) {
    if (slideTargetSeconds.length > 0 && slideIndex > 0) {
      return slideTargetSeconds.slice(0, slideIndex).reduce((a, b) => a + b, 0);
    }
    const per = window.DIALOGIC_DATA?.targetSecondsPerSlide ?? 60;
    return slideIndex * per;
  }

  function lecturePosition() {
    const si = typeof Reveal !== 'undefined' ? Reveal.getIndices().h : 0;
    const offset = cumulativeOffset(si);
    const at = (audioEl.src && !isNaN(audioEl.currentTime)) ? audioEl.currentTime : 0;
    return Math.floor(offset + at);
  }

  function positionToSlide(target) {
    const total = totalSeconds ?? (window.DIALOGIC_DATA?.durationMinutes ? window.DIALOGIC_DATA.durationMinutes * 60 : 3600);
    const sec = Math.max(0, Math.min(target, total));
    const n = slideTargetSeconds.length || window.DIALOGIC_DATA?.slides?.length || 1;
    const per = window.DIALOGIC_DATA?.targetSecondsPerSlide ?? 60;
    let cum = 0;
    for (let i = 0; i < n; i++) {
      const dur = slideTargetSeconds[i] ?? per;
      if (cum + dur >= sec || i === n - 1) return { slideIndex: i, offsetInSlide: Math.max(0, sec - cum) };
      cum += dur;
    }
    return { slideIndex: 0, offsetInSlide: 0 };
  }

  async function seekTo(targetSec) {
    const data = window.DIALOGIC_DATA;
    if (!data?.slides?.length || typeof Reveal === 'undefined') return;
    audioEl.pause();
    const { slideIndex, offsetInSlide } = positionToSlide(targetSec);
    Reveal.slide(slideIndex, 0);
    await loadSlideAudio(slideIndex, { autoplay: false });
    const setTime = () => {
      if (audioEl.src && offsetInSlide >= 0) {
        const max = (audioEl.duration && !isNaN(audioEl.duration)) ? audioEl.duration : offsetInSlide;
        audioEl.currentTime = Math.min(offsetInSlide, max);
      }
    };
    setTime();
    audioEl.addEventListener('loadedmetadata', setTime, { once: true });
    updateSlideNumber();
    updateTimeDisplay();
  }

  function updateTimeDisplay() {
    if (!timeEl) return;
    const total = totalSeconds ?? (window.DIALOGIC_DATA?.durationMinutes ? window.DIALOGIC_DATA.durationMinutes * 60 : 3600);
    const elapsed = lecturePosition();
    const left = Math.max(0, total - elapsed);
    const pct = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0;
    timeEl.textContent = `${fmt(elapsed)} / ${fmt(total)} \u00b7 ${fmt(left)} left`;
    if (progressFillEl) progressFillEl.style.width = `${pct}%`;
    const track = document.querySelector('.progress-track');
    if (track) track.setAttribute('aria-valuenow', Math.round(pct));
  }

  // ── Controls ──

  function initControls() {
    const playBtn = document.getElementById('btn-play');
    const pauseBtn = document.getElementById('btn-pause');
    const replayBtn = document.getElementById('btn-replay');
    const raiseBtn = document.getElementById('btn-raise-hand');
    const captionsToggle = document.getElementById('captions-toggle');
    const startOverBtn = document.getElementById('btn-start-over');
    const track = document.querySelector('.progress-track');

    updateTimeDisplay();

    if (track) {
      track.style.cursor = 'pointer';
      track.addEventListener('click', (e) => {
        const total = totalSeconds ?? (window.DIALOGIC_DATA?.durationMinutes ? window.DIALOGIC_DATA.durationMinutes * 60 : 3600);
        if (total <= 0) return;
        const rect = track.getBoundingClientRect();
        seekTo(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * total);
      });
    }

    if (startOverBtn) startOverBtn.addEventListener('click', () => seekTo(0));

    if (playBtn) playBtn.addEventListener('click', () => {
      if (audioEl.src && audioEl.src !== window.location.href) {
        audioEl.play().catch(() => {});
      } else {
        const si = typeof Reveal !== 'undefined' ? Reveal.getIndices().h : 0;
        const slide = window.DIALOGIC_DATA?.slides?.[si];
        if (slide?.script) {
          if ('speechSynthesis' in window && window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          } else {
            fallbackToTTS(slide, si, {});
          }
        }
      }
      playBtn.classList.add('active');
      pauseBtn?.classList.remove('active');
    });

    if (pauseBtn) pauseBtn.addEventListener('click', () => {
      audioEl.pause();
      if (ttsActive && 'speechSynthesis' in window) window.speechSynthesis.pause();
      pauseBtn.classList.add('active');
      playBtn?.classList.remove('active');
    });

    if (replayBtn) replayBtn.addEventListener('click', () => {
      stopTTS();
      if (audioEl.src && audioEl.src !== window.location.href) {
        audioEl.currentTime = 0;
        audioEl.play().catch(() => {});
      } else {
        const si = typeof Reveal !== 'undefined' ? Reveal.getIndices().h : 0;
        const slide = window.DIALOGIC_DATA?.slides?.[si];
        if (slide?.script) fallbackToTTS(slide, si, {});
      }
      playBtn?.classList.add('active');
      pauseBtn?.classList.remove('active');
    });

    if (captionsToggle) {
      captionsToggle.addEventListener('change', () => {
        captionsEl.style.visibility = captionsToggle.checked ? 'visible' : 'hidden';
      });
    }

    audioEl.addEventListener('play', () => {
      playBtn?.classList.add('active');
      pauseBtn?.classList.remove('active');
      updateTimeDisplay();
    });

    audioEl.addEventListener('pause', () => {
      playBtn?.classList.remove('active');
      pauseBtn?.classList.add('active');
      updateTimeDisplay();
    });

    audioEl.addEventListener('ended', () => {
      playBtn?.classList.remove('active');
      pauseBtn?.classList.remove('active');
      captionsEl.textContent = '';

      if (handRaised) {
        showQuestionPanel();
        handRaised = false;
        raiseBtn?.classList.remove('active');
      } else {
        const si = typeof Reveal !== 'undefined' ? Reveal.getIndices().h : 0;
        const slideData = window.DIALOGIC_DATA?.slides?.[si];
        if (slideData?.question) {
          showStudentQuestion(slideData.question);
        } else if (typeof Reveal !== 'undefined' && !Reveal.isLastSlide()) {
          Reveal.next();
        }
      }
    });

    if (raiseBtn) raiseBtn.addEventListener('click', () => {
      handRaised = true;
      raiseBtn.classList.add('active');
      if (!audioEl.src || audioEl.ended || audioEl.paused) {
        audioEl.pause();
        showQuestionPanel();
        handRaised = false;
        raiseBtn.classList.remove('active');
      }
      window.dispatchEvent(new CustomEvent('dialogic-hand-raised'));
    });
  }

  // ── Question Panel (student asks professor) ──

  function speakPrompt(text) {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text || 'Question?');
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    }
  }

  function showQuestionPanel() {
    const panel = document.getElementById('question-panel');
    const input = document.getElementById('question-input');
    const answerEl = document.getElementById('question-answer');
    if (panel && input) {
      input.value = '';
      if (answerEl) { answerEl.hidden = true; answerEl.textContent = ''; }
      panel.hidden = false;
      input.focus();
      speakPrompt('Question?');
      window.dispatchEvent(new CustomEvent('dialogic-question-panel-opened'));
    }
  }

  function hideQuestionPanel() {
    const panel = document.getElementById('question-panel');
    if (panel) {
      panel.hidden = true;
      window.dispatchEvent(new CustomEvent('dialogic-question-panel-closed'));
    }
  }

  async function submitQuestion(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    const detail = { question: trimmed, slideIndex: typeof Reveal !== 'undefined' ? Reveal.getIndices().h : 0 };
    window.dispatchEvent(new CustomEvent('dialogic-question-submitted', { detail }));
    questionSubmittedCallbacks.forEach(cb => cb(trimmed, detail));

    const historyEl = document.getElementById('question-history');
    const input = document.getElementById('question-input');
    const submitBtn = document.getElementById('question-submit');

    if (historyEl) {
      const qDiv = document.createElement('div');
      qDiv.className = 'question-item';
      qDiv.textContent = trimmed;
      historyEl.appendChild(qDiv);

      const aDiv = document.createElement('div');
      aDiv.className = 'answer-item loading';
      aDiv.innerHTML = 'Thinking<span class="loading-dots"></span>';
      let dotCount = 0;
      const dotsInterval = setInterval(() => {
        const dots = aDiv.querySelector('.loading-dots');
        if (dots) { dotCount = (dotCount + 1) % 4; dots.textContent = '.'.repeat(dotCount); }
      }, 500);
      aDiv.dataset.dotsInterval = dotsInterval;
      historyEl.appendChild(aDiv);
      historyEl.scrollTop = historyEl.scrollHeight;
    }

    if (input) input.disabled = true;
    if (submitBtn) submitBtn.disabled = true;

    const context = {};
    if (window.dialogicPlayer) {
      const justSaid = window.dialogicPlayer.getJustSaid();
      context.slideScript = justSaid.slideScript || '';
      context.justSaid = justSaid.text || '';
      const transcript = window.dialogicPlayer.getTranscript();
      context.transcript = transcript.fullText?.slice(-3000) || '';
    }

    const apiUrl = window.DIALOGIC_DATA?.apiUrl || '/api/answer-question';

    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, context, stream: true }),
      });

      if (res.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullAnswer = '';

        const answerDivs = historyEl?.querySelectorAll('.answer-item');
        const lastAnswer = answerDivs?.[answerDivs.length - 1];
        if (lastAnswer) {
          if (lastAnswer.dataset.dotsInterval) clearInterval(parseInt(lastAnswer.dataset.dotsInterval));
          lastAnswer.classList.remove('loading');
          lastAnswer.textContent = '';
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const d = line.slice(6);
              if (d === '[DONE]') break;
              try {
                const parsed = JSON.parse(d);
                if (parsed.delta) {
                  fullAnswer += parsed.delta;
                  if (lastAnswer) { lastAnswer.textContent = fullAnswer; historyEl.scrollTop = historyEl.scrollHeight; }
                }
              } catch {}
            }
          }
        }
      } else {
        const data = await res.json();
        if (historyEl) {
          const answerDivs = historyEl.querySelectorAll('.answer-item');
          const lastAnswer = answerDivs[answerDivs.length - 1];
          if (lastAnswer) {
            if (lastAnswer.dataset.dotsInterval) clearInterval(parseInt(lastAnswer.dataset.dotsInterval));
            lastAnswer.classList.remove('loading');
            lastAnswer.textContent = data.answer || data.error || "Couldn't generate an answer.";
            historyEl.scrollTop = historyEl.scrollHeight;
          }
        }
      }
    } catch {
      if (historyEl) {
        const answerDivs = historyEl.querySelectorAll('.answer-item');
        const lastAnswer = answerDivs[answerDivs.length - 1];
        if (lastAnswer) {
          if (lastAnswer.dataset.dotsInterval) clearInterval(parseInt(lastAnswer.dataset.dotsInterval));
          lastAnswer.classList.remove('loading');
          lastAnswer.textContent = 'Answer service unavailable. Use Play to resume.';
        }
      }
    }

    if (input) input.disabled = false;
    if (submitBtn) submitBtn.disabled = false;
  }

  function initQuestionPanel() {
    const input = document.getElementById('question-input');
    const closeBtn = document.getElementById('question-panel-close');
    const submitBtn = document.getElementById('question-submit');
    const sttBtn = document.getElementById('question-stt');

    if (!input) return;

    if (closeBtn) closeBtn.addEventListener('click', () => {
      hideQuestionPanel();
      handRaised = false;
      document.getElementById('btn-raise-hand')?.classList.remove('active');
    });

    if (submitBtn) submitBtn.addEventListener('click', () => submitQuestion(input.value));

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitQuestion(input.value); }
    });

    if (sttBtn && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SR();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      sttBtn.addEventListener('click', () => {
        if (recognition.listening) { recognition.stop(); return; }
        sttBtn.classList.add('recording');
        recognition.start();
      });
      recognition.onresult = (e) => {
        const last = e.results.length - 1;
        if (e.results[last].isFinal) {
          input.value = (input.value + (input.value ? ' ' : '') + e.results[last][0].transcript).trim();
        }
      };
      recognition.onend = () => sttBtn.classList.remove('recording');
      recognition.onerror = () => sttBtn.classList.remove('recording');
    } else if (sttBtn) {
      sttBtn.title = 'Voice input not supported';
      sttBtn.disabled = true;
    }
  }

  // ── Student Question Panel (professor asks student) ──

  function showStudentQuestion(question) {
    const panel = document.getElementById('student-question-panel');
    const promptEl = document.getElementById('student-question-prompt');
    const choicesEl = document.getElementById('student-question-choices');
    const answerInput = document.getElementById('student-answer-input');
    const feedbackEl = document.getElementById('student-question-feedback');

    if (!panel || !promptEl) return;

    promptEl.textContent = question.prompt || '';
    choicesEl.innerHTML = '';
    if (answerInput) answerInput.value = '';
    if (feedbackEl) { feedbackEl.hidden = true; feedbackEl.textContent = ''; }

    if (question.choices?.length) {
      answerInput.hidden = true;
      for (const choice of question.choices) {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.textContent = choice;
        btn.addEventListener('click', () => handleStudentAnswer(choice, question));
        choicesEl.appendChild(btn);
      }
    } else {
      answerInput.hidden = false;
    }

    panel.hidden = false;
    speakPrompt(question.prompt);

    window.dispatchEvent(new CustomEvent('dialogic-student-question', { detail: question }));
  }

  function handleStudentAnswer(answer, question) {
    const feedbackEl = document.getElementById('student-question-feedback');
    if (!feedbackEl) return;

    const isCorrect = question.answer && answer.trim().toLowerCase() === question.answer.trim().toLowerCase();

    if (question.answer) {
      feedbackEl.textContent = isCorrect
        ? (question.explanation || 'Correct!')
        : `Not quite. The answer is: ${question.answer}. ${question.explanation || ''}`;
      feedbackEl.className = `student-question-feedback ${isCorrect ? 'correct' : 'incorrect'}`;
    } else {
      feedbackEl.textContent = question.explanation || 'Thank you for your response.';
      feedbackEl.className = 'student-question-feedback';
    }

    feedbackEl.hidden = false;

    window.dispatchEvent(new CustomEvent('dialogic-student-answer', {
      detail: { answer, question, isCorrect }
    }));

    setTimeout(() => {
      hideStudentQuestion();
      if (typeof Reveal !== 'undefined' && !Reveal.isLastSlide()) Reveal.next();
    }, 3000);
  }

  function hideStudentQuestion() {
    const panel = document.getElementById('student-question-panel');
    if (panel) panel.hidden = true;
  }

  function initStudentQuestionPanel() {
    const submitBtn = document.getElementById('student-answer-submit');
    const skipBtn = document.getElementById('student-question-skip');
    const answerInput = document.getElementById('student-answer-input');

    if (submitBtn && answerInput) {
      submitBtn.addEventListener('click', () => {
        const si = typeof Reveal !== 'undefined' ? Reveal.getIndices().h : 0;
        const q = window.DIALOGIC_DATA?.slides?.[si]?.question;
        if (q) handleStudentAnswer(answerInput.value, q);
      });
    }

    if (skipBtn) skipBtn.addEventListener('click', () => {
      hideStudentQuestion();
      if (typeof Reveal !== 'undefined' && !Reveal.isLastSlide()) Reveal.next();
    });

    if (answerInput) answerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitBtn?.click();
      }
    });
  }

  // ── Browser TTS fallback ──

  let currentUtterance = null;
  let ttsActive = false;

  function stopTTS() {
    ttsActive = false;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    currentUtterance = null;
  }

  function speakScript(text, onEnd) {
    if (!text || !('speechSynthesis' in window)) { if (onEnd) onEnd(); return; }
    stopTTS();
    ttsActive = true;
    const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    let sentenceIdx = 0;

    function speakNext() {
      if (!ttsActive || sentenceIdx >= sentences.length) {
        ttsActive = false;
        currentUtterance = null;
        if (onEnd) onEnd();
        return;
      }
      const u = new SpeechSynthesisUtterance(sentences[sentenceIdx].trim());
      u.rate = 1.0;
      u.pitch = 1.0;
      currentUtterance = u;
      u.onboundary = (e) => {
        if (e.name === 'word') {
          const spoken = sentences[sentenceIdx].substring(0, e.charIndex + e.charLength);
          captionsEl.textContent = spoken.trim();
        }
      };
      u.onstart = () => {
        captionsEl.textContent = sentences[sentenceIdx].trim();
      };
      u.onend = () => {
        sentenceIdx++;
        speakNext();
      };
      u.onerror = () => {
        sentenceIdx++;
        speakNext();
      };
      window.speechSynthesis.speak(u);
    }

    speakNext();
  }

  // ── Audio Loading ──

  async function loadSlideAudio(idx, opts = {}) {
    const data = window.DIALOGIC_DATA;
    stopTTS();
    if (!data?.slides?.[idx]) {
      audioEl.src = '';
      audioEl.pause();
      vttCues = [];
      displayedWords = [];
      lastCueIndex = -1;
      captionsEl.textContent = '';
      return;
    }
    const slide = data.slides[idx];
    audioEl.pause();

    if (slide.script && slide.audio) {
      try {
        const probe = await fetch(slide.audio, { method: 'HEAD' });
        if (!probe.ok) throw new Error('not found');
        audioEl.src = slide.audio;
        vttCues = slide.vtt ? await loadVTT(slide.vtt) : [];
        displayedWords = [];
        lastCueIndex = -1;
        captionsEl.textContent = '';
        if (opts.autoplay !== false) {
          audioEl.play().catch(() => fallbackToTTS(slide, idx, opts));
        }
        return;
      } catch {
        // Audio file not available, fall back to browser TTS
      }
    }

    audioEl.src = '';
    vttCues = [];
    displayedWords = [];
    lastCueIndex = -1;

    if (slide.script && opts.autoplay !== false) {
      fallbackToTTS(slide, idx, opts);
    } else {
      captionsEl.textContent = '';
    }
  }

  function fallbackToTTS(slide, slideIdx, opts) {
    const playBtn = document.getElementById('btn-play');
    const pauseBtn = document.getElementById('btn-pause');
    playBtn?.classList.add('active');
    pauseBtn?.classList.remove('active');

    speakScript(slide.script, () => {
      playBtn?.classList.remove('active');
      pauseBtn?.classList.remove('active');
      captionsEl.textContent = '';

      if (handRaised) {
        showQuestionPanel();
        handRaised = false;
        document.getElementById('btn-raise-hand')?.classList.remove('active');
      } else {
        const slideData = window.DIALOGIC_DATA?.slides?.[slideIdx];
        if (slideData?.question) {
          showStudentQuestion(slideData.question);
        } else if (typeof Reveal !== 'undefined' && !Reveal.isLastSlide()) {
          Reveal.next();
        }
      }
    });
  }

  function updateSlideNumber() {
    const el = document.getElementById('slide-number');
    if (!el || typeof Reveal === 'undefined') return;
    el.textContent = `${Reveal.getIndices().h + 1} / ${Reveal.getTotalSlides()}`;
  }

  // ── Public API ──

  window.dialogicPlayer = {
    raiseHand() {
      handRaised = true;
      document.getElementById('btn-raise-hand')?.classList.add('active');
      window.dispatchEvent(new CustomEvent('dialogic-hand-raised'));
    },
    submitQuestion: (text) => submitQuestion(text),
    cancelQuestion() {
      handRaised = false;
      hideQuestionPanel();
      document.getElementById('btn-raise-hand')?.classList.remove('active');
    },
    answerStudentQuestion(text) {
      const si = typeof Reveal !== 'undefined' ? Reveal.getIndices().h : 0;
      const q = window.DIALOGIC_DATA?.slides?.[si]?.question;
      if (q) handleStudentAnswer(text, q);
    },
    skipStudentQuestion() {
      hideStudentQuestion();
      if (typeof Reveal !== 'undefined' && !Reveal.isLastSlide()) Reveal.next();
    },
    onQuestionSubmitted(cb) { if (typeof cb === 'function') questionSubmittedCallbacks.push(cb); },
    getState() {
      return {
        handRaised,
        slideIndex: typeof Reveal !== 'undefined' ? Reveal.getIndices().h : 0,
        isPlaying: !audioEl.paused && !!audioEl.src,
      };
    },
    getTranscript() {
      const data = window.DIALOGIC_DATA;
      if (!data?.slides?.length) return { slides: [], fullText: '' };
      const slides = data.slides.map((s, i) => ({ index: i, script: s.script || '' }));
      return { slides, fullText: slides.map(s => s.script).filter(Boolean).join('\n\n') };
    },
    getCurrentTranscript(includeAdjacent = false) {
      const data = window.DIALOGIC_DATA;
      const idx = typeof Reveal !== 'undefined' ? Reveal.getIndices().h : 0;
      const slide = data?.slides?.[idx];
      if (!slide) return { slideIndex: idx, script: '' };
      const result = { slideIndex: idx, script: slide.script || '' };
      if (includeAdjacent) {
        result.previousScript = idx > 0 ? data.slides[idx - 1]?.script || null : null;
        result.nextScript = idx < data.slides.length - 1 ? data.slides[idx + 1]?.script || null : null;
      }
      return result;
    },
    getJustSaid() {
      const idx = typeof Reveal !== 'undefined' ? Reveal.getIndices().h : 0;
      const ms = audioEl?.currentTime != null ? audioEl.currentTime * 1000 : 0;
      const cue = vttCues.find(c => ms >= c.start && ms < c.end);
      const slide = window.DIALOGIC_DATA?.slides?.[idx];
      return { text: cue?.text ?? captionsEl?.textContent ?? '', slideIndex: idx, slideScript: slide?.script ?? '' };
    },
  };

  // postMessage API for iframe / extension integration
  window.addEventListener('message', (e) => {
    const msg = e.data;
    if (msg?.type !== 'dialogic-player') return;
    switch (msg.action) {
      case 'raiseHand': window.dialogicPlayer.raiseHand(); break;
      case 'submitQuestion': window.dialogicPlayer.submitQuestion(msg.question); break;
      case 'cancelQuestion': window.dialogicPlayer.cancelQuestion(); break;
      case 'answerStudentQuestion': window.dialogicPlayer.answerStudentQuestion(msg.answer); break;
      case 'skipStudentQuestion': window.dialogicPlayer.skipStudentQuestion(); break;
      case 'getTranscript':
        if (msg.id && typeof e.source?.postMessage === 'function') {
          e.source.postMessage({ type: 'dialogic-player-response', id: msg.id, transcript: window.dialogicPlayer.getTranscript() }, e.origin);
        }
        break;
      case 'getJustSaid':
        if (msg.id && typeof e.source?.postMessage === 'function') {
          e.source.postMessage({ type: 'dialogic-player-response', id: msg.id, justSaid: window.dialogicPlayer.getJustSaid() }, e.origin);
        }
        break;
    }
  });

  // ── Wiring ──

  audioEl.addEventListener('timeupdate', () => {
    updateCaptions(audioEl.currentTime * 1000);
    updateTimeDisplay();
  });

  if (typeof Reveal !== 'undefined') {
    Reveal.on('ready', async () => {
      const data = window.DIALOGIC_DATA;
      if (data?.slides?.length) {
        slideTargetSeconds = data.slides.map(s => s.targetSeconds ?? data.targetSecondsPerSlide ?? 60);
        totalSeconds = slideTargetSeconds.reduce((a, b) => a + b, 0);
      }
      initControls();
      initQuestionPanel();
      initStudentQuestionPanel();
      await loadSlideAudio(Reveal.getIndices().h);
      updateSlideNumber();
      updateTimeDisplay();
    });

    Reveal.on('slidechanged', async (event) => {
      stopTTS();
      updateSlideNumber();
      await loadSlideAudio(event.indexh);
      updateTimeDisplay();
    });
  } else {
    initQuestionPanel();
    initStudentQuestionPanel();
  }
})();
