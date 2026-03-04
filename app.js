/**
 * ============================================
 *  Vocal Check Note - Application Logic
 * ============================================
 * 
 * 音声マスター方式による同期再生システム
 * - ローカル音声 (Wavesurfer.js) = マスター
 */

// ============================================
//  State Management
// ============================================
const AppState = {
  // Theme
  theme: 'day',

  // Wavesurfer
  tracks: [], // array of { id, name, file, wavesurfer, isMaster }
  offsetMs: 0,
  isPlaying: false,
  isOverlayMode: false,
  projectName: '', // New
  pendingFiles: [], // temporary for welcome modal

  // Lyrics
  lyricsMode: 'edit', // 'edit' | 'list'
  lyricsLines: [],     // Array of { text, timestamp, memo }
  activeLyricsIndex: -1,

  // Autosave
  autosaveTimer: null,
  isDirty: false,
};

// ============================================
//  Constants
// ============================================
const STORAGE_KEY = 'vocal-check-note-data';
const AUTOSAVE_INTERVAL = 3000;

// ============================================
//  DOM References
// ============================================
const DOM = {};

function cacheDOMReferences() {
  // Header
  DOM.themeToggle = document.getElementById('theme-toggle');
  DOM.headerStatus = document.getElementById('header-status');
  DOM.autosaveIndicator = document.getElementById('autosave-indicator');

  // Resizer
  DOM.resizer = document.getElementById('resizer');
  DOM.lyricsPanel = document.querySelector('.lyrics-panel');

  // Waveform
  DOM.globalDropZone = document.getElementById('global-drop-zone');
  DOM.globalFileInput = document.getElementById('global-file-input');
  DOM.dropZoneIcon = document.getElementById('drop-zone-icon');
  DOM.dropZoneText = document.getElementById('drop-zone-text');
  DOM.dynamicTracks = document.getElementById('tracks-list');
  DOM.tracksScrollContainer = document.getElementById('dynamic-tracks');
  DOM.tracksInner = document.getElementById('tracks-inner-container'); // Added
  DOM.offsetControlGroup = document.getElementById('offset-control-group');
  DOM.offsetValue = document.getElementById('offset-value');
  DOM.zoomSlider = document.getElementById('zoom-slider');
  DOM.waveformTimeline = document.getElementById('waveform-timeline');

  // Welcome Modal
  DOM.welcomeModal = document.getElementById('welcome-modal');
  DOM.welcomeDropZone = document.getElementById('welcome-drop-zone');
  DOM.welcomeFileInput = document.getElementById('welcome-file-input');
  DOM.welcomeFileList = document.getElementById('welcome-file-list');
  DOM.welcomeTitleInput = document.getElementById('welcome-title-input');
  DOM.welcomeSkipBtn = document.getElementById('welcome-skip-btn');
  DOM.welcomeStartBtn = document.getElementById('welcome-start-btn');

  // Lyrics
  DOM.lyricsModeTab = document.getElementById('lyrics-mode-tabs');
  DOM.lyricsTabEdit = document.getElementById('lyrics-tab-edit');
  DOM.lyricsTabList = document.getElementById('lyrics-tab-list');
  DOM.lyricsImportArea = document.getElementById('lyrics-import-area');
  DOM.lyricsTextarea = document.getElementById('lyrics-textarea');
  DOM.lyricsImportBtn = document.getElementById('lyrics-import-btn');
  DOM.lyricsClearBtn = document.getElementById('lyrics-clear-btn');
  DOM.lyricsListContainer = document.getElementById('lyrics-list-container');
  DOM.lyricsList = document.getElementById('lyrics-list');
  DOM.lyricsCount = document.getElementById('lyrics-count');

  // New Options
  DOM.splitSpaceCheckbox = document.getElementById('split-space-checkbox');
  DOM.undoImportBtn = document.getElementById('undo-import-btn');

  // Preview Modal
  DOM.previewModal = document.getElementById('preview-modal');
  DOM.previewTextarea = document.getElementById('preview-textarea');
  DOM.previewCancelBtn = document.getElementById('preview-cancel-btn');
  DOM.previewConfirmBtn = document.getElementById('preview-confirm-btn');
  DOM.previewGreetingBtn = document.getElementById('preview-greeting-btn');

  // New Toggles
  DOM.seekStepInput = document.getElementById('seek-step-input');
  DOM.waveAutoscrollToggle = document.getElementById('wave-autoscroll-toggle');
  DOM.lyricsAutoscrollContainer = document.getElementById('lyrics-autoscroll-container');
  DOM.lyricsAutoscrollToggle = document.getElementById('lyrics-autoscroll-toggle');
  DOM.generateGuideBtn = document.getElementById('generate-guide-btn');

  // Controls
  DOM.playBtn = document.getElementById('play-btn');
  DOM.stopBtn = document.getElementById('stop-btn');
  DOM.timeDisplay = document.getElementById('time-display');
  DOM.vocalVolume = document.getElementById('vocal-volume');
  DOM.karaokeVolume = document.getElementById('karaoke-volume');
  DOM.stampBtn = document.getElementById('stamp-btn');
  DOM.copyBtn = document.getElementById('copy-btn');
  DOM.resetAllBtn = document.getElementById('reset-all-btn');

  DOM.toastContainer = document.getElementById('toast-container');

  // Welcome Modal
  DOM.welcomeModal = document.getElementById('welcome-modal');
  DOM.welcomeDropZone = document.getElementById('welcome-drop-zone');
  DOM.welcomeFileInput = document.getElementById('welcome-file-input');
  DOM.welcomeFileList = document.getElementById('welcome-file-list');
  DOM.welcomeTitleInput = document.getElementById('welcome-title-input');
  DOM.welcomeSkipBtn = document.getElementById('welcome-skip-btn');
  DOM.welcomeStartBtn = document.getElementById('welcome-start-btn');

  // Export/Import
  DOM.exportBtn = document.getElementById('export-btn');
  if (!DOM.exportBtn) console.warn('export-btn not found in DOM');
  DOM.importBtn = document.getElementById('import-btn');
  if (!DOM.importBtn) console.warn('import-btn not found in DOM');
  DOM.vcnImportInput = document.getElementById('vcn-import-input');
  DOM.projectNameInput = document.getElementById('project-name-input');

  // Selection Modal
  DOM.selectionModal = document.getElementById('selection-modal');
  DOM.selectionList = document.getElementById('selection-list');
  DOM.selectionCancelBtn = document.getElementById('selection-cancel-btn');
}

// ============================================
//  IndexedDB for Audio Storage
// ============================================

const DB_NAME = 'VocalCheckNoteDB';
const DB_VERSION = 1;

let db;

function initIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('IndexedDB error:', event.target.errorCode);
      reject(event.target.errorCode);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files', { keyPath: 'role' });
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };
  });
}

async function saveFileToDB(role, file) {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['files'], 'readwrite');
    const store = transaction.objectStore('files');
    const request = store.put({ role, blob: file, name: file.name, type: file.type });

    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.errorCode);
  });
}

async function loadFilesFromDB() {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['files'], 'readonly');
    const store = transaction.objectStore('files');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.errorCode);
  });
}

async function clearFilesFromDB() {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['files'], 'readwrite');
    const store = transaction.objectStore('files');
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.errorCode);
  });
}

async function deleteFileFromDB(role) {
  if (!db) await initIndexedDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['files'], 'readwrite');
    const store = transaction.objectStore('files');
    const request = store.delete(role);

    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.errorCode);
  });
}

// ============================================
//  Initialization
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
  cacheDOMReferences();
  initTheme();
  initEventListeners();
  initKeyboardShortcuts();
  initDragAndDrop();
  initResizer();
  initVerticalResizer();
  await initIndexedDB();
  checkAutoRestore();
  startAutosave();

  // Show Welcome Modal if no data
  if (AppState.lyricsLines.length === 0 && AppState.tracks?.length === 0) {
    const welcome = document.getElementById('welcome-modal');
    if (welcome) welcome.style.display = 'flex';
  }
});

function initVerticalResizer() {
  const vResizer = document.getElementById('vertical-resizer');
  const mediaArea = document.querySelector('.media-area');
  let isResizing = false;

  if (!vResizer || !mediaArea) return;

  vResizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = 'row-resize';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const minHeight = 100;
    const maxHeight = document.body.clientHeight - 200;
    let newHeight = e.clientY - mediaArea.getBoundingClientRect().top;

    if (newHeight < minHeight) newHeight = minHeight;
    if (newHeight > maxHeight) newHeight = maxHeight;

    mediaArea.style.height = `${newHeight}px`;
    mediaArea.style.flex = `0 0 ${newHeight}px`; // Force fixed height
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
    }
  });
}

// ============================================
//  Theme System
// ============================================
function initTheme() {
  const savedTheme = localStorage.getItem('vcn-theme') || 'day';
  setTheme(savedTheme);
}

function setTheme(theme) {
  AppState.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('vcn-theme', theme);

  // Update wavesurfer colors if loaded
  updateWaveformColors();
}

function toggleTheme() {
  const newTheme = AppState.theme === 'day' ? 'night' : 'day';
  setTheme(newTheme);
}

function updateWaveformColors() {
  const style = getComputedStyle(document.documentElement);
  const base = style.getPropertyValue('--waveform-base').trim();
  const progress = style.getPropertyValue('--waveform-progress').trim();
  const cursor = style.getPropertyValue('--primary').trim();

  // Use a safe update approach that doesn't trigger resize/re-render
  // Use a safe update approach that doesn't trigger resize/re-render
  AppState.tracks.forEach(t => {
    const ws = t.wavesurfer;
    if (!ws) return;
    const wrapper = ws.getWrapper();
    if (!wrapper) return;

    ws.setOptions({
      waveColor: t.isMaster ? base : `hsl(${(AppState.tracks.indexOf(t) * 50) % 360}, 60%, 50%)`,
      progressColor: progress,
      cursorColor: cursor,
    });
  });
}

