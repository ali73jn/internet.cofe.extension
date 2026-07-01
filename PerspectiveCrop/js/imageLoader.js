/**
 * imageLoader.js - File input, clipboard, and drag-drop handling
 */

class ImageLoader {
    constructor(canvasManager, viewport, historyManager, handlesManager) {
        this.canvasManager = canvasManager;
        this.viewport = viewport;
        this.historyManager = historyManager;
        this.handlesManager = handlesManager;
        this.fileInput = document.getElementById('file-input');
        this.container = document.getElementById('canvas-container');
        this.dropOverlay = document.getElementById('drop-overlay');
        this.welcomeMessage = document.getElementById('welcome-message');
        this.dragCounter = 0;
        this._objectURL = null;

        this._setupEventListeners();
    }

    _setupEventListeners() {
        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) this.loadFromFile(e.target.files[0]);
            // Reset value so same file can be re-selected
            this.fileInput.value = '';
        });
        this.container.addEventListener('dragenter', this._onDragEnter.bind(this));
        this.container.addEventListener('dragover', this._onDragOver.bind(this));
        this.container.addEventListener('dragleave', this._onDragLeave.bind(this));
        this.container.addEventListener('drop', this._onDrop.bind(this));
        document.addEventListener('paste', this._onPaste.bind(this));
    }

    openFileDialog() {
        // بدون هیچ اخطاری مستقیم دیالوگ باز می‌شود
        this.fileInput.click();
    }

    loadFromFile(file) {
        if (!file.type.startsWith('image/')) {
            this._showError('لطفاً یک فایل تصویری معتبر انتخاب کنید.');
            return;
        }
        if (file.size > 100 * 1024 * 1024) {
            this._showError('حجم فایل بیش از حد مجاز است (حداکثر ۱۰۰ مگابایت).');
            return;
        }

        if (this._objectURL) {
            URL.revokeObjectURL(this._objectURL);
            this._objectURL = null;
        }
        this._objectURL = URL.createObjectURL(file);
        this._loadImageFromURL(this._objectURL, file.name);
    }

    _loadImageFromURL(url, name) {
        const img = new Image();
        img.onload = () => {
            this._onImageLoaded(img, name || 'تصویر');
        };
        img.onerror = () => this._showError('بارگذاری تصویر شکست خورد. فایل ممکن است خراب باشد.');
        img.src = url;
    }

    _onImageLoaded(img, name) {
        this.canvasManager.setImage(img);
        if (this.handlesManager) this.handlesManager.resetToImageBounds();
        if (this.historyManager) {
            this.historyManager.clear();
            this.historyManager.saveState();
        }
        this.viewport.fitToScreen();
        if (this.welcomeMessage) this.welcomeMessage.classList.add('hidden');
        this._enableToolbarButtons();

        window.dispatchEvent(new CustomEvent('image:loaded', {
            detail: {
                width: img.naturalWidth || img.width,
                height: img.naturalHeight || img.height,
                name: name
            }
        }));
        window.dispatchEvent(new CustomEvent('render:required'));
    }

    _enableToolbarButtons() {
        const ids = ['btn-undo','btn-redo','btn-rotate-cw','btn-rotate-ccw',
            'btn-flip-h','btn-flip-v','btn-detect','btn-fit','btn-reset','btn-fit-corners'];
        ids.forEach(id => {
            const b = document.getElementById(id);
            if (b) b.disabled = false;
        });
    }

    _onDragEnter(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dragCounter++;
        this.dropOverlay.classList.remove('hidden');
        this.dropOverlay.classList.add('active');
    }
    _onDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
    }
    _onDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dragCounter--;
        if (this.dragCounter <= 0) {
            this.dragCounter = 0;
            this.dropOverlay.classList.add('hidden');
            this.dropOverlay.classList.remove('active');
        }
    }
    _onDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.dragCounter = 0;
        this.dropOverlay.classList.add('hidden');
        this.dropOverlay.classList.remove('active');
        const f = e.dataTransfer.files;
        if (f && f[0]) this.loadFromFile(f[0]);
    }

    _onPaste(e) {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
                e.preventDefault();
                const file = items[i].getAsFile();
                if (file) this.loadFromFile(file);
                return;
            }
        }
    }

    _showError(message) {
        const t = document.createElement('div');
        t.className = 'toast-error';
        t.textContent = message;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 3500);
    }
}

window.ImageLoader = ImageLoader;