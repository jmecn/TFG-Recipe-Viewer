export const Boot = {
  ensure() {
    if (!this.root) {
      this.root = document.getElementById('app-boot');
      this.statusEl = document.getElementById('app-boot-status');
      this.progressFill = document.getElementById('app-boot-progress-fill');
      this.stepsDone = 0;
      this.totalSteps = 9;
      this.setProgress(0.05);
    }
  },
  setProgress(value) {
    this.ensure();
    const clamped = Math.max(0, Math.min(1, Number(value) || 0));
    if (this.progressFill) {
      this.progressFill.style.width = `${Math.round(clamped * 100)}%`;
    }
  },
  setStatus(text) {
    this.ensure();
    if (this.statusEl) {
      const hasText = typeof text === 'string' && text.trim().length > 0;
      this.statusEl.hidden = !hasText;
      if (hasText) this.statusEl.textContent = text;
    }
    this.stepsDone = Math.min(this.totalSteps, this.stepsDone + 1);
    const ratio = 0.05 + (this.stepsDone / this.totalSteps) * 0.9;
    this.setProgress(ratio);
  },
  finish() {
    this.ensure();
    this.setProgress(1);
    document.body.classList.remove('is-booting');
    if (this.root) {
      this.root.classList.add('is-hidden');
      this.root.setAttribute('aria-busy', 'false');
    }
  },
};

export const Transition = {
  ensure() {
    if (!this.root) {
      this.root = document.getElementById('app-transition');
      this.statusEl = document.getElementById('app-transition-status');
    }
  },
  show(text) {
    this.ensure();
    if (!this.root) return;
    this.setStatus(text);
    this.root.hidden = false;
    this.root.classList.add('is-visible');
    document.body.classList.add('is-transitioning-lang');
  },
  setStatus(text) {
    this.ensure();
    if (!this.statusEl) return;
    this.statusEl.textContent = typeof text === 'string' && text.trim() ? text : '';
  },
  hide() {
    this.ensure();
    if (!this.root) return;
    this.root.classList.remove('is-visible');
    this.root.hidden = true;
    document.body.classList.remove('is-transitioning-lang');
  },
};