// ============================================
//  Event Listeners
// ============================================
function initEventListeners() {
  // Theme
  DOM.themeToggle.addEventListener('click', toggleTheme);

  // Global Drop Zone
  if (DOM.globalDropZone) {
    DOM.globalDropZone.addEventListener('click', () => DOM.globalFileInput.click());
    DOM.globalFileInput.addEventListener('change', (e) => handleFiles(e.target.files));
  }

  // Overlay Mode
  if (DOM.overlayToggleBtn) {
    DOM.overlayToggleBtn.addEventListener('click', toggleOverlayMode);
  }

  // Welcome Modal
  if (DOM.welcomeDropZone) {
    DOM.welcomeDropZone.addEventListener('click', () => DOM.welcomeFileInput.click());
    DOM.welcomeFileInput.addEventListener('change', (e) => handleWelcomeFiles(e.target.files));
    DOM.welcomeSkipBtn.addEventListener('click', () => {
      DOM.welcomeModal.style.display = 'none';
    });
    DOM.welcomeStartBtn.addEventListener('click', async () => {
      const projectName = DOM.welcomeTitleInput.value.trim();
      DOM.welcomeModal.style.display = 'none';

      if (projectName) {
        AppState.projectName = projectName;
        if (DOM.projectNameInput) DOM.projectNameInput.value = projectName;
      }

      if (AppState.pendingFiles && AppState.pendingFiles.length > 0) {
        handleFiles(AppState.pendingFiles);
        AppState.pendingFiles = []; // Clear after use
      }
    });
  }

  // Offset and Zoom
  if (DOM.offsetValue) {
    DOM.offsetValue.addEventListener('change', () => {
      AppState.offsetMs = parseInt(DOM.offsetValue.value) || 0;
      markDirty();
    });
  }

  if (DOM.zoomSlider) {
    DOM.zoomSlider.addEventListener('input', () => {
      const minPx = Number(DOM.zoomSlider.value);
      AppState.tracks.forEach(t => t.wavesurfer.zoom(minPx));
      syncTracksWidth();
    });
  }

  if (DOM.waveAutoscrollToggle) {
    // Rely purely on handleWaveAutoscroll checking the checked state, no need to touch internal wavesurfer
  }

  // Lyrics
  DOM.lyricsTabEdit.addEventListener('click', () => setLyricsMode('edit'));
  DOM.lyricsTabList.addEventListener('click', () => setLyricsMode('list'));
  DOM.lyricsImportBtn.addEventListener('click', importLyrics);
  DOM.lyricsClearBtn.addEventListener('click', clearLyrics);
  if (DOM.undoImportBtn) {
    DOM.undoImportBtn.addEventListener('click', () => {
      const lastInput = AppState.lastRawInput || '';
      clearLyrics();
      DOM.lyricsTextarea.value = lastInput;
      DOM.undoImportBtn.style.display = 'none';
      setLyricsMode('edit');
    });
  }

  // List input
  DOM.lyricsList.addEventListener('input', (e) => {
    if (e.target.classList.contains('unified-memo-input')) {
      const idx = e.target.dataset.index;
      AppState.lyricsLines[idx].memo = e.target.value;
      markDirty();
    }
  });

  // Preview Modal
  DOM.previewConfirmBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(DOM.previewTextarea.value).then(() => {
      DOM.previewModal.style.display = 'none';
      const count = AppState.lyricsLines.filter(l => l.timestamp !== null || l.memo).length;
      showToast(`${count} 行のメモをコピーしました`, 'success');
    }).catch(() => showToast('コピーに失敗しました', 'error'));
  });
  DOM.previewCancelBtn.addEventListener('click', () => {
    DOM.previewModal.style.display = 'none';
  });
  if (DOM.previewGreetingBtn) {
    DOM.previewGreetingBtn.addEventListener('click', () => {
      let currentText = DOM.previewTextarea.value;
      const header = 'お世話になっております！\nこちらの内容の修正をお願いできますでしょうか。\n\n修正内容（秒数・歌詞）\n\n';
      const footer = '\n\nお手数をおかけしますが、楽しみにしておりますのでご対応のほどよろしくお願いいたします🙇';
      if (!currentText.startsWith('お世話に')) {
        currentText = header + currentText;
      }
      if (!currentText.includes('ご対応のほどよろしくお願いいたします')) {
        currentText = currentText + footer;
      }
      DOM.previewTextarea.value = currentText;
    });
  }

  // Instruction Generate
  if (DOM.generateGuideBtn) {
    DOM.generateGuideBtn.addEventListener('click', () => {
      const guideText = `楽曲のボーカルチェックに「歌みたチェックノート」というツール（https://note.piipipi.com）を使用しております。\n\nぜひ音源データのチェックとメモにお役立てください。\n\n【最初にしてもらいたいこと】\n画面の上にある「読み込み」からお送りした「.vcn」ファイルを読み込んでください。\n波形データや歌詞データが表示されたら成功です。\n\n【操作】\nスペースキーで再生・停止、左右の矢印キーでスキップができます。\n歌詞のリスト横にある時間をクリックすると、その場所から再生ができます。\n気になった個所はリスト右側のメモ欄に書いてください。\n\n【共有】\nメモが終わったら右下の「プレビュー＆コピー」を押すと一覧にまとまってコピーができます。\nぜひフィードバックとしてお送りください。`;

      DOM.previewTextarea.value = guideText;
      if (DOM.previewGreetingBtn) DOM.previewGreetingBtn.style.display = 'none';
      DOM.previewModal.style.display = 'flex';
    });
  }

  // Lyric Selection
  if (DOM.selectionCancelBtn) {
    DOM.selectionCancelBtn.addEventListener('click', () => {
      DOM.selectionModal.style.display = 'none';
    });
  }

  // Controls
  DOM.playBtn.addEventListener('click', togglePlayback);
  DOM.stopBtn.addEventListener('click', stopAndReset);
  if (DOM.vocalVolume) {
    DOM.vocalVolume.addEventListener('input', () => {
      if (AppState.tracks[0]) AppState.tracks[0].wavesurfer.setVolume(DOM.vocalVolume.value / 100);
    });
  }
  if (DOM.karaokeVolume) {
    DOM.karaokeVolume.addEventListener('input', () => {
      AppState.tracks.forEach((t, i) => {
        if (i !== 0) t.wavesurfer.setVolume(DOM.karaokeVolume.value / 100);
      });
    });
  }
  DOM.stampBtn.addEventListener('click', stampTimestamp);
  DOM.copyBtn.addEventListener('click', copyToClipboard);
  DOM.resetAllBtn.addEventListener('click', resetAll);

  // Export / Import
  if (DOM.exportBtn) {
    DOM.exportBtn.onclick = null; // Clear any old ones
    DOM.exportBtn.addEventListener('click', (e) => {
      e.preventDefault();
      exportProject();
    });
  }
  if (DOM.importBtn) {
    DOM.importBtn.onclick = null;
    DOM.importBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (DOM.vcnImportInput) DOM.vcnImportInput.click();
    });
  }
  if (DOM.vcnImportInput) {
    DOM.vcnImportInput.onchange = (e) => {
      if (e.target.files.length > 0) importProject(e.target.files[0]);
    };
  }

  if (DOM.projectNameInput) {
    DOM.projectNameInput.addEventListener('input', () => {
      AppState.projectName = DOM.projectNameInput.value;
      markDirty();
    });
  }

  // Panel Collapse functionality
  const collapseMediaBtn = document.getElementById('collapse-media-btn');
  const collapseLyricsBtn = document.getElementById('collapse-lyrics-btn');

  if (collapseMediaBtn) {
    collapseMediaBtn.addEventListener('click', () => {
      const parent = document.querySelector('.media-area');
      if (collapseMediaBtn.textContent === '−') {
        parent.dataset.oldFlex = parent.style.flex;
        parent.style.flex = '0 0 40px';
        parent.style.minHeight = '40px';
        collapseMediaBtn.textContent = '+';
      } else {
        parent.style.flex = parent.dataset.oldFlex || '0 0 158px';
        parent.style.minHeight = '';
        parent.style.height = '158px';
        collapseMediaBtn.textContent = '−';
      }
    });
  }

  if (collapseLyricsBtn) {
    collapseLyricsBtn.addEventListener('click', () => {
      const parent = document.querySelector('.work-area');
      if (collapseLyricsBtn.textContent === '−') {
        parent.dataset.oldFlex = parent.style.flex;
        parent.style.flex = '0 0 40px';
        parent.style.minHeight = '40px';
        collapseLyricsBtn.textContent = '+';
      } else {
        parent.style.flex = parent.dataset.oldFlex || '';
        parent.style.minHeight = '';
        collapseLyricsBtn.textContent = '−';
      }
    });
  }

  // Timeline click to seek
  if (DOM.waveformTimeline) {
    DOM.waveformTimeline.addEventListener('click', (e) => {
      if (!AppState.tracks.length || !AppState.tracks[0].wavesurfer) return;
      const target = DOM.waveformTimeline;
      const x = e.clientX - target.getBoundingClientRect().left;
      const percent = x / target.offsetWidth;
      AppState.tracks[0].wavesurfer.seekTo(Math.max(0, Math.min(1, percent)));
      syncAllTracks();
    });
  }

  // Beforeunload warning
  window.addEventListener('beforeunload', (e) => {
    if (AppState.isDirty || AppState.lyricsLines.length > 0) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

// ============================================
//  Keyboard Shortcuts
// ============================================
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // ---- 1. Tab Focus logic for unified memo inputs ----
    if (e.key === 'Tab' && e.target.classList.contains('unified-memo-input')) {
      e.preventDefault();
      const inputs = Array.from(document.querySelectorAll('.unified-memo-input'));
      const index = inputs.indexOf(e.target);
      if (!e.shiftKey && index > -1 && index + 1 < inputs.length) {
        inputs[index + 1].focus();
      } else if (e.shiftKey && index > 0) {
        inputs[index - 1].focus();
      }
      return;
    }

    // ---- 1b. Shift+Enter Focus logic for unified memo inputs ----
    if (e.key === 'Enter' && e.shiftKey && e.target.classList.contains('unified-memo-input')) {
      e.preventDefault();
      const inputs = Array.from(document.querySelectorAll('.unified-memo-input'));
      const index = inputs.indexOf(e.target);
      if (index > -1 && index + 1 < inputs.length) {
        setActiveLyrics(index + 1);
        inputs[index + 1].focus();
      }
      return;
    }

    // Don't intercept global playback/stamping if focused on an input/textarea 
    // unless it's a specific key that should bypass.
    const isInput = ['INPUT', 'TEXTAREA'].includes(e.target.tagName);

    // Space: Play/Pause (only when not in text input)
    if (e.code === 'Space' && !isInput) {
      e.preventDefault();
      togglePlayback();
    }

    // Enter: Stamp timestamp
    if (e.key === 'Enter') {
      // If pressing Enter inside memo or general textarea, insert newline natively.
      if (isInput) return;
      e.preventDefault();
      stampTimestamp();
    }

    // Skip logic with variable interval
    let skipTime = 5;
    if (DOM.seekStepInput) {
      skipTime = parseInt(DOM.seekStepInput.value) || 5;
    }

    // ArrowLeft: Skip backward
    if (e.key === 'ArrowLeft' && !isInput) {
      e.preventDefault();
      if (!AppState.tracks.length || !AppState.tracks[0].wavesurfer) return;
      const ws = AppState.tracks[0].wavesurfer;
      const currentTime = ws.getCurrentTime();

      // If repeat, we just seek a bit more
      let newTime = currentTime - skipTime;
      if (newTime < 0) newTime = 0;
      ws.setTime(newTime);
      if (!AppState.isPlaying) syncAllTracks();
    }

    // ArrowRight: Skip forward
    if (e.key === 'ArrowRight' && !isInput) {
      e.preventDefault();
      if (!AppState.tracks.length || !AppState.tracks[0].wavesurfer) return;
      const ws = AppState.tracks[0].wavesurfer;
      const duration = ws.getDuration();
      const currentTime = ws.getCurrentTime();

      let newTime = currentTime + skipTime;
      if (newTime > duration) newTime = duration;
      ws.setTime(newTime);
      if (!AppState.isPlaying) syncAllTracks();
    }

    // ArrowUp: Move active line up
    if (e.key === 'ArrowUp' && (!isInput || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (AppState.lyricsLines.length > 0) {
        let newIdx = AppState.activeLyricsIndex - 1;
        if (newIdx < 0) newIdx = 0;
        setActiveLyrics(newIdx);

        // If focused in input, move focus to the corresponding memo.
        if (isInput) {
          const inputs = document.querySelectorAll('.unified-memo-input');
          if (inputs[newIdx]) inputs[newIdx].focus();
        }
      }
    }

    // ArrowDown: Move active line down
    if (e.key === 'ArrowDown' && (!isInput || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (AppState.lyricsLines.length > 0) {
        let newIdx = AppState.activeLyricsIndex + 1;
        if (newIdx >= AppState.lyricsLines.length) newIdx = AppState.lyricsLines.length - 1;
        setActiveLyrics(newIdx);

        // If focused in input, move focus to the corresponding memo.
        if (isInput) {
          const inputs = document.querySelectorAll('.unified-memo-input');
          if (inputs[newIdx]) inputs[newIdx].focus();
        }
      }
    }
  });
}

// ============================================
//  Drag and Drop
// ============================================
function initDragAndDrop() {
  setupGlobalDropZone(DOM.globalDropZone, DOM.globalFileInput);
  setupWelcomeDropZone(DOM.welcomeDropZone, DOM.welcomeFileInput);
}

// ============================================
//  Resizer
// ============================================
function initResizer() {
  let isResizing = false;

  DOM.resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    DOM.resizer.classList.add('resizing');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const container = DOM.lyricsListContainer;
    const containerRect = container.getBoundingClientRect();
    let newWidth = e.clientX - containerRect.left;

    const minWidth = 150;
    const maxWidth = containerRect.width - 150;

    if (newWidth < minWidth) newWidth = minWidth;
    if (newWidth > maxWidth) newWidth = maxWidth;

    const widthPercent = (newWidth / containerRect.width) * 100;
    container.style.setProperty('--lyric-width', `${widthPercent}%`);
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      DOM.resizer.classList.remove('resizing');
    }
  });
}

