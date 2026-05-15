/**
 * Custom confirmation dialog
 * Double opt-in for folder deletion
 */

class ConfirmDialog {
    constructor() {
        this.dialog = null;
        this.currentStep = 0;
        this.totalSteps = 2;
        this.resolve = null;
        this.createDialog();
    }

    createDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'confirm-dialog-overlay hidden';
        dialog.innerHTML = `
            <div class="confirm-dialog">
                <div class="confirm-dialog-header">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3 class="confirm-dialog-title">Confirm deletion</h3>
                </div>
                <div class="confirm-dialog-body">
                    <p class="confirm-dialog-message"></p>
                    <div class="confirm-dialog-progress">
                        <div class="progress-step" data-step="1">
                            <div class="step-circle">1</div>
                            <div class="step-label">First step confirmation</div>
                        </div>
                        <div class="progress-line"></div>
                        <div class="progress-step" data-step="2">
                            <div class="step-circle">2</div>
                            <div class="step-label">Final confirmation</div>
                        </div>
                    </div>
                </div>
                <div class="confirm-dialog-footer">
                    <button class="confirm-btn confirm-btn-next" data-action="next">
                        <i class="fas fa-arrow-right"></i>
                        <span>Next step</span>
                    </button>
                    <button class="confirm-btn confirm-btn-confirm hidden" data-action="confirm">
                        <i class="fas fa-trash-alt"></i>
                        <span>Confirm deletion</span>
                    </button>
                    <button class="confirm-btn confirm-btn-cancel" data-action="cancel">
                        <i class="fas fa-times"></i>
                        <span>Cancel</span>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);
        this.dialog = dialog;

        // Binding events
        this.bindEvents();
    }

    bindEvents() {
        const nextBtn = this.dialog.querySelector('[data-action="next"]');
        const confirmBtn = this.dialog.querySelector('[data-action="confirm"]');
        const cancelBtn = this.dialog.querySelector('[data-action="cancel"]');

        nextBtn.addEventListener('click', () => this.handleNext());
        confirmBtn.addEventListener('click', () => this.handleConfirm());
        cancelBtn.addEventListener('click', () => this.handleCancel());

        // Click on the background to close
        this.dialog.addEventListener('click', (e) => {
            if (e.target === this.dialog) {
                this.handleCancel();
            }
        });

        // ESC key off
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !this.dialog.classList.contains('hidden')) {
                this.handleCancel();
            }
        });
    }

    handleNext() {
        this.currentStep = 1;
        this.updateUI();
    }

    handleConfirm() {
        if (this.resolve) {
            this.resolve(true);
        }
        this.hide();
    }

    handleCancel() {
        if (this.resolve) {
            this.resolve(false);
        }
        this.hide();
    }

    updateUI() {
        const nextBtn = this.dialog.querySelector('[data-action="next"]');
        const confirmBtn = this.dialog.querySelector('[data-action="confirm"]');
        const steps = this.dialog.querySelectorAll('.progress-step');
        const message = this.dialog.querySelector('.confirm-dialog-message');

        if (this.currentStep === 0) {
            // first step
            nextBtn.classList.remove('hidden');
            confirmBtn.classList.add('hidden');
            steps[0].classList.add('active');
            steps[1].classList.remove('active');
        } else {
            // Step 2
            nextBtn.classList.add('hidden');
            confirmBtn.classList.remove('hidden');
            steps[0].classList.add('completed');
            steps[0].classList.remove('active');
            steps[1].classList.add('active');
            message.innerHTML = `
                <strong style="color: #e74c3c;">🔴 Final confirmation</strong><br><br>
                Do you really want to delete this folder?<br>
                <span style="color: #e67e22;">This operation cannot be undone!</span>
            `;
        }
    }

    /**
     * Show confirmation dialog
     * @param {string} folderName - folder name
     * @param {boolean} hasContent - Does it contain content
     * @returns {Promise<boolean>} Does the user confirm
     */
    show(folderName, hasContent = false) {
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.currentStep = 0;

            const message = this.dialog.querySelector('.confirm-dialog-message');
            message.innerHTML = `
                <strong>Folder will be deleted soon:</strong><br>
                <code style="background: #f5f5f5; padding: 4px 8px; border-radius: 4px; color: #2c3e50;">${folderName}</code><br><br>
                ${hasContent ? '<span style="color: #e67e22;">⚠️ This folder is not empty!</span><br>' : ''}
                <span style="color: #7f8c8d;">The deletion operation is complex and cannot be undone</span><br><br>
                <strong>Please click the buttons in order to confirm</strong>
            `;

            this.updateUI();
            this.dialog.classList.remove('hidden');

            // Add animation
            setTimeout(() => {
                this.dialog.querySelector('.confirm-dialog').classList.add('show');
            }, 10);
        });
    }

    hide() {
        const dialogBox = this.dialog.querySelector('.confirm-dialog');
        dialogBox.classList.remove('show');

        setTimeout(() => {
            this.dialog.classList.add('hidden');
            this.currentStep = 0;
            this.resolve = null;
        }, 300);
    }
}

// Create a global instance
const confirmDialog = new ConfirmDialog();
