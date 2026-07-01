/**
 * history.js - Undo/redo state management
 */

class HistoryManager {
    constructor(canvasManager, handlesManager) {
        this.canvasManager = canvasManager;
        this.handlesManager = handlesManager;
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = 30;
    }

    _captureState() {
        const cm = this.canvasManager;
        const state = {
            imageCanvas: null,
            corners: this.handlesManager.getCorners(),
            imageSize: { ...cm.imageSize }
        };

        if (cm.hasImage()) {
            state.imageCanvas = document.createElement('canvas');
            state.imageCanvas.width = cm.imageSize.width;
            state.imageCanvas.height = cm.imageSize.height;
            const offCtx = state.imageCanvas.getContext('2d');
            offCtx.drawImage(cm.image, 0, 0);
        }

        return state;
    }

    saveState() {
        const state = this._captureState();
        this.undoStack.push(state);
        if (this.undoStack.length > this.maxHistory) {
            const oldest = this.undoStack.shift();
            this._freeStateCanvas(oldest);
        }
        for (const s of this.redoStack) {
            this._freeStateCanvas(s);
        }
        this.redoStack = [];
        this._updateButtons();
    }

    _freeStateCanvas(state) {
        if (state && state.imageCanvas) {
            state.imageCanvas.width = 0;
            state.imageCanvas.height = 0;
            state.imageCanvas = null;
        }
    }

    undo() {
        if (!this.canUndo()) return;
        const currentState = this._captureState();
        this.redoStack.push(currentState);
        const prevState = this.undoStack.pop();
        this._restoreState(prevState);
        this._updateButtons();
    }

    redo() {
        if (!this.canRedo()) return;
        const currentState = this._captureState();
        this.undoStack.push(currentState);
        const nextState = this.redoStack.pop();
        this._restoreState(nextState);
        this._updateButtons();
    }

    _restoreState(state) {
        if (state.imageCanvas) {
            const cm = this.canvasManager;
            cm.setImage(state.imageCanvas);
            if (state.corners && state.corners.length === 4) {
                this.handlesManager.setCorners(state.corners);
            }
            window.dispatchEvent(new CustomEvent('history:restored', {
                detail: { width: state.imageSize.width, height: state.imageSize.height }
            }));
            window.dispatchEvent(new CustomEvent('render:required'));
        }
    }

    canUndo() {
        return this.undoStack.length > 1;
    }

    canRedo() {
        return this.redoStack.length > 0;
    }

    clear() {
        for (const state of this.undoStack) this._freeStateCanvas(state);
        for (const state of this.redoStack) this._freeStateCanvas(state);
        this.undoStack = [];
        this.redoStack = [];
        this._updateButtons();
    }

    _updateButtons() {
        const undoBtn = document.getElementById('btn-undo');
        const redoBtn = document.getElementById('btn-redo');
        if (undoBtn) undoBtn.disabled = !this.canUndo();
        if (redoBtn) redoBtn.disabled = !this.canRedo();
    }
}

window.HistoryManager = HistoryManager;