function setupGlobalDropZone(dropZone, fileInput) {
  if (!dropZone) return;
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

  dropZone.addEventListener('dragenter', () => dropZone.classList.add('drag-over'));
  dropZone.addEventListener('dragover', () => dropZone.classList.add('drag-over'));
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  });
}

function setupWelcomeDropZone(dropZone, fileInput) {
  if (!dropZone) return;
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

  dropZone.addEventListener('dragenter', () => dropZone.classList.add('drag-over'));
  dropZone.addEventListener('dragover', () => dropZone.classList.add('drag-over'));
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      handleWelcomeFiles(e.dataTransfer.files);
    }
  });
}

// ============================================
//  Audio File Loading (Wavesurfer, Multi-Track)
// ============================================
function handleWelcomeFiles(files) {
  const validTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/x-wav'];
  Array.from(files).forEach(file => {
    if (validTypes.includes(file.type) || file.name.match(/\.(wav|mp3)$/i)) {
      AppState.pendingFiles.push(file);
      const li = document.createElement('li');
      li.textContent = `🎵 ${file.name}`;
      if (DOM.welcomeFileList) DOM.welcomeFileList.appendChild(li);
    }
  });
}

function handleFiles(files) {
  const validTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/x-wav'];
  Array.from(files).forEach(file => {
    if (validTypes.includes(file.type) || file.name.match(/\.(wav|mp3)$/i)) {
      addTrack(file);
    } else {
      showToast(`${file.name}はサポート対象外のファイルです`, 'error');
    }
  });
}

function addTrack(file, skipSave = false) {
  if (DOM.globalDropZone) DOM.globalDropZone.style.display = 'none';

  const trackId = 'track-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  const isMaster = AppState.tracks.length === 0;

  // Use a stable key to prevent accumulation of duplicates in indexedDB.
  // We'll use role + index in the tracks array.
  const dbRole = isMaster ? 'master' : 'sub-' + AppState.tracks.length;

  if (!skipSave) {
    saveFileToDB(dbRole, file).catch(err => {
      console.warn('Failed to save track to DB:', err);
    });
  }

  const trackEl = document.createElement('div');
  trackEl.className = 'waveform-track';
  trackEl.id = trackId;

  // DAW Sidebar for this track
  const sidebar = document.createElement('div');
  sidebar.className = 'track-sidebar';

  const nameEl = document.createElement('div');
  nameEl.className = 'track-name';
  nameEl.textContent = isMaster ? `⭐ ${file.name}` : `🎵 ${file.name}`;
  nameEl.title = file.name;

  const volWrap = document.createElement('div');
  volWrap.className = 'track-volume-wrap';
  const volIcon = document.createElement('span');
  volIcon.textContent = isMaster ? '🎤' : '🎵';
  const volInput = document.createElement('input');
  volInput.type = 'range';
  volInput.min = '0';
  volInput.max = '100';
  volInput.value = isMaster ? '100' : '70';
  volInput.id = `vol-${trackId}`;

  volWrap.appendChild(volIcon);
  volWrap.appendChild(volInput);
  sidebar.appendChild(nameEl);
  sidebar.appendChild(volWrap);

  if (AppState.isOverlayMode && !isMaster) {
    trackEl.style.position = 'absolute';
    trackEl.style.top = '0';
    trackEl.style.left = '0';
    trackEl.style.width = '100%';
    trackEl.style.background = 'transparent';
    trackEl.style.pointerEvents = 'none';
    trackEl.style.opacity = '0.6';
    sidebar.style.visibility = 'hidden'; // Hide sidebar in overlay
  }

  const containerEl = document.createElement('div');
  containerEl.className = 'waveform-container';
  containerEl.id = `ws-${trackId}`;
  containerEl.style.flex = '1';

  const removeBtn = document.createElement('button');
  removeBtn.className = 'track-remove-btn';
  removeBtn.title = '削除';
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeTrack(trackId);
  });

  trackEl.appendChild(sidebar);
  trackEl.appendChild(containerEl);
  trackEl.appendChild(removeBtn);
  DOM.dynamicTracks.appendChild(trackEl);

  // Initialize wavesurfer
  const style = getComputedStyle(document.documentElement);
  const waveColor = style.getPropertyValue('--waveform-base').trim();
  const progressColor = style.getPropertyValue('--waveform-progress').trim();
  const cursorColor = style.getPropertyValue('--primary').trim();

  const plugins = [];
  let regionsPlugin = null;

  if (isMaster) {
    regionsPlugin = WaveSurfer.Regions.create();
    plugins.push(regionsPlugin);
    if (DOM.waveformTimeline) DOM.waveformTimeline.innerHTML = '';
    plugins.push(WaveSurfer.Timeline.create({ container: '#waveform-timeline', height: 18 }));
    if (DOM.offsetControlGroup) DOM.offsetControlGroup.style.display = 'none'; // Offset relies on having > 1 track
  } else {
    if (DOM.offsetControlGroup) DOM.offsetControlGroup.style.display = 'flex';
  }

  const zoomValue = DOM.zoomSlider ? Number(DOM.zoomSlider.value) : 10;
  // Modify waveColor slightly for non-master tracks to differentiate in overlay mode
  let finalWaveColor = waveColor;
  if (!isMaster) {
    const hue = (AppState.tracks.length * 50) % 360;
    finalWaveColor = `hsl(${hue}, 60%, 50%)`;
  }

  const ws = WaveSurfer.create({
    container: containerEl,
    waveColor: finalWaveColor,
    progressColor: progressColor,
    cursorColor: cursorColor,
    cursorWidth: isMaster ? 2 : 0, // hide cursor on secondary
    height: 120, // Match CSS track height exactly
    normalize: true,
    barGap: 1,
    barRadius: 2,
    minPxPerSec: zoomValue,
    interact: true,
    dragToSeek: true,
    autoCenter: false, // Better for DAW horizontal scroll
    autoScroll: false, // Managed manually to prevent fighting scroll handlers
    fillParent: true, // Use fillParent with container width management
    plugins: plugins
  });

  ws.on('ready', syncTracksWidth);

  const trackObj = {
    id: trackId,
    dbRole, // Keep track of DB key to delete it later
    name: file.name,
    isMaster,
    wavesurfer: ws,
    element: trackEl
  };

  AppState.tracks.push(trackObj);

  if (isMaster) {
    ws.regionsPlugin = regionsPlugin;
    regionsPlugin.on('region-updated', (region) => {
      const index = parseInt(region.id.replace('marker-', ''));
      if (!isNaN(index) && AppState.lyricsLines[index]) {
        AppState.lyricsLines[index].timestamp = region.start;
        const item = DOM.lyricsList.children[index];
        if (item) {
          const tsEl = item.querySelector('.lyrics-item-timestamp');
          if (tsEl) tsEl.textContent = formatTimeShort(region.start);
        }
        markDirty();
      }
    });

    ws.on('audioprocess', () => {
      updateTimeDisplay();
    });
    ws.on('seeking', () => {
      updateTimeDisplay();
      handleWaveAutoscroll();
      if (!AppState.isPlaying) syncAllTracks(); // sync immediately on seeking if paused
    });

    ws.on('interaction', () => {
      syncAllTracks();
    });

    ws.on('finish', () => {
      AppState.isPlaying = false;
      updatePlayButton();
      pause();
    });
  }

  const objectUrl = URL.createObjectURL(file);
  ws.load(objectUrl);

  ws.on('ready', () => {
    // Initial volume
    const vol = parseInt(volInput.value) / 100;
    ws.setVolume(vol);

    volInput.addEventListener('input', () => {
      ws.setVolume(parseInt(volInput.value) / 100);
    });

    updateTimeDisplay();
    updateAllRegions();
    showToast(`${file.name} を読み込みました`, 'success');
    markDirty();
    resizeMediaAreaByTracks();
  });
}

function resizeMediaAreaByTracks() {
  const mediaArea = document.querySelector('.media-area');
  if (!mediaArea) return;

  // Don't resize if user collapsed manually
  const collapseBtn = document.getElementById('collapse-media-btn');
  if (collapseBtn && collapseBtn.textContent === '+') return;

  const tracksCount = AppState.tracks.length;
  if (tracksCount === 0) {
    mediaArea.style.height = '158px';
    mediaArea.style.flex = '0 0 158px';
    return;
  }

  // Waveform track is ~130px, Panel Header + Timeline + borders is ~60px
  const trackHeight = 130;
  const headerAndTimelineBase = 68;
  const calculatedHeight = headerAndTimelineBase + (tracksCount * trackHeight);

  // Cap at 70% of viewport
  const maxHeight = document.body.clientHeight * 0.7;
  const finalHeight = Math.min(calculatedHeight, maxHeight);

  mediaArea.style.height = `${finalHeight}px`;
  mediaArea.style.flex = `0 0 ${finalHeight}px`;

  // Store the new flex in dataset in case user toggles collapse later
  mediaArea.dataset.oldFlex = `0 0 ${finalHeight}px`;
}

function removeTrack(trackId) {
  const index = AppState.tracks.findIndex(t => t.id === trackId);
  if (index === -1) return;

  const track = AppState.tracks[index];

  // Remove from IndexedDB persistence too
  if (track.dbRole) {
    deleteFileFromDB(track.dbRole).catch(err => console.warn('DB delete error:', err));
  }

  track.wavesurfer.destroy();
  track.element.remove();
  AppState.tracks.splice(index, 1);

  if (AppState.tracks.length === 0) {
    if (DOM.globalDropZone) DOM.globalDropZone.style.display = 'flex';
    if (DOM.offsetControlGroup) DOM.offsetControlGroup.style.display = 'none';
  } else if (index === 0) {
    // We removed master, for now let's just complain or elect new master. 
    // Simplicity: warn the user.
    showToast('マスタートラックが削除されました', 'warning');
  }

  showToast(`${track.name} を削除しました`, 'info');
  markDirty();
  resizeMediaAreaByTracks();
}

function toggleOverlayMode() {
  AppState.isOverlayMode = !AppState.isOverlayMode;
  const overlayBtn = document.getElementById('overlay-toggle-btn');
  if (overlayBtn) {
    overlayBtn.classList.toggle('btn-primary', AppState.isOverlayMode);
    overlayBtn.classList.toggle('btn-ghost', !AppState.isOverlayMode);
  }

  AppState.tracks.forEach((t, i) => {
    if (i === 0) return; // leave master as is
    if (AppState.isOverlayMode) {
      t.element.style.position = 'absolute';
      t.element.style.top = '0';
      t.element.style.left = '0';
      t.element.style.width = '100%';
      t.element.style.background = 'transparent';
      t.element.style.pointerEvents = 'none';
      t.element.style.opacity = '0.6';
      const sb = t.element.querySelector('.track-sidebar');
      if (sb) sb.style.visibility = 'hidden';
    } else {
      t.element.style.position = 'relative';
      t.element.style.width = '100%';
      t.element.style.pointerEvents = 'auto';
      t.element.style.opacity = '1';
      const sb = t.element.querySelector('.track-sidebar');
      if (sb) sb.style.visibility = 'visible';
    }
  });
}

// Generate color based on index
function getMarkerColor(index, alpha = 1) {
  const hue = (index * 137.5) % 360;
  return `hsla(${hue}, 70%, 50%, ${alpha})`;
}

// ============================================
//  Sync Playback System (Audio Master)
// ============================================
function togglePlayback() {
  if (AppState.isPlaying) {
    pause();
  } else {
    play();
  }
}

let playbackRafId = null;

function playbackLoop() {
  if (AppState.isPlaying) {
    handleWaveAutoscroll();
    playbackRafId = requestAnimationFrame(playbackLoop);
  }
}

function play() {
  if (AppState.tracks.length === 0) {
    showToast('音声ファイルを読み込んでから再生してください', 'error');
    return;
  }

  AppState.isPlaying = true;
  updatePlayButton();

  AppState.tracks.forEach((t, i) => {
    if (i === 0) {
      t.wavesurfer.play();
    } else {
      syncSingleTrack(t);
      t.wavesurfer.play();
    }
  });

  if (playbackRafId) cancelAnimationFrame(playbackRafId);
  playbackRafId = requestAnimationFrame(playbackLoop);
}

function pause() {
  AppState.isPlaying = false;
  updatePlayButton();

  if (playbackRafId) cancelAnimationFrame(playbackRafId);

  if (AppState.tracks) {
    AppState.tracks.forEach(t => {
      if (t.wavesurfer && typeof t.wavesurfer.pause === 'function') {
        try { t.wavesurfer.pause(); } catch (e) { console.warn('Pause error:', e); }
      }
    });
  }
}

function stopAndReset() {
  pause();
  AppState.tracks.forEach(t => t.wavesurfer.seekTo(0));
  updateTimeDisplay();
  handleWaveAutoscroll();
}

function updatePlayButton() {
  if (DOM.playBtn) DOM.playBtn.textContent = AppState.isPlaying ? '⏸' : '▶';
}

function syncAllTracks() {
  if (AppState.tracks.length <= 1) return;
  AppState.tracks.slice(1).forEach(t => syncSingleTrack(t));
}

function syncSingleTrack(track) {
  const master = AppState.tracks[0];
  if (!master || !track) return;

  const masterTime = master.wavesurfer.getCurrentTime();
  const offsetSec = AppState.offsetMs / 1000;
  const targetTime = masterTime + offsetSec;
  const duration = track.wavesurfer.getDuration();

  // seekTo takes a ratio 0-1
  if (duration > 0 && targetTime >= 0 && targetTime <= duration) {
    track.wavesurfer.seekTo(targetTime / duration);
  }
}

function getMasterTime() {
  if (AppState.tracks.length > 0) {
    return AppState.tracks[0].wavesurfer.getCurrentTime();
  }
  return null;
}

function getMasterDuration() {
  if (AppState.tracks.length > 0) {
    return AppState.tracks[0].wavesurfer.getDuration();
  }
  return 0;
}

// ============================================
//  Time Display
// ============================================
function updateTimeDisplay() {
  const current = getMasterTime() || 0;
  const total = getMasterDuration() || 0;
  DOM.timeDisplay.textContent = `${formatTime(current)} / ${formatTime(total)}`;

  if (AppState.lyricsMode === 'list' && DOM.lyricsAutoscrollToggle && DOM.lyricsAutoscrollToggle.checked) {
    let activeIdx = -1;
    for (let i = 0; i < AppState.lyricsLines.length; i++) {
      const line = AppState.lyricsLines[i];
      if (line.timestamp !== null && line.timestamp <= current + 0.1) {
        activeIdx = i;
      }
    }
    if (activeIdx !== -1 && activeIdx !== AppState.activeLyricsIndex) {
      setActiveLyrics(activeIdx);
    }
  }
}

function formatTime(seconds) {
  if (seconds === null || isNaN(seconds)) return '00:00.0';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${ms}`;
}

function formatTimeShort(seconds) {
  if (seconds === null || isNaN(seconds)) return '—:——';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

let waveAutoscrollLock = false;

function handleWaveAutoscroll() {
  if (!DOM.waveAutoscrollToggle || !DOM.waveAutoscrollToggle.checked) return;
  if (!AppState.tracks.length || !AppState.tracks[0].wavesurfer) return;

  const master = AppState.tracks[0];
  const currentTime = master.wavesurfer.getCurrentTime();
  const duration = master.wavesurfer.getDuration();
  if (duration === 0) return;

  const innerTrack = DOM.tracksInner;
  const container = DOM.tracksScrollContainer;
  if (!innerTrack || !container) return;

  const percent = currentTime / duration;
  const playheadX = percent * innerTrack.offsetWidth;

  const viewLeft = container.scrollLeft;
  const viewWidth = container.clientWidth;
  const viewRight = viewLeft + viewWidth;

  // DAW-style Page Flip: smoothly paging instead of constant subpixel tracking
  // to perfectly eliminate the high-frequency visual jitter (Chikachika)
  if (playheadX > viewRight - (viewWidth * 0.25) || playheadX < viewLeft) {
    if (!waveAutoscrollLock) {
      waveAutoscrollLock = true;
      // 画面の左端から15%の位置にプレイヘッドが来るように、少し早めにページをめくる
      container.scrollTo({
        left: playheadX - (viewWidth * 0.15),
        behavior: 'smooth'
      });
      setTimeout(() => { waveAutoscrollLock = false; }, 400); // allow animation to complete
    }
  }
}

// ============================================
//  Lyrics Management
// ============================================
function setLyricsMode(mode) {
  AppState.lyricsMode = mode;

  DOM.lyricsTabEdit.classList.toggle('active', mode === 'edit');
  DOM.lyricsTabList.classList.toggle('active', mode === 'list');

  DOM.lyricsImportArea.style.display = mode === 'edit' ? 'flex' : 'none';
  DOM.lyricsListContainer.classList.toggle('active', mode === 'list');

  if (DOM.stampBtn) {
    DOM.stampBtn.style.display = mode === 'list' ? 'inline-flex' : 'none';
  }

  if (DOM.lyricsAutoscrollContainer) {
    DOM.lyricsAutoscrollContainer.style.display = mode === 'list' ? 'flex' : 'none';
  }

  if (DOM.lyricsImportBtn) {
    DOM.lyricsImportBtn.style.display = mode === 'edit' ? 'inline-flex' : 'none';
  }
}

async function importLyrics() {
  const text = DOM.lyricsTextarea.value.trim();
  if (!text) {
    showToast('歌詞を貼り付けるか、曲名を入力してください', 'error');
    return;
  }

  const urlPattern = /^(https?:\/\/[^\s]+)$/;
  if (urlPattern.test(text)) {
    // If it's a direct URL, don't fetch automatically (for compliance),
    // but offer to open it for the user.
    const url = text;
    window.open(url, '_blank');
    showToast('歌詞サイトを開きました。内容をコピーして貼り付けてください。', 'info');
    return;
  } else if (text.length < 50 && !text.includes('\n')) {
    // Treat short text as a single line, do not search
    // Just parse it as raw text
  }

  processRawLyricsText(text, false);
}

let currentProgressToast = null;
function updateSearchProgress(message, isDone = false, isError = false) {
  if (!currentProgressToast) {
    currentProgressToast = document.createElement('div');
    currentProgressToast.className = `toast toast-info search-progress`;
    DOM.toastContainer.appendChild(currentProgressToast);
  }

  const icon = isDone ? '✓' : (isError ? '✕' : '🔍');
  currentProgressToast.innerHTML = `<span>${icon}</span> ${escapeHtml(message)}`;

  if (isDone || isError) {
    const t = currentProgressToast;
    currentProgressToast = null;
    if (t) t.className = `toast toast-${isError ? 'error' : 'success'}`;
    setTimeout(() => {
      if (t) {
        t.classList.add('toast-out');
        setTimeout(() => t.remove(), 300);
      }
    }, 4000);
  }
}

async function searchLyricsByTitle(query) {
  const cleanQuery = query.trim().replace(/[ 　]+/g, ' ');
  updateSearchProgress(`「${cleanQuery}」を検索しています...`);

  const corsProxies = [
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url) => `https://api.codetabs.com/v1/proxy?quest=${url}`
  ];

  // For sites that require exact Title matching (can't handle "Title Artist" natively)
  const titleOnlyQuery = cleanQuery.split(' ')[0];

  const searchPasses = [
    { site: 'Uta-Net', url: `https://www.uta-net.com/search/?Aselect=1&Keyword=${encodeURIComponent(titleOnlyQuery)}` },
    { site: 'J-Lyric', url: `http://search.j-lyric.net/index.php?kt=${encodeURIComponent(titleOnlyQuery)}&ct=1&ca=1` },
    { site: 'UtaTen', url: `https://utaten.com/search?title=${encodeURIComponent(titleOnlyQuery)}` },
    { site: 'Piapro (ボカロ)', url: `https://piapro.jp/search/?keyword=${encodeURIComponent(cleanQuery)}` }, // Search all categories on Piapro
    { site: 'Piapro (Yahoo検索)', url: `https://search.yahoo.co.jp/search?p=${encodeURIComponent('site:piapro.jp/t/ ' + cleanQuery)}` } // Ultimate fallback using Yahoo search
  ];

  const candidates = [];

  for (const pass of searchPasses) {
    updateSearchProgress(`「${pass.site}」を調査中...`);
    let hitOnSite = false;

    for (const proxyFn of corsProxies) {
      try {
        const res = await fetch(proxyFn(pass.url), { signal: AbortSignal.timeout(6000) });
        if (!res.ok) continue;
        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // 1. Uta-Net (Supports both Desktop <tr> and Smartphone <li> layouts)
        if (pass.site === 'Uta-Net') {
          // Both layouts are usually inside a form or specific div when they are actual search results
          // We can isolate the search results block to avoid picking up the 'popular songs' sidebar ranking
          const resultForms = doc.querySelectorAll('form[action="/search/"]');
          let resultContainer = doc;
          // The results are typically in a table or list following the search form's result area
          if (doc.getElementById('kashi_area') || doc.querySelector('.songlist-info')) {
            resultContainer = doc.querySelector('.songlist-info') || doc;
          }

          // Desktop layout
          resultContainer.querySelectorAll('tr').forEach(tr => {
            const a = tr.querySelector('a[href*="/song/"]');
            if (a) {
              const artist = tr.querySelector('.td2') || tr.querySelector('a[href*="/artist/"]');
              candidates.push({
                title: a.textContent.trim(),
                artist: artist ? artist.textContent.trim() : '不明',
                url: new URL(a.getAttribute('href'), 'https://www.uta-net.com').href
              });
            }
          });

          // Smartphone layout
          // Reliable extraction: Look for the specific "検索結果" block
          const resIdx = html.indexOf('<p class="title">検索結果</p>');
          if (resIdx !== -1) {
            const resHtml = html.substring(resIdx);
            const olIdx = resHtml.indexOf('<ol');
            const endOlIdx = resHtml.indexOf('</ol>', olIdx);
            if (olIdx !== -1 && endOlIdx !== -1) {
              const searchResultList = resHtml.substring(olIdx, endOlIdx);
              const liMatches = searchResultList.match(/<li[^>]*col-12[^>]*>([\s\S]*?)<\/li>/gi) || [];

              liMatches.forEach(liHtml => {
                const links = liHtml.match(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/g) || [];
                // links[0] is usually the thumbnail, links[1] is the song, links[2] is the artist
                if (links.length >= 2) {
                  const songMatch = links[1].match(/href=["']([^"']*)["'][^>]*>(.*?)<\/a>/);
                  const artistMatch = links.length >= 3 ? links[2].match(/href=["']([^"']*)["'][^>]*>(.*?)<\/a>/) : null;
                  if (songMatch) {
                    candidates.push({
                      title: songMatch[2].replace(/<[^>]*>?/gm, '').trim(),
                      artist: artistMatch ? artistMatch[2].replace(/<[^>]*>?/gm, '').trim() : '不明',
                      url: new URL(songMatch[1], 'https://www.uta-net.com').href
                    });
                  }
                }
              });
            }
          }
        }
        // 2. J-Lyric
        else if (pass.site === 'J-Lyric') {
          doc.querySelectorAll('.bdy').forEach(bdy => {
            const a = bdy.querySelector('a[href*=".html"]');
            if (a && !a.href.includes('artist')) {
              const artist = bdy.querySelector('.sml');
              candidates.push({
                title: a.textContent.trim(),
                artist: artist ? artist.textContent.trim().replace(/^by\s*/i, '') : '不明',
                url: new URL(a.getAttribute('href'), 'http://j-lyric.net').href
              });
            }
          });
        }
        // 3. UtaTen
        else if (pass.site === 'UtaTen') {
          doc.querySelectorAll('tr').forEach(tr => {
            const titleA = tr.querySelector('.searchResult__title a');
            const artistA = tr.querySelector('.searchResult__artist a');
            if (titleA) {
              candidates.push({
                title: titleA.textContent.trim(),
                artist: artistA ? artistA.textContent.trim() : '不明',
                url: new URL(titleA.getAttribute('href'), 'https://utaten.com').href
              });
            }
          });
          // Fallback
          if (candidates.length === 0) {
            doc.querySelectorAll('p.searchResult__title a').forEach(a => {
              candidates.push({
                title: a.textContent.trim(),
                artist: '不明',
                url: new URL(a.getAttribute('href'), 'https://utaten.com').href
              });
            });
          }
        }
        // 4. Piapro
        else if (pass.site === 'Piapro (ボカロ)') {
          doc.querySelectorAll('.title, .card_title, .piapro-card-title').forEach(t => {
            const a = t.querySelector('a[href*="/t/"]') || (t.tagName === 'A' ? t : null);
            if (a && a.href.includes('/t/')) {
              const auth = doc.querySelector(`a[href="${a.getAttribute('href')}"]`)?.closest('.card, .contents, tr, li')?.querySelector('.name, .author, .user');
              candidates.push({
                title: a.textContent.trim() || 'ボカロ曲',
                artist: auth ? auth.textContent.trim() : 'Piaproユーザー',
                url: new URL(a.getAttribute('href'), 'https://piapro.jp').href
              });
            }
          });
          // Fallback simple link parse for piapro across global results
          if (candidates.length === 0) {
            doc.querySelectorAll('a[href^="/t/"]').forEach(a => {
              const txt = a.textContent.trim();
              // Prevent generic links like "Download" or "Bookmark"
              if (txt.length > 2 && !txt.match(/^(ダウンロード|ブックマーク|ライセンス|詳細)$/)) {
                candidates.push({ title: txt, artist: 'Piapro投稿', url: new URL(a.getAttribute('href'), 'https://piapro.jp').href });
              }
            });
          }
        }
        // 5. Piapro Yahoo Search
        else if (pass.site === 'Piapro (Yahoo検索)') {
          const links = html.match(/<a[^>]+href=["'](https:\/\/piapro\.jp\/t\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi) || [];
          links.forEach(l => {
            const urlMatch = l.match(/href=["'](https:\/\/piapro\.jp\/t\/[^"']+)["']/);
            let titleMatch = l.match(/>([\s\S]*?)<\/a>/);
            if (urlMatch && titleMatch) {
              let cleanTitle = titleMatch[1].replace(/<[^>]*>?/gm, '').trim();
              // format often looks like: "テキスト「花咲き乱れる浮世世界」 - ピアプロ"
              cleanTitle = cleanTitle.replace(/^[^「]*「/, '').replace(/」.*$/, '');
              if (cleanTitle.length > 2 && !cleanTitle.includes('yahoo.co.jp')) {
                candidates.push({
                  title: cleanTitle,
                  artist: 'Yahoo検索',
                  url: urlMatch[1]
                });
              }
            }
          });
        }
        // Generic/Other
        else {
          doc.querySelectorAll('a').forEach(a => {
            const hr = a.getAttribute('href') || '';
            const text = a.textContent.trim();
            if (text.length > 2 && (hr.includes('/song/') || hr.match(/\d+\.html$/)) && !hr.includes('artist')) {
              candidates.push({ title: text, artist: '不明', url: new URL(hr, pass.url).href });
            }
          });
        }

        if (candidates.length > 0) {
          hitOnSite = true;
          updateSearchProgress(`「${pass.site}」で候補を発見しました！計算中...`);
          await new Promise(r => setTimeout(r, 600));
          break;
        }
      } catch (e) {
        console.warn('Proxy attempt failed', e);
      }
    }

    if (hitOnSite) {
      break; // If we found something on the current site, stop checking next sites.
    } else {
      updateSearchProgress(`「${pass.site}」にはありませんでした。次を探します...`);
      await new Promise(r => setTimeout(r, 600));
    }
  }

  if (candidates.length > 0) {
    const uniqueCandidates = [];
    const seenUrls = new Set();
    for (const c of candidates) {
      if (!seenUrls.has(c.url) && c.title.length > 1) {
        seenUrls.add(c.url);
        uniqueCandidates.push(c);
      }
    }

    // Sort to try and find the best match by checking each word
    const queryWords = cleanQuery.toLowerCase().split(' ');
    uniqueCandidates.sort((a, b) => {
      const aText = (a.title + ' ' + a.artist).toLowerCase();
      const bText = (b.title + ' ' + b.artist).toLowerCase();

      let aScore = 0;
      let bScore = 0;
      queryWords.forEach(w => {
        if (aText.includes(w)) aScore += 1;
        if (bText.includes(w)) bScore += 1;
      });

      // Bonus for exact title match to the first word
      if (a.title.toLowerCase() === queryWords[0]) aScore += 0.5;
      if (b.title.toLowerCase() === queryWords[0]) bScore += 0.5;

      return bScore - aScore;
    });

    updateSearchProgress(`完了：${uniqueCandidates.length}件の候補がみつかりました。`, true);
    showSelectionModal(uniqueCandidates);
    return true;
  }

  updateSearchProgress('見つかりませんでした。別のキーワードか直接URLをお試しください。', false, true);
  return false;
}

function syncTracksWidth() {
  if (!AppState.tracks.length) return;

  // Calculate the max duration-based width
  const zoom = Number(DOM.zoomSlider.value);
  let maxWidth = 0;

  // If zoom is > 0, calculate true width, else leave it 0 to fit flex parent
  if (zoom > 0) {
    AppState.tracks.forEach(track => {
      const duration = track.wavesurfer.getDuration();
      const width = duration * zoom;
      if (width > maxWidth) maxWidth = width;
    });
  }

  if (maxWidth > 0) {
    // Add some buffer and account for sidebar
    const totalWidth = maxWidth + 140 + 20;
    if (DOM.tracksInner) {
      DOM.tracksInner.style.width = `${totalWidth}px`;
    }
  } else {
    // Fit to container dynamically
    if (DOM.tracksInner) {
      DOM.tracksInner.style.width = '100%';
    }
  }

  if (DOM.waveformTimeline) {
    DOM.waveformTimeline.style.width = `calc(100% - 140px)`;
    DOM.waveformTimeline.style.marginLeft = `140px`;
  }
}

function showSelectionModal(candidates) {
  if (!DOM.selectionModal || !DOM.selectionList) return;

  DOM.selectionList.innerHTML = '';
  candidates.slice(0, 10).forEach(c => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="item-title">${escapeHtml(c.title)}</div>
      <div class="item-artist">${escapeHtml(c.artist)}</div>
      <div style="font-size: 0.75rem; color: var(--primary); margin-top: 4px;">公式ページを開く ↗</div>
    `;
    li.addEventListener('click', () => {
      DOM.selectionModal.style.display = 'none';
      window.open(c.url, '_blank');
      showToast('サイトを開きました。歌詞をコピーして貼り付けてください。', 'info');
    });
    DOM.selectionList.appendChild(li);
  });

  DOM.selectionModal.style.display = 'flex';
}

async function fetchWebsiteLyrics(url) {
  updateSearchProgress('ページの解析を開始します...', false);
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${url}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`
  ];

  for (const proxyUrl of proxies) {
    try {
      const res = await fetch(proxyUrl);
      if (!res.ok) continue;

      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Selectors for common lyric sites
      const selectors = [
        '#Lyric', // J-Lyric
        '#kashi_area', // Uta-Net
        '.hiragana', // UtaTen (sometimes inside)
        '.lyricBody', // UtaTen main
        '.contents_text_txt', // Piapro Text modern
        '.lyric-text', // Piapro related or others
        '#lyric_area', // PetitLyrics
        '.lyrics',
        '[class*="lyric"]',
        '.works_text', // Piapro Text legacy
        '.cd-txt', // Piapro alternative
        '.post-content' // general blogs
      ];

      let outText = '';

      // Clean up common noise FIRST
      const noise = ['nav', 'header', 'footer', 'aside', 'script', 'style', 'button', 'input', 'iframe', '.ads', '.menu', '.side', '.related', '#header', '#footer'];
      noise.forEach(s => doc.querySelectorAll(s).forEach(el => el.remove()));

      // 1. Precise Selectors
      for (const sel of selectors) {
        const el = doc.querySelector(sel);
        if (el) {
          // Remove scripts, styles, inserted ads/links
          el.querySelectorAll('script, style, ins, a, .rt').forEach(s => s.remove());

          let cleanHtml = el.innerHTML;
          // CRITICAL: Strip out <rt> and <rp> tags using regex to be absolutely sure furigana is gone
          cleanHtml = cleanHtml.replace(/<rt[^>]*>[\s\S]*?<\/rt>/gi, '');
          cleanHtml = cleanHtml.replace(/<rp[^>]*>[\s\S]*?<\/rp>/gi, '');

          el.innerHTML = cleanHtml.replace(/<br\s*\/?>/gi, '\n');
          const t = el.textContent.trim();
          if (t.length > 50) {
            outText = t;
            break;
          }
        }
      }

      // 2. Generic fallback
      if (outText.length < 50) {
        let bestScore = 0;
        doc.querySelectorAll('div, article, main, section, p').forEach(el => {
          if (el.querySelectorAll('a').length > 5) return;
          const text = el.innerText || '';
          const lines = text.split('\n').filter(l => l.trim().length > 4).length;
          if (lines > bestScore && text.length > 100) {
            bestScore = lines;
            const clone = el.cloneNode(true);
            clone.innerHTML = clone.innerHTML.replace(/<br\s*\/?>/gi, '\n');
            outText = clone.textContent.trim();
          }
        });
      }

      // Final cleanup
      if (outText.length > 50) {
        const cleaned = outText.split('\n')
          .map(l => l.trim())
          .filter(l => {
            if (l.length < 2) return false;
            // NAVIGATION FILTER
            if (l.match(/^(TOP|MENU|HOME|索引|アーティスト|検索|ログイン|新規登録|利用規約|プライバシー|運営|著作権|マイページ|お知らせ)/i)) return false;
            if (l.match(/(一覧|返信|コメント|シェア|ツイート|投稿者)/)) return false;
            return true;
          }).join('\n');

        if (cleaned.length > 50) {
          updateSearchProgress('歌詞の抽出に成功しました！', true);
          processRawLyricsText(cleaned, true);
          return true;
        }
      }
    } catch (e) {
      console.warn('Proxy fetch failed for:', proxyUrl, e);
    }
  }

  // Only show error if we haven't already returned success
  if (!fromUrl) {
    updateSearchProgress('ページの解析に失敗しました。手動で入力してください。', false, true);
  } else {
    showToast('歌詞の自動取得に失敗しました', 'error');
  }
  return false;
}

/**
 * Advanced Clean-up: Removes Ruby characters, Metadata, and Noise from pasted text.
 */
function cleanLyricsText(text) {
  if (!text) return "";

  // 1. Remove Ruby characters patterns: 歌(うた), 歌《うた》, 歌[うた]
  let cleaned = text.replace(/\([^)]+\)/g, ''); // ( )
  cleaned = cleaned.replace(/《[^》]+》/g, ''); // 《 》
  cleaned = cleaned.replace(/\[[^\]]+\]/g, ''); // [ ]

  const lines = cleaned.split('\n');
  const result = lines
    .map(line => line.trim())
    .filter(line => {
      if (line.length === 0) return false;

      // 2. Filter obvious Metadata / Noise lines (作詞, 作曲 etc.)
      const lowerLine = line.toLowerCase();
      const metadataKeywords = [
        '作詞', '作曲', '編曲', '唄', '歌：', '歌:', 'artist', 'lyric', 'compos', 'arrang',
        'jasrac', 'nextone', 'rights reserved', 'copy', 'recorded', 'published'
      ];

      // Only filter out if it's a short line that looks like a header
      if (line.length < 50 && metadataKeywords.some(k => lowerLine.includes(k))) {
        return false;
      }

      return true;
    });

  return result.join('\n');
}

function processRawLyricsText(text, fromUrl = false) {
  // Apply our new powerful cleaning logic
  let polishedText = cleanLyricsText(text);

  AppState.lastRawInput = text;
  if (DOM.undoImportBtn && DOM.lyricsTextarea.value !== '') {
    DOM.undoImportBtn.style.display = 'inline-flex';
  }

  if (DOM.splitSpaceCheckbox && DOM.splitSpaceCheckbox.checked) {
    // Only split on full-width Japanese spaces (　) as requested by the user,
    // preserving half-width spaces ( ) for English words.
    polishedText = polishedText.replace(/[　]+/g, '\n');
  }

  const lines = polishedText.split('\n');

  AppState.lyricsLines = lines
    .map(line => line.trim())
    // Exclude completely empty lines
    .filter(line => line.length > 0)
    .map(line => {
      // タイムスタンプが含まれる場合を考慮（例: [00:15.22] または 0:15 または [00:15]）
      const match = line.match(/^\[?(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]?\s*(.*)/);
      if (match) {
        const min = parseInt(match[1]);
        const sec = parseFloat(match[2]);
        return {
          text: match[3].trim(),
          timestamp: min * 60 + sec,
          memo: ''
        };
      }
      return {
        text: line,
        timestamp: null,
        memo: ''
      };
    });

  if (AppState.lyricsLines.length === 0) {
    showToast('有効な歌詞が見つかりません', 'error');
    return;
  }

  finalizeImport(fromUrl ? `サイトから ${AppState.lyricsLines.length} 行をインポートしました` : `${AppState.lyricsLines.length} 行の歌詞を展開しました`);
}

function finalizeImport(msg) {
  renderLyricsList();
  setLyricsMode('list');
  DOM.lyricsCount.style.display = 'inline';
  DOM.lyricsCount.textContent = `${AppState.lyricsLines.length} 行`;

  if (AppState.lyricsLines.length > 0) {
    setActiveLyrics(0);
  }

  showToast(msg, 'success');
  markDirty();
}

function clearLyrics() {
  DOM.lyricsTextarea.value = '';
  AppState.lyricsLines = [];
  AppState.activeLyricsIndex = -1;
  DOM.lyricsList.innerHTML = '';
  DOM.lyricsCount.style.display = 'none';
  setLyricsMode('edit');
  hideMemoEditor();
  showToast('歌詞をクリアしました', 'info');
  markDirty();
}

function updateAllRegions() {
  AppState.tracks.forEach(track => {
    updateRegionsForWavesurfer(track.wavesurfer);
  });
}

function updateRegionsForWavesurfer(ws) {
  if (!ws || !ws.regionsPlugin) return;
  ws.regionsPlugin.clearRegions();

  AppState.lyricsLines.forEach((line, index) => {
    if (line.timestamp !== null) {
      ws.regionsPlugin.addRegion({
        id: `marker-${index}`,
        start: line.timestamp,
        content: '',
        color: getMarkerColor(index, 0.5),
        drag: true,
        resize: false
      });
    }
  });
}

function renderLyricsList() {
  DOM.lyricsList.innerHTML = '';

  AppState.lyricsLines.forEach((line, index) => {
    const li = document.createElement('li');
    li.className = 'lyrics-item';
    li.dataset.index = index;

    if (index === AppState.activeLyricsIndex) li.classList.add('active');
    if (line.memo) li.classList.add('has-memo');

    const bgColorStyle = line.timestamp !== null ? `style="background: ${getMarkerColor(index, 1)}; color: #fff; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);"` : '';

    li.innerHTML = `
      <div class="col-lyric">
        <span class="lyrics-item-index">${index + 1}</span>
        <span class="lyrics-item-timestamp ${line.timestamp === null ? 'empty' : ''}" data-action="seek" ${bgColorStyle}>
          ${line.timestamp !== null ? formatTimeShort(line.timestamp) : '—:——'}
        </span>
        <div class="lyrics-item-actions">
          <button class="lyrics-item-action-btn" data-action="stamp" title="現在位置でスタンプ">⏱</button>
          <button class="lyrics-item-action-btn" data-action="clear-time" title="時間をクリア">🗑</button>
        </div>
        <span class="lyrics-item-text">${escapeHtml(line.text)}</span>
      </div>
      <div class="col-memo" style="position:relative; display:flex; flex-direction:row; align-items:center;">
        <button class="btn btn-icon clear-memo-btn" data-action="clear-memo" title="メモを消去" style="margin-right:4px;">✕</button>
        <textarea class="unified-memo-input" data-index="${index}" placeholder="ここに修正メモを入力...">${escapeHtml(line.memo || '')}</textarea>
      </div>
    `;

    // Click on lyric line
    li.addEventListener('click', (e) => {
      const stampBtn = e.target.closest('[data-action="stamp"]');
      if (stampBtn) {
        e.stopPropagation();
        stampTimestampAtIndex(index);
        return;
      }

      const clearBtn = e.target.closest('[data-action="clear-time"]');
      if (clearBtn) {
        e.stopPropagation();
        clearTimestampAtIndex(index);
        return;
      }

      const clearMemoBtn = e.target.closest('[data-action="clear-memo"]');
      if (clearMemoBtn) {
        e.stopPropagation();
        AppState.lyricsLines[index].memo = '';
        const textarea = li.querySelector('.unified-memo-input');
        if (textarea) textarea.value = '';
        markDirty();
        return;
      }

      const seekBtn = e.target.closest('[data-action="seek"]');
      if (seekBtn && AppState.lyricsLines[index].timestamp !== null) {
        e.stopPropagation();
        const master = AppState.tracks[0];
        if (master && master.wavesurfer) {
          const time = AppState.lyricsLines[index].timestamp;
          const duration = master.wavesurfer.getDuration();
          if (duration > 0) {
            master.wavesurfer.seekTo(time / duration);
            syncAllTracks();
            play(); // Added: sync and play as requested
          }
        }
        return;
      }
    });

    DOM.lyricsList.appendChild(li);
  });
}

function setActiveLyrics(index) {
  if (index < 0 || index >= AppState.lyricsLines.length) return;

  AppState.activeLyricsIndex = index;

  // Update list highlight and scroll active item into view
  document.querySelectorAll('.lyrics-item').forEach((item, i) => {
    item.classList.toggle('active', i === index);
    if (i === index) {
      if (!DOM.lyricsAutoscrollToggle || DOM.lyricsAutoscrollToggle.checked) {
        // Scroll relative to the container, preventing the entire window/body from scrolling
        const container = DOM.lyricsListContainer;
        if (container) {
          const itemTop = item.offsetTop;
          const itemBottom = itemTop + item.clientHeight;
          const viewTop = container.scrollTop;
          const viewHeight = container.clientHeight;
          const viewBottom = viewTop + viewHeight;

          // 歌詞リストの「ページフリップ」：下端（10%手前）に到達するか、上にはみ出たら少し下にめくる
          if (itemBottom > viewBottom - (viewHeight * 0.1) || itemTop < viewTop) {
            const targetTop = itemTop - (viewHeight * 0.2);
            container.scrollTo({ top: targetTop, behavior: 'smooth' });
          }
        }
      }
    }
  });
}

// Obsolete memo editor functions removed

function onMemoInput() {
  if (AppState.activeLyricsIndex < 0) return;
  AppState.lyricsLines[AppState.activeLyricsIndex].memo = DOM.memoInput.value;
  // Update memo indicator in lyrics list
  updateLyricsItemMemoIndicator(AppState.activeLyricsIndex);
  markDirty();
}

function clearCurrentMemo() {
  if (AppState.activeLyricsIndex < 0) return;
  AppState.lyricsLines[AppState.activeLyricsIndex].memo = '';
  DOM.memoInput.value = '';
  updateLyricsItemMemoIndicator(AppState.activeLyricsIndex);
  markDirty();
}

function updateLyricsItemMemoIndicator(index) {
  const item = DOM.lyricsList.children[index];
  if (!item) return;
  const line = AppState.lyricsLines[index];
  item.classList.toggle('has-memo', !!line.memo);

  // Update or add/remove indicator
  let indicator = item.querySelector('.lyrics-item-memo-indicator');
  if (line.memo && !indicator) {
    indicator = document.createElement('span');
    indicator.className = 'lyrics-item-memo-indicator';
    indicator.textContent = '📝';
    item.appendChild(indicator);
  } else if (!line.memo && indicator) {
    indicator.remove();
  }
}

// ============================================
//  Timestamp Stamping
// ============================================
function stampTimestamp() {
  if (AppState.activeLyricsIndex < 0) {
    showToast('歌詞を選択してからスタンプしてください', 'error');
    return;
  }

  const currentTime = getMasterTime();
  if (currentTime === null) {
    showToast('音声を先に読み込んでください', 'error');
    return;
  }

  const index = AppState.activeLyricsIndex;
  stampTimestampAtIndex(index, currentTime, true);
}

function stampTimestampAtIndex(index, customTime = null, autoAdvance = false) {
  // 自動追従がオンの時にスタンプを押したら自動でオフにする（邪魔にならないように）
  if (DOM.lyricsAutoscrollToggle && DOM.lyricsAutoscrollToggle.checked) {
    DOM.lyricsAutoscrollToggle.checked = false;
    showToast('スタンプ操作のため歌詞追従をオフにしました', 'info');
  }

  const currentTime = customTime !== null ? customTime : getMasterTime();
  if (currentTime === null) {
    showToast('音声を先に読み込んでください', 'error');
    return;
  }

  AppState.lyricsLines[index].timestamp = currentTime;
  updateAllRegions();

  // Update the timestamp display in the lyrics list
  const item = DOM.lyricsList.children[index];
  if (item) {
    const tsEl = item.querySelector('.lyrics-item-timestamp');
    tsEl.textContent = formatTimeShort(currentTime);
    tsEl.classList.remove('empty');
    tsEl.style.background = getMarkerColor(index, 1);
    tsEl.style.color = '#fff';
    tsEl.style.textShadow = '1px 1px 2px rgba(0,0,0,0.5)';
  }

  // No separate memo panel to update

  // Auto-advance to next line
  if (autoAdvance) {
    const nextIndex = index + 1;
    if (nextIndex < AppState.lyricsLines.length) {
      setActiveLyrics(nextIndex);
    }
  }

  markDirty();
}

function clearTimestampAtIndex(index) {
  AppState.lyricsLines[index].timestamp = null;
  updateAllRegions();

  const item = DOM.lyricsList.children[index];
  if (item) {
    const tsEl = item.querySelector('.lyrics-item-timestamp');
    tsEl.textContent = '—:——';
    tsEl.classList.add('empty');
    tsEl.style.background = '';
    tsEl.style.color = '';
    tsEl.style.textShadow = '';
  }

  if (index === AppState.activeLyricsIndex) {
    DOM.memoLyricsTimestamp.textContent = 'タイムスタンプ未設定';
  }
}

function seekToTime(seconds) {
  if (AppState.vocalWavesurfer && AppState.vocalLoaded) {
    const ratio = seconds / AppState.vocalWavesurfer.getDuration();
    AppState.vocalWavesurfer.seekTo(Math.max(0, Math.min(1, ratio)));
    syncKaraokeToVocal();
  } else if (AppState.karaokeWavesurfer && AppState.karaokeLoaded) {
    const ratio = seconds / AppState.karaokeWavesurfer.getDuration();
    AppState.karaokeWavesurfer.seekTo(Math.max(0, Math.min(1, ratio)));
  }
  updateTimeDisplay();
}

// ============================================
//  Copy to Clipboard
// ============================================
function copyToClipboard() {
  if (AppState.lyricsLines.length === 0) {
    showToast('コピーするデータがありません', 'error');
    return;
  }

  // Filter lines that have both text AND memo (Retake focused)
  const lines = AppState.lyricsLines
    .filter(line => line.memo && line.memo.trim().length > 0)
    .map(line => {
      const ts = line.timestamp !== null ? formatTimeShort(line.timestamp) : '—:——';
      const memo = line.memo ? `\n${line.memo}` : '';
      return `${ts} ${line.text}${memo}`;
    });

  if (lines.length === 0) {
    showToast('タイムスタンプまたはメモのある行がありません', 'error');
    return;
  }

  const text = lines.join('\n\n');

  DOM.previewTextarea.value = text;
  if (DOM.previewGreetingBtn) DOM.previewGreetingBtn.style.display = 'inline-block';
  DOM.previewModal.style.display = 'flex';
}

// ============================================
/**
 * Custom Confirm Modal (replaces native confirm() which browsers can silently block)
 */
function showConfirmModal(message, onConfirm, onCancel) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.style.zIndex = '9999';
  overlay.innerHTML = `
    <div class="modal" style="max-width: 420px; text-align: center;">
      <h2 style="margin-bottom: var(--sp-6);">⚠️ 確認</h2>
      <p style="margin-bottom: var(--sp-8); white-space: pre-line; color: var(--text-secondary);">${message}</p>
      <div class="modal-actions" style="display:flex; justify-content:center; gap: var(--sp-4);">
        <button class="btn btn-secondary" id="confirm-modal-cancel">キャンセル</button>
        <button class="btn btn-primary" id="confirm-modal-ok" style="background: var(--danger, #e74c3c);">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const handleCancel = () => {
    overlay.remove();
    if (onCancel) onCancel();
  };

  const handleOk = () => {
    overlay.remove();
    onConfirm();
  };

  document.getElementById('confirm-modal-cancel').addEventListener('click', handleCancel);
  document.getElementById('confirm-modal-ok').addEventListener('click', handleOk);
}

async function doResetAll() {
  console.log('--- Full Reset Triggered ---');
  try {
    // 1. Stop and Clean Audio
    pause();
    if (AppState.tracks) {
      AppState.tracks.forEach(t => {
        if (t.wavesurfer) t.wavesurfer.destroy();
        if (t.element) t.element.remove();
      });
      AppState.tracks = [];
    }

    // 2. Reset Audio Storage
    await clearFilesFromDB();

    // 3. Reset GUI (Audio Area)
    const container = document.getElementById('dynamic-tracks');
    if (container) {
      container.innerHTML = `
        <div id="tracks-inner-container" class="tracks-inner">
          <div id="waveform-timeline" class="waveform-timeline"></div>
          <div id="tracks-list" style="display:flex; flex-direction:column; flex:1;"></div>
        </div>
      `;
    }
    cacheDOMReferences();

    // 4. Reset Project Metadata
    AppState.projectName = '';
    if (DOM.projectNameInput) DOM.projectNameInput.value = '';

    // 5. Reset lyrics
    AppState.lyricsLines = [];
    AppState.activeLyricsIndex = -1;
    if (DOM.lyricsTextarea) DOM.lyricsTextarea.value = '';
    if (DOM.lyricsList) DOM.lyricsList.innerHTML = '';
    if (DOM.lyricsCount) DOM.lyricsCount.style.display = 'none';

    setLyricsMode('edit');

    // 6. Reset offset
    AppState.offsetMs = 0;
    if (DOM.offsetValue) DOM.offsetValue.value = 0;

    // 7. Clear persistence
    localStorage.removeItem(STORAGE_KEY);
    AppState.isDirty = false;

    showToast('すべてのデータをリセットしました', 'info');
  } catch (err) {
    console.error('Reset failed:', err);
    showToast('リセット処理中にエラーが発生しました', 'error');
  }
}

function resetAll() {
  showConfirmModal('曲名、音源、歌詞、メモなど\n全てのデータをリセットしますか？\n\nこの操作は元に戻せません。', doResetAll);
}

// ============================================
//  Auto-Save / Restore (LocalStorage)
// ============================================
function markDirty() {
  AppState.isDirty = true;
}

function startAutosave() {
  setInterval(() => {
    if (AppState.isDirty) {
      saveToStorage();
      AppState.isDirty = false;
    }
  }, AUTOSAVE_INTERVAL);
}

function saveToStorage() {
  // If the app is empty, don't save (and remove existing key to ensure Reset works)
  if (AppState.tracks.length === 0 && AppState.lyricsLines.length === 0 && (!DOM.lyricsTextarea || DOM.lyricsTextarea.value === '')) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  try {
    const data = {
      theme: AppState.theme,
      projectName: AppState.projectName,
      offsetMs: AppState.offsetMs,
      lyricsLines: AppState.lyricsLines,
      activeLyricsIndex: AppState.activeLyricsIndex,
      lyricsText: DOM.lyricsTextarea ? DOM.lyricsTextarea.value : '',
      lyricsMode: AppState.lyricsMode,
      vocalFileName: AppState.vocalFileName,
      karaokeFileName: AppState.karaokeFileName,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (DOM.autosaveIndicator) DOM.autosaveIndicator.style.display = 'flex';
  } catch (e) {
    console.warn('LocalStorage save failed:', e);
  }
}

function checkAutoRestore() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    const data = JSON.parse(saved);
    if (!data || (!data.lyricsLines?.length && !data.lyricsText)) return;

    // Show restore modal
    showRestoreModal(data);
  } catch (e) {
    console.warn('Restore check failed:', e);
  }
}

function showRestoreModal(data) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'restore-modal-overlay';

  const savedDate = data.savedAt ? new Date(data.savedAt).toLocaleString('ja-JP') : '不明';
  const fileNote = (data.vocalFileName || data.karaokeFileName)
    ? `<br><small style="color: var(--text-tertiary)">※ 音声ファイルも自動復旧します</small>`
    : '';

  overlay.innerHTML = `
    <div class="modal">
      <h2>💾 前回のデータを復元</h2>
      <p>前回の作業データが見つかりました。<br>
      保存日時: ${savedDate}${fileNote}</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="restore-cancel">新規で始める</button>
        <button class="btn btn-primary" id="restore-confirm">復元する</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('restore-confirm').addEventListener('click', async () => {
    const btn = document.getElementById('restore-confirm');
    btn.disabled = true;
    btn.textContent = '復元中...';
    try {
      await restoreFromStorage(data);
    } catch (e) {
      console.error('Restore confirmed click failed:', e);
      showToast('復元中にエラーが発生しました', 'error');
    } finally {
      overlay.remove();
    }
  });

  document.getElementById('restore-cancel').addEventListener('click', () => {
    overlay.remove();
  });
}

async function restoreFromStorage(data) {
  // Hide Welcome Modal immediately
  if (DOM.welcomeModal) DOM.welcomeModal.style.display = 'none';

  // Restore offset
  if (data.offsetMs !== undefined) {
    AppState.offsetMs = data.offsetMs;
    if (DOM.offsetValue) DOM.offsetValue.value = data.offsetMs;
  }

  // Reload audio files from IndexedDB
  try {
    const savedFiles = await loadFilesFromDB();
    if (savedFiles && savedFiles.length > 0) {
      // CLEAR CURRENT STATE COMPLETELY BEFORE RESTORING
      if (AppState.tracks) {
        AppState.tracks.forEach(track => {
          if (track.wavesurfer) track.wavesurfer.destroy();
          if (track.element) track.element.remove();
        });
        AppState.tracks = [];
      }

      // Reset the track list GUI
      DOM.dynamicTracks.innerHTML = '<div id="tracks-inner-container" class="tracks-inner"><div id="waveform-timeline" class="waveform-timeline"></div><div id="tracks-list" style="display:flex; flex-direction:column; flex:1;"></div></div>';
      cacheDOMReferences(); // Refresh DOM references

      // Load master track first
      const masterData = savedFiles.find(f => f.role === 'master');
      if (masterData) {
        const file = new File([masterData.blob], masterData.name, { type: masterData.type });
        addTrack(file, true); // skipSave = true
        await new Promise(r => setTimeout(r, 450));
      }

      // Load others sequentially
      const others = savedFiles.filter(f => f.role !== 'master');
      for (const f of others) {
        const file = new File([f.blob], f.name, { type: f.type });
        addTrack(file, true); // skipSave = true
        await new Promise(r => setTimeout(r, 200));
      }
    }
  } catch (e) {
    console.error('Persistence Reload Error:', e);
  }

  // Restore lyrics
  if (data.lyricsText && DOM.lyricsTextarea) {
    DOM.lyricsTextarea.value = data.lyricsText;
  }

  if (data.lyricsLines && data.lyricsLines.length > 0) {
    AppState.lyricsLines = data.lyricsLines;
    renderLyricsList();
    setLyricsMode('list');
    if (DOM.lyricsCount) {
      DOM.lyricsCount.style.display = 'inline';
      DOM.lyricsCount.textContent = `${AppState.lyricsLines.length} 行`;
    }

    if (data.activeLyricsIndex >= 0 && data.activeLyricsIndex < data.lyricsLines.length) {
      setActiveLyrics(data.activeLyricsIndex);
    }
  } else if (data.lyricsMode) {
    setLyricsMode(data.lyricsMode);
  }

  // Restore Project Name
  if (data.projectName !== undefined) {
    AppState.projectName = data.projectName;
    if (DOM.projectNameInput) DOM.projectNameInput.value = data.projectName;
  }

  showToast('データを完全に復元しました', 'success');
  AppState.isDirty = false; // Just restored, no need to auto-save immediately
  if (DOM.autosaveIndicator) DOM.autosaveIndicator.style.display = 'flex';
}

// ============================================
//  Toast Notifications
// ============================================
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${escapeHtml(message)}`;

  DOM.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Sanitizes a string for use as a filename
 */
function sanitizeFilename(name) {
  if (!name) return 'project';
  // Remove characters that are problematic for filenames (Windows/Mac/Linux)
  return name.trim().replace(/[\\/:*?"<>|]/g, '');
}

/**
 * Helper to convert Blob to Base64
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function promptForProjectName(defaultName, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.style.zIndex = '9999';
  overlay.innerHTML = `
    <div class="modal" style="width: 400px; max-width: 90vw; text-align: center;">
      <h2 style="margin-bottom: var(--sp-4);">💾 プロジェクトを保存</h2>
      <p style="margin-bottom: var(--sp-6); color: var(--text-secondary); font-size: 0.9rem;">
        保存するプロジェクト名を入力してください：
      </p>
      <input type="text" id="popup-project-name" value="${escapeHtml(defaultName)}" placeholder="例：新曲_ボーカルチェック" style="width: 100%; padding: var(--sp-4) var(--sp-6); border: 2px solid var(--primary); border-radius: var(--radius-sm); background: var(--input-bg); color: var(--text-primary); margin-bottom: var(--sp-6); font-size: 1rem; text-align: center; outline: none;">
      <div class="modal-actions" style="display:flex; justify-content:center; gap: var(--sp-4);">
        <button class="btn btn-secondary" id="popup-name-cancel">キャンセル</button>
        <button class="btn btn-primary" id="popup-name-ok" style="font-weight: bold;">保存処理へ進む</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = document.getElementById('popup-project-name');
  input.focus();
  input.select();

  const close = () => overlay.remove();

  document.getElementById('popup-name-cancel').addEventListener('click', close);

  const submit = () => {
    const val = input.value.trim();
    if (val) {
      AppState.projectName = val;
      if (DOM.projectNameInput) DOM.projectNameInput.value = val;
      markDirty();
    }
    close();
    onConfirm(val);
  };

  document.getElementById('popup-name-ok').addEventListener('click', submit);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
    if (e.key === 'Escape') close();
  });
}

/**
 * Exports the project state to a .vcn file
 * Now includes audio files as Base64 for complete restoration.
 */
function exportProject() {
  console.log('--- Project Export Triggered ---');

  const hasData = (AppState.lyricsLines && AppState.lyricsLines.length > 0) ||
    (AppState.tracks && AppState.tracks.length > 0);

  if (!hasData) {
    showToast('エクスポートするデータがありません', 'error');
    return;
  }

  // Suggest text if no project name exists
  let suggestion = AppState.projectName || '';
  if (!suggestion && AppState.lyricsLines && AppState.lyricsLines.length > 0 && AppState.lyricsLines[0].text) {
    suggestion = AppState.lyricsLines[0].text.substring(0, 15);
  }

  promptForProjectName(suggestion, async (confirmedName) => {
    showToast('プロジェクトをパッケージ化しています...', 'info');

    // Load audio files from IndexedDB to include in project
    let audioFiles = [];
    try {
      const savedFiles = await loadFilesFromDB();
      for (const f of savedFiles) {
        const base64 = await blobToBase64(f.blob);
        audioFiles.push({
          role: f.role,
          name: f.name,
          type: f.type,
          data: base64
        });
      }
    } catch (e) {
      console.warn('Failed to package audio files:', e);
    }

    const baseName = sanitizeFilename(confirmedName || 'project');
    const timestamp = new Date().toISOString().split('T')[0];
    let filename = confirmedName ? baseName : `${baseName}_${timestamp}`;
    if (!filename.toLowerCase().endsWith('.vcn')) filename += '.vcn';

    const projectData = {
      version: '1.5',
      app: 'VocalCheckNote',
      projectName: confirmedName,
      theme: AppState.theme,
      offsetMs: AppState.offsetMs,
      lyricsLines: AppState.lyricsLines,
      lyricsText: DOM.lyricsTextarea ? DOM.lyricsTextarea.value : '',
      audioFiles: audioFiles,
      exportedAt: new Date().toISOString()
    };

    const json = JSON.stringify(projectData, null, 2);

    // Strategy 1: Modern File System Access API (Chrome/Edge/Opera)
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: 'Vocal Check Note Project (.vcn)',
            accept: { 'application/json': ['.vcn'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        showToast('プロジェクトを保存しました', 'success');
        return;
      } catch (e) {
        if (e.name === 'AbortError') return; // User cancelled the picker
        console.warn('showSaveFilePicker failed, falling back to classic download', e);
      }
    }

    // Strategy 2: Classic Download Link (Fallback for Firefox/Safari etc.)
    try {
      if (!confirmedName) {
        const userInput = prompt('保存するファイル名を入力してください:', filename.replace('.vcn', ''));
        if (userInput !== null && userInput.trim()) {
          filename = sanitizeFilename(userInput.trim()) + '.vcn';
        } else if (userInput === null) {
          return; // Cancelled
        }
      }

      const blob = new Blob([json], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();

      showToast(`「${filename}」をダウンロードしました`, 'success');

      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 5000);
    } catch (err) {
      console.error('Export failed:', err);
      showToast('保存に失敗しました', 'error');
    }
  }); // End of prompt confirm callback
}


function importProject(file) {
  console.log('--- Import Project Triggered ---', file.name);
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.app !== 'VocalCheckNote') {
        throw new Error('Invalid project file');
      }

      showConfirmModal('現在のデータが上書きされます。\n読み込みますか？', async () => {
        try {
          showToast('プロジェクトを復元しています...', 'info');

          // 1. Reset current state COMPLETELY
          if (AppState.tracks) {
            AppState.tracks.forEach(track => {
              if (track.wavesurfer) track.wavesurfer.destroy();
              if (track.element) track.element.remove();
            });
            AppState.tracks = [];
          }
          await clearFilesFromDB();

          const container = document.getElementById('dynamic-tracks');
          if (container) {
            container.innerHTML = `
              <div id="tracks-inner-container" class="tracks-inner">
                <div id="waveform-timeline" class="waveform-timeline"></div>
                <div id="tracks-list" style="display:flex; flex-direction:column; flex:1;"></div>
              </div>
            `;
          }
          cacheDOMReferences();

          // 2. Restore Audio Tracks from Base64
          if (data.audioFiles && data.audioFiles.length > 0) {
            const masterData = data.audioFiles.find(f => f.role === 'master');
            if (masterData) {
              const res = await fetch(masterData.data);
              const blob = await res.blob();
              const audioFile = new File([blob], masterData.name, { type: masterData.type });
              addTrack(audioFile);
              await new Promise(r => setTimeout(r, 600));
            }

            const others = data.audioFiles.filter(f => f.role !== 'master');
            for (const f of others) {
              const res = await fetch(f.data);
              const blob = await res.blob();
              const audioFile = new File([blob], f.name, { type: f.type });
              addTrack(audioFile);
              await new Promise(r => setTimeout(r, 400));
            }
          }

          // 3. Restore Project Metadata
          AppState.projectName = data.projectName || '';
          if (DOM.projectNameInput) DOM.projectNameInput.value = AppState.projectName;

          AppState.lyricsLines = data.lyricsLines || [];
          if (DOM.lyricsTextarea) DOM.lyricsTextarea.value = data.lyricsText || '';
          AppState.offsetMs = data.offsetMs || 0;
          if (DOM.offsetValue) DOM.offsetValue.value = AppState.offsetMs;

          // 4. Refresh UI
          renderLyricsList();
          if (AppState.lyricsLines.length > 0) {
            setLyricsMode('list');
            setActiveLyrics(0);
            if (DOM.lyricsCount) {
              DOM.lyricsCount.style.display = 'inline';
              DOM.lyricsCount.textContent = `${AppState.lyricsLines.length} 行`;
            }
          } else {
            setLyricsMode('edit');
          }

          updateAllRegions();
          showToast('プロジェクトを完全に復元しました', 'success');
          markDirty();
        } catch (innerErr) {
          console.error('Import restore failed:', innerErr);
          showToast('復元中にエラーが発生しました: ' + innerErr.message, 'error');
        }
      });

    } catch (err) {
      console.error('Import failed:', err);
      showToast('ファイルの読み込みに失敗しました。正しい .vcn ファイルか確認してください', 'error');
    }
  };
  reader.onerror = () => {
    console.error('FileReader error');
    showToast('ファイルの読み取りに失敗しました', 'error');
  };
  reader.readAsText(file);
  // Reset input so importing the same file again works
  if (DOM.vcnImportInput) DOM.vcnImportInput.value = '';
}

// ============================================
//  Utilities
// ============================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